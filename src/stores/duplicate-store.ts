// Centralized duplicate detection store with persistent cache + background deletion queue
import { create } from 'zustand';
import { GeoLocation } from '@/types/location';
import { calculateDistance } from '@/lib/duplicate-detection';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DuplicatePair {
  id: string;
  location1: GeoLocation;
  location2: GeoLocation;
  distance: number;
  similarity: number;
}

interface DeletionQueueItem {
  id: string;
  pairId: string;
  action: 'soft-delete' | 'update';
  locationId: string;
  label: string;
  payload?: Record<string, unknown>;
  status: 'pending' | 'processing' | 'done' | 'error';
}

// Fuzzy string matching
function stringSimilarity(str1: string, str2: string): number {
  const s1 = (str1 || '').toLowerCase().trim();
  const s2 = (str2 || '').toLowerCase().trim();
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.includes(shorter)) return shorter.length / longer.length;

  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) { costs[j] = j; }
      else if (j > 0) {
        let nv = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) nv = Math.min(nv, lastValue, costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = nv;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return 1 - costs[s2.length] / Math.max(s1.length, s2.length);
}

interface DuplicateStore {
  // Cached pairs
  pairs: DuplicatePair[];
  threshold: number;
  lastComputedVersion: number;
  isComputing: boolean;

  // Deletion queue
  deletionQueue: DeletionQueueItem[];
  isProcessingQueue: boolean;

  // Actions
  setThreshold: (t: number) => void;
  recompute: (
    locations: GeoLocation[],
    userId: string | null,
    getOwnership: (locId: string, userId: string) => { isOwn: boolean },
    resolvedPairIds: string[],
    docVersion: number,
  ) => void;

  // Queue actions
  enqueueDeletion: (item: Omit<DeletionQueueItem, 'id' | 'status'>) => void;
  enqueueBatch: (items: Omit<DeletionQueueItem, 'id' | 'status'>[]) => void;
  processQueue: () => Promise<void>;
  clearCompletedFromQueue: () => void;
}

let queueProcessing = false;

export const useDuplicateStore = create<DuplicateStore>((set, get) => ({
  pairs: [],
  threshold: 250,
  lastComputedVersion: -1,
  isComputing: false,

  deletionQueue: [],
  isProcessingQueue: false,

  setThreshold: (t) => set({ threshold: Math.min(t, 1000) }),

  recompute: (locations, userId, getOwnership, resolvedPairIds, docVersion) => {
    const state = get();
    // Skip if already computed for this version + threshold
    if (docVersion === state.lastComputedVersion && state.pairs.length >= 0 && docVersion > 0) {
      // Check if threshold changed — if same, skip
      // We always recompute when called since threshold may have changed
    }

    if (!userId) {
      set({ pairs: [], lastComputedVersion: docVersion });
      return;
    }

    set({ isComputing: true });

    const ownLocations = locations.filter(loc => getOwnership(loc.id, userId).isOwn);

    // Deduplicate by ID
    const seenIds = new Set<string>();
    const myLocations = ownLocations.filter(loc => {
      if (seenIds.has(loc.id)) return false;
      seenIds.add(loc.id);
      return true;
    });

    const threshold = state.threshold;
    const degThreshold = threshold / 111_000;
    const processed = new Set<string>();
    const pairs: DuplicatePair[] = [];

    for (let i = 0; i < myLocations.length; i++) {
      for (let j = i + 1; j < myLocations.length; j++) {
        const loc1 = myLocations[i];
        const loc2 = myLocations[j];

        if (
          Math.abs(loc1.coordinates.lat - loc2.coordinates.lat) > degThreshold ||
          Math.abs(loc1.coordinates.lng - loc2.coordinates.lng) > degThreshold
        ) continue;

        const pairKey = [loc1.id, loc2.id].sort().join('-');
        if (processed.has(pairKey) || resolvedPairIds.includes(pairKey)) continue;

        const distance = calculateDistance(
          loc1.coordinates.lat, loc1.coordinates.lng,
          loc2.coordinates.lat, loc2.coordinates.lng,
        );

        if (distance <= threshold) {
          processed.add(pairKey);
          const name1 = loc1.enrichedData?.nombre_lugar || loc1.name;
          const name2 = loc2.enrichedData?.nombre_lugar || loc2.name;
          pairs.push({
            id: pairKey,
            location1: loc1,
            location2: loc2,
            distance,
            similarity: stringSimilarity(name1, name2),
          });
        }
      }
    }

    // Sort: exact first, then by similarity, then distance
    pairs.sort((a, b) => {
      const aExact = a.distance < 0.5 ? 0 : 1;
      const bExact = b.distance < 0.5 ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      if (Math.abs(a.similarity - b.similarity) > 0.1) return b.similarity - a.similarity;
      return a.distance - b.distance;
    });

    set({ pairs, lastComputedVersion: docVersion, isComputing: false });
  },

  enqueueDeletion: (item) => {
    const entry: DeletionQueueItem = { ...item, id: crypto.randomUUID(), status: 'pending' };
    set(s => ({ deletionQueue: [...s.deletionQueue, entry] }));
    // Auto-process
    get().processQueue();
  },

  enqueueBatch: (items) => {
    const entries = items.map(item => ({
      ...item,
      id: crypto.randomUUID(),
      status: 'pending' as const,
    }));
    set(s => ({ deletionQueue: [...s.deletionQueue, ...entries] }));
    get().processQueue();
  },

  processQueue: async () => {
    if (queueProcessing) return;
    queueProcessing = true;
    set({ isProcessingQueue: true });

    const process = async () => {
      while (true) {
        const state = get();
        const next = state.deletionQueue.find(i => i.status === 'pending');
        if (!next) break;

        // Mark as processing
        set(s => ({
          deletionQueue: s.deletionQueue.map(i =>
            i.id === next.id ? { ...i, status: 'processing' as const } : i
          ),
        }));

        try {
          if (next.action === 'soft-delete') {
            await supabase
              .from('locations')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', next.locationId);
          } else if (next.action === 'update' && next.payload) {
            await supabase
              .from('locations')
              .update(next.payload as any)
              .eq('id', next.locationId);
          }

          set(s => ({
            deletionQueue: s.deletionQueue.map(i =>
              i.id === next.id ? { ...i, status: 'done' as const } : i
            ),
          }));
        } catch (err) {
          console.error('Queue item error:', err);
          set(s => ({
            deletionQueue: s.deletionQueue.map(i =>
              i.id === next.id ? { ...i, status: 'error' as const } : i
            ),
          }));
        }
      }

      // Notify store update once at the end
      window.dispatchEvent(new CustomEvent('store-updated'));
    };

    await process();

    // Clean up done items after a short delay
    setTimeout(() => {
      set(s => ({
        deletionQueue: s.deletionQueue.filter(i => i.status !== 'done'),
      }));
    }, 2000);

    queueProcessing = false;
    set({ isProcessingQueue: false });
  },

  clearCompletedFromQueue: () => {
    set(s => ({
      deletionQueue: s.deletionQueue.filter(i => i.status !== 'done'),
    }));
  },
}));
