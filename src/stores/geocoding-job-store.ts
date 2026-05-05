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
  stopping: boolean;
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
  stopping: false,
  totalUpdated: 0,
  remaining: 0,
  initialPending: 0,
  failedThisBatch: 0,
  scope: null,

  stop: () => {
    if (!get().running) return;
    cancelFlag = true;
    set({ stopping: true });
  },

  start: async (initialPending: number, scope?: GeocodingScope) => {
    if (get().running || runningPromise) return;
    cancelFlag = false;
    set({
      running: true,
      stopping: false,
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

        // Single-point loop: process one location per invocation so the UI
        // counter advances point-by-point and "Parar" reacts immediately
        // (cancellation checked between every single geocode).
        // Nominatim's 1 req/sec policy is respected inside the edge function.
        while (true) {
          if (cancelFlag) {
            toast.message(
              `Geocodificación detenida. ${totalUpdated} puntos geocodificados, quedan ${remaining}.`,
            );
            return;
          }

          const { data, error } = await supabase.functions.invoke('backfill-admin-fks', {
            body: {
              limit: 1,
              ...(scope?.documentId ? { document_id: scope.documentId } : {}),
            },
          });

          if (error) {
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

          const d = data as { updated?: number; failed?: number; remaining?: number } | null;
          const upd = d?.updated ?? 0;
          const failed = d?.failed ?? 0;
          if (typeof d?.remaining === 'number') remaining = d.remaining;
          totalUpdated += upd;

          set({ totalUpdated, remaining, failedThisBatch: failed });

          if (remaining === 0) break;
          if (upd === 0 && failed === 0) break;
        }
        toast.success(`Geocodificación completada: ${get().totalUpdated} puntos${ctxLabel}`);
        window.dispatchEvent(new CustomEvent('locations:refresh'));
        window.dispatchEvent(new CustomEvent('locations:changed'));
      } catch (err) {
        console.error('[geocoding-job] failed:', err);
        toast.error('Error al geocodificar puntos');
      } finally {
        set({ running: false, stopping: false, scope: null });
        cancelFlag = false;
        runningPromise = null;
      }
    })();

    await runningPromise;
  },
}));
