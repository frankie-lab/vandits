/**
 * Global singleton store for the geocoding (backfill-admin-fks) job.
 * Survives panel/component unmount so the counter persists when the user
 * closes the Geography filter panel. A footer indicator subscribes to this.
 *
 * Persistence: we mirror running/scope/totals to localStorage with a heartbeat
 * so a page refresh can auto-resume the loop (the JS bucle dies on unload but
 * the DB still has pending points). resumeIfPending() must be called once on
 * app mount.
 */
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GeocodingScope {
  /** Restrict the backfill to a single document. Omit to process all of the user's pending points. */
  documentId?: string;
  /** Human-readable label used in toasts (e.g. document filename). */
  label?: string;
  /** Force re-normalize already-geocoded points using the latest canonical rules. */
  forceRenormalize?: boolean;
  /** Backfill mode for `backfill-admin-fks`: 'fill' (default), 'reconcile', 'overwrite'. */
  mode?: 'fill' | 'reconcile' | 'overwrite';
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

const PERSIST_KEY = 'geocoding-job-state';
const HEARTBEAT_STALE_MS = 30_000;

interface PersistedJob {
  running: boolean;
  scope: GeocodingScope | null;
  totalUpdated: number;
  initialPending: number;
  startedAt: number;
  heartbeatAt: number;
}

const persist = (patch: Partial<PersistedJob>) => {
  if (typeof window === 'undefined') return;
  try {
    const prev = readPersisted() ?? {
      running: false,
      scope: null,
      totalUpdated: 0,
      initialPending: 0,
      startedAt: Date.now(),
      heartbeatAt: Date.now(),
    };
    const next = { ...prev, ...patch };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota/serialization errors */
  }
};

const clearPersisted = () => {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(PERSIST_KEY); } catch { /* noop */ }
};

const readPersisted = (): PersistedJob | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedJob;
  } catch {
    return null;
  }
};

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

    persist({
      running: true,
      scope: scope ?? null,
      totalUpdated: 0,
      initialPending,
      startedAt: Date.now(),
      heartbeatAt: Date.now(),
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
              ...(scope?.forceRenormalize ? { force_renormalize: true } : {}),
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
          persist({ totalUpdated, heartbeatAt: Date.now() });

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
        clearPersisted();
      }
    })();

    await runningPromise;
  },
}));

/**
 * Hydrate UI from persisted state and auto-resume the loop if a previous
 * session was still running when the tab unloaded. Call once at app mount.
 *
 * - Fresh heartbeat (<30s): another tab is still running; just mirror the
 *   counters in the UI without launching a second worker.
 * - Stale heartbeat: the previous loop died (refresh / crash). Re-fetch the
 *   real remaining count from the DB and resume.
 */
export async function resumeIfPending(): Promise<void> {
  const persisted = readPersisted();
  if (!persisted || !persisted.running) return;

  const isStale = Date.now() - persisted.heartbeatAt > HEARTBEAT_STALE_MS;

  // Mirror persisted counters immediately so the banner shows "Parar" on first paint.
  useGeocodingJobStore.setState({
    running: true,
    stopping: false,
    totalUpdated: persisted.totalUpdated,
    initialPending: persisted.initialPending,
    remaining: Math.max(0, persisted.initialPending - persisted.totalUpdated),
    scope: persisted.scope,
  });

  if (!isStale) {
    // Another tab owns the worker. Don't launch a duplicate.
    return;
  }

  // Stale: previous worker is dead, re-fetch remaining and resume.
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      // Not logged in — clear stale state, can't resume.
      clearPersisted();
      useGeocodingJobStore.setState({ running: false, scope: null });
      return;
    }

    let q = supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .or('country_id.is.null,continent_id.is.null')
      .is('deleted_at', null)
      .eq('owner_user_id', uid);
    if (persisted.scope?.documentId) q = q.eq('document_id', persisted.scope.documentId);
    const { count } = await q;
    const remaining = count ?? 0;

    if (remaining === 0) {
      clearPersisted();
      useGeocodingJobStore.setState({ running: false, scope: null });
      return;
    }

    // Reset running flag so start() doesn't short-circuit on the persisted mirror.
    useGeocodingJobStore.setState({ running: false });
    void useGeocodingJobStore.getState().start(remaining, persisted.scope ?? undefined);
  } catch (err) {
    console.error('[geocoding-job] resume failed:', err);
    clearPersisted();
    useGeocodingJobStore.setState({ running: false, scope: null });
  }
}
