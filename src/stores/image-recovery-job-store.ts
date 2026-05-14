/**
 * image-recovery-job-store — Zustand singleton driving the
 * `recover-missing-images` retroactive image-search job.
 *
 * Why a global store (and not local state in RecoverImagesPanel)?
 *   Like EnrichmentLane / GeocodingLane, this background job must survive
 *   admin-panel unmounts and route changes. The loop lives here so closing
 *   the data-sources panel does NOT abort the job.
 *
 * Note: the loop is client-driven (chains `nextCursor` from the edge fn).
 *   A full page reload still aborts it — same caveat as before, just centralized.
 */
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ImageRecoveryScope = 'all' | 'user' | 'ids';
export type ImageRecoveryMode = 'missing' | 'refresh' | 'full';

export interface ImageRecoveryItemLog {
  id: string;
  name: string | null;
  result: 'found' | 'none' | 'skipped' | 'transient';
  source: string | null;
  durationMs: number;
}

export interface ImageRecoveryStartConfig {
  scope: ImageRecoveryScope;
  // Universo base de la operación. Default 'missing' por compat.
  mode?: ImageRecoveryMode;
  userId?: string;
  locationIds?: string[];
  batchSize: number;
  dryRun: boolean;
  force: boolean;
  retryStaleDays: number;
  // Tope total client-side: cuando `scanned >= maxTotal`, el loop sale.
  maxTotal?: number | null;
  // Franjas geográficas (text match contra locations.continent/country/region/zone)
  continent?: string | null;
  country?: string | null;
  region?: string | null;
  zone?: string | null;
  // Franjas por antigüedad (ISO date strings; se traducen a created_at < / >)
  createdBefore?: string | null;
  createdAfter?: string | null;
}

interface BatchResponse {
  scanned: number;
  updated: number;
  skippedAlreadyAttempted: number;
  failedTransient: number;
  nextCursor: string | null;
  dryRun: boolean;
  items: ImageRecoveryItemLog[];
}

interface ImageRecoveryState {
  running: boolean;
  stopping: boolean;
  config: ImageRecoveryStartConfig | null;
  startedAt: number | null;
  cursor: string | null;
  // Accumulators
  waves: number;
  scanned: number;
  updated: number;
  skippedAlreadyAttempted: number;
  failedTransient: number;
  recentItems: ImageRecoveryItemLog[];
  // Actions
  start: (config: ImageRecoveryStartConfig) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

const INITIAL = {
  running: false,
  stopping: false,
  config: null as ImageRecoveryStartConfig | null,
  startedAt: null as number | null,
  cursor: null as string | null,
  waves: 0,
  scanned: 0,
  updated: 0,
  skippedAlreadyAttempted: 0,
  failedTransient: 0,
  recentItems: [] as ImageRecoveryItemLog[],
};

export const useImageRecoveryJobStore = create<ImageRecoveryState>((set, get) => ({
  ...INITIAL,

  reset: () => {
    if (get().running) return;
    set({ ...INITIAL });
  },

  stop: () => {
    if (!get().running) return;
    set({ stopping: true });
  },

  start: async (config) => {
    if (get().running) return;
    set({
      ...INITIAL,
      running: true,
      stopping: false,
      config,
      startedAt: Date.now(),
    });

    let cursor: string | null = null;
    try {
      while (!get().stopping) {
        const { data, error } = await supabase.functions.invoke<BatchResponse>(
          'recover-missing-images',
          {
            body: {
              scope: config.scope,
              userId: config.scope === 'user' ? config.userId : undefined,
              locationIds: config.scope === 'ids' ? config.locationIds : undefined,
              batchSize: config.batchSize,
              dryRun: config.dryRun,
              force: config.force,
              retryStaleDays: config.retryStaleDays,
              cursor: cursor ?? undefined,
              country: config.country || undefined,
              region: config.region || undefined,
              zone: config.zone || undefined,
              createdBefore: config.createdBefore || undefined,
              createdAfter: config.createdAfter || undefined,
            },
          },
        );

        if (error || !data) {
          toast.error('Error en lote', { description: error?.message ?? 'sin respuesta' });
          break;
        }

        set((s) => ({
          waves: s.waves + 1,
          scanned: s.scanned + data.scanned,
          updated: s.updated + data.updated,
          skippedAlreadyAttempted: s.skippedAlreadyAttempted + data.skippedAlreadyAttempted,
          failedTransient: s.failedTransient + data.failedTransient,
          recentItems: [...data.items, ...s.recentItems].slice(0, 30),
          cursor: data.nextCursor,
        }));

        // Tope total client-side
        if (config.maxTotal != null && config.maxTotal > 0 && get().scanned >= config.maxTotal) {
          toast.success(`Tope alcanzado (${config.maxTotal} POIs)`);
          break;
        }

        if (!data.nextCursor) {
          toast.success(config.dryRun ? 'Dry-run completado' : 'Recuperación completada');
          break;
        }
        cursor = data.nextCursor;
      }
    } finally {
      set({ running: false, stopping: false });
    }
  },
}));
