/**
 * Global singleton store for the geocoding (backfill-admin-fks) job.
 * Survives panel/component unmount so the counter persists when the user
 * closes the Geography filter panel. A footer indicator subscribes to this.
 */
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GeocodingJobState {
  running: boolean;
  totalUpdated: number;
  remaining: number;
  initialPending: number;
  failedThisBatch: number;
  start: (initialPending: number) => Promise<void>;
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

  stop: () => {
    cancelFlag = true;
  },

  start: async (initialPending: number) => {
    if (get().running || runningPromise) return;
    cancelFlag = false;
    set({
      running: true,
      totalUpdated: 0,
      remaining: initialPending,
      initialPending,
      failedThisBatch: 0,
    });

    const t = toast.loading('Geocodificando puntos por coordenadas...');

    runningPromise = (async () => {
      try {
        let totalUpdated = 0;
        let remaining = initialPending;
        let failStreak = 0;

        while (true) {
          if (cancelFlag) {
            toast.message(
              `Detenido por el usuario. Geocodificados ${totalUpdated}, quedan ${remaining}.`,
              { id: t },
            );
            return;
          }
          const { data, error } = await supabase.functions.invoke('backfill-admin-fks', {
            body: { limit: 50 },
          });
          if (error) {
            failStreak++;
            if (failStreak >= 5) {
              toast.error(
                `Detenido tras varios errores. Geocodificados ${totalUpdated}, quedan ${remaining}.`,
                { id: t },
              );
              return;
            }
            continue;
          }
          failStreak = 0;
          const upd = (data as { updated?: number })?.updated ?? 0;
          const failed = (data as { failed?: number })?.failed ?? 0;
          remaining = (data as { remaining?: number })?.remaining ?? 0;
          totalUpdated += upd;

          set({ totalUpdated, remaining, failedThisBatch: failed });

          toast.loading(
            `Geocodificados ${totalUpdated}. Quedan ${remaining}${failed ? ` · ${failed} fallidos este lote` : ''}...`,
            { id: t },
          );
          if (remaining === 0) break;
          if (upd === 0 && failed === 0) break;
        }
        toast.success(`Geocodificación completada: ${get().totalUpdated} puntos`, { id: t });
        window.dispatchEvent(new CustomEvent('locations:refresh'));
      } catch (err) {
        console.error('[geocoding-job] failed:', err);
        toast.error('Error al geocodificar puntos', { id: t });
      } finally {
        set({ running: false });
        cancelFlag = false;
        runningPromise = null;
      }
    })();

    await runningPromise;
  },
}));
