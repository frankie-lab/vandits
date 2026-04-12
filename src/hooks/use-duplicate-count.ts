import { useMemo, useState, useEffect } from 'react';
import { useLocationsStore } from '@/store/locations-store';
import { useAuth } from '@/hooks/use-auth';
import { calculateDistance } from '@/lib/duplicate-detection';

/**
 * Single source of truth for duplicate pair count.
 * Used by UserMenu badge, FloatingToolbar badge, and DuplicatesList header.
 * 
 * The threshold is kept in local state and synced via the
 * 'duplicate-threshold-changed' window event so every consumer
 * sees the same number.
 */
export function useDuplicateCount() {
  const { user, profile } = useAuth();
  const getAllLocations = useLocationsStore(s => s.getAllLocations);
  const resolvedDuplicatePairIds = useLocationsStore(s => s.resolvedDuplicatePairIds);
  const docVersion = useLocationsStore(s => s._docVersion);

  // Shared mutable threshold – starts from profile, updated by panel selector
  const [threshold, setThreshold] = useState<number>(
    Math.min(profile?.duplicate_threshold_meters ?? 250, 1000)
  );

  // Sync when profile loads
  useEffect(() => {
    if (profile?.duplicate_threshold_meters !== undefined) {
      setThreshold(Math.min(profile.duplicate_threshold_meters, 1000));
    }
  }, [profile?.duplicate_threshold_meters]);

  // Listen for panel threshold changes
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<{ threshold: number }>).detail?.threshold;
      if (t) setThreshold(Math.min(t, 1000));
    };
    window.addEventListener('duplicate-threshold-changed', handler);
    return () => window.removeEventListener('duplicate-threshold-changed', handler);
  }, []);

  const count = useMemo(() => {
    if (!user) return 0;
    const allLocations = getAllLocations();
    const getOwnership = useLocationsStore.getState().getLocationOwnership;

    const ownLocations = allLocations.filter(
      loc => getOwnership(loc.id, user.id).isOwn
    );

    // Deduplicate by ID
    const seenIds = new Set<string>();
    const myLocations = ownLocations.filter(loc => {
      if (seenIds.has(loc.id)) return false;
      seenIds.add(loc.id);
      return true;
    });

    const processed = new Set<string>();
    let c = 0;
    const degThreshold = threshold / 111_000;

    for (let i = 0; i < myLocations.length; i++) {
      for (let j = i + 1; j < myLocations.length; j++) {
        const loc1 = myLocations[i];
        const loc2 = myLocations[j];

        // Quick bounding-box reject
        if (
          Math.abs(loc1.coordinates.lat - loc2.coordinates.lat) > degThreshold ||
          Math.abs(loc1.coordinates.lng - loc2.coordinates.lng) > degThreshold
        ) continue;

        const pairKey = [loc1.id, loc2.id].sort().join('-');
        if (processed.has(pairKey) || resolvedDuplicatePairIds.includes(pairKey)) continue;

        const distance = calculateDistance(
          loc1.coordinates.lat, loc1.coordinates.lng,
          loc2.coordinates.lat, loc2.coordinates.lng,
        );

        if (distance <= threshold) {
          processed.add(pairKey);
          c++;
        }
      }
    }
    return c;
  }, [getAllLocations, user, threshold, resolvedDuplicatePairIds, docVersion]);

  return { duplicateCount: count, threshold };
}
