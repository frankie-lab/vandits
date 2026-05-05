/**
 * Global singleton store for the geocoding (backfill-admin-fks) job.
 * Survives panel/component unmount so the counter persists when the user
 * closes the Geography filter panel. A footer indicator subscribes to this.
 */
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GeocodingScope {
  /** Restrict the backfill to a single document. Omit to process all of the user's pending points. */
  documentId?: string;
  /** Human-readable label used in toasts (e.g. document filename). */
  label?: string;
}

interface GeocodingJobState {
  running: boolean;
  totalUpdated: number;
  remaining: number;
  initialPending: number;
  failedThisBatch: number;
  scope: GeocodingScope | null;
  start: (initialPending: number, scope?: GeocodingScope) => Promise<void>;
  stop: () => void;
}

let cancelFlag = false;
let runningPromise: Promise<void> | null = null;

export const useGeocodingJobStore = create<GeocodingJobState>((set, get) => ({
  running: false,
  totalUpdated: 0,
  remaining: 0,
  initialPending: 0,
  failedThisBatch: 0,
  scope: null,

  stop: () => {
    cancelFlag = true;
  },

  start: async (initialPending: number, scope?: GeocodingScope) => {
    if (get().running || runningPromise) return;
    cancelFlag = false;
    set({
      running: true,
      totalUpdated: 0,
      remaining: initialPending,
      initialPending,
      failedThisBatch: 0,
      scope: scope ?? null,
    });

    const ctxLabel = scope?.label
      ? ` de "${scope.label}"`
      : scope?.documentId
        ? ' del documento'
        : '';

    runningPromise = (async () => {
      try {
        let totalUpdated = 0;
        let remaining = initialPending;
        let failStreak = 0;

        // Parallel workers: each invokes backfill-admin-fks concurrently.
        // The edge function scopes by owner_user_id + document_id and respects
        // Nominatim's 1 req/sec policy *per worker*, so 3 workers ≈ 3 req/sec
        // total, which is the practical safe ceiling without getting blocked.
        const PARALLEL_WORKERS = 3;
        const BATCH_LIMIT = 40;

        while (true) {
          if (cancelFlag) {
            toast.message(
              `Geocodificación detenida. ${totalUpdated} puntos geocodificados, quedan ${remaining}.`,
            );
            return;
          }

          const results = await Promise.all(
            Array.from({ length: PARALLEL_WORKERS }, () =>
              supabase.functions.invoke('backfill-admin-fks', {
                body: {
                  limit: BATCH_LIMIT,
                  ...(scope?.documentId ? { document_id: scope.documentId } : {}),
                },
              }),
            ),
          );

          const anyError = results.some((r) => r.error);
          if (anyError && results.every((r) => r.error)) {
            failStreak++;
            if (failStreak >= 5) {
              toast.error(
                `Geocodificación detenida tras varios errores. ${totalUpdated} geocodificados, quedan ${remaining}.`,
              );
              return;
            }
            continue;
          }
          failStreak = 0;

          let updThisRound = 0;
          let failedThisRound = 0;
          let lastRemaining = remaining;
          for (const r of results) {
            const d = r.data as { updated?: number; failed?: number; remaining?: number } | null;
            if (!d) continue;
            updThisRound += d.updated ?? 0;
            failedThisRound += d.failed ?? 0;
            if (typeof d.remaining === 'number') lastRemaining = d.remaining;
          }
          totalUpdated += updThisRound;
          remaining = lastRemaining;

          set({ totalUpdated, remaining, failedThisBatch: failedThisRound });

          if (remaining === 0) break;
          if (updThisRound === 0 && failedThisRound === 0) break;
        }
        toast.success(`Geocodificación completada: ${get().totalUpdated} puntos${ctxLabel}`);
        window.dispatchEvent(new CustomEvent('locations:refresh'));
        window.dispatchEvent(new CustomEvent('locations:changed'));
      } catch (err) {
        console.error('[geocoding-job] failed:', err);
        toast.error('Error al geocodificar puntos');
      } finally {
        set({ running: false, scope: null });
        cancelFlag = false;
        runningPromise = null;
      }
    })();

    await runningPromise;
  },
}));
