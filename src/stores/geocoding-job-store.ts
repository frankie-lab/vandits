/**
 * Global singleton store for the geocoding (backfill-admin-fks) job.
 *
 * Architecture (v2 — server-side):
 *  - The job runs on the server: a `geocoding_jobs` row drives a pg_cron
 *    that ticks `geocoding-job-tick` every minute. The browser is no longer
 *    needed once the job is created. Closing the tab / shutting the laptop
 *    does NOT pause progress.
 *  - The client only: (1) inserts the job row, (2) subscribes to it via
 *    realtime to mirror counters in the UI, (3) sets `status='canceling'`
 *    when the user clicks Stop.
 */
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface GeocodingAdminScope {
  continent_id?: string;
  country_id?: string;
  region_id?: string;
  zone_id?: string;
}

export interface GeocodingGeoNode {
  continent?: string | null;
  country?: string | null;
  region?: string | null;
  zone?: string | null;
  admin_level_3?: string | null;
  locality?: string | null;
  sublocality?: string | null;
}

export type GeoHealth = 'empty' | 'broken' | 'partial' | 'stale_name' | 'ok';

export interface GeocodingScope {
  documentId?: string;
  label?: string;
  forceRenormalize?: boolean;
  mode?: 'fill' | 'reconcile' | 'overwrite' | 'repair';
  catalogOnly?: boolean;
  locationIds?: string[];
  adminScope?: GeocodingAdminScope;
  targetUserId?: string;
  /** Unified health-based scope. Same source of truth as the panel's tabs/tree. */
  healthFilter?: GeoHealth[];
  geoNode?: GeocodingGeoNode;
}

type JobStatus = 'running' | 'canceling' | 'canceled' | 'completed' | 'failed';

export interface GeocodingJobLastResult {
  finishedAt: number;
  status: 'completed' | 'canceled' | 'failed';
  mode: string;
  label?: string;
  totalProcessed: number;
  totalUpdated: number;
  failed: number;
  durationMs: number;
  initialPending: number;
}

interface GeocodingJobState {
  running: boolean;
  stopping: boolean;
  jobId: string | null;
  status: JobStatus | null;
  totalProcessed: number;
  totalUpdated: number;
  remaining: number;
  initialPending: number;
  failedThisBatch: number;
  scope: GeocodingScope | null;
  startedAt: number | null;
  lastResult: GeocodingJobLastResult | null;
  start: (initialPending: number, scope?: GeocodingScope) => Promise<void>;
  stop: () => Promise<void>;
  clearLastResult: () => void;
}

let channel: RealtimeChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastNotifiedComplete = false;

function unsubscribe() {
  if (channel) {
    try { supabase.removeChannel(channel); } catch { /* noop */ }
    channel = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function applyRow(row: Record<string, any>) {
  const status = row.status as JobStatus;
  const isActive = status === 'running' || status === 'canceling';
  const totalInScope = row.total_in_scope ?? 0;

  useGeocodingJobStore.setState({
    jobId: row.id,
    status,
    running: isActive,
    stopping: status === 'canceling',
    totalProcessed: row.processed ?? 0,
    totalUpdated: row.updated ?? 0,
    failedThisBatch: row.failed ?? 0,
    remaining: row.remaining ?? Math.max(0, totalInScope - (row.processed ?? 0)),
    initialPending: totalInScope || (row.processed ?? 0) + (row.remaining ?? 0),
    scope: {
      documentId: row.document_id ?? undefined,
      label: row.label ?? undefined,
      mode: row.mode ?? 'fill',
      catalogOnly: row.catalog_only ?? false,
    },
    startedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  });

  if (!isActive) {
    const startedAtMs = row.created_at ? new Date(row.created_at).getTime() : Date.now();
    const finishedAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
    if (status === 'completed' || status === 'canceled' || status === 'failed') {
      useGeocodingJobStore.setState({
        lastResult: {
          finishedAt,
          status,
          mode: row.mode ?? 'fill',
          label: row.label ?? undefined,
          totalProcessed: row.processed ?? 0,
          totalUpdated: row.updated ?? 0,
          failed: row.failed ?? 0,
          durationMs: Math.max(0, finishedAt - startedAtMs),
          initialPending: totalInScope || (row.processed ?? 0),
        },
      });
    }
    if (status === 'completed' && !lastNotifiedComplete) {
      lastNotifiedComplete = true;
      const updated = row.updated ?? 0;
      const processed = row.processed ?? 0;
      toast.success(
        updated > 0
          ? `Geocodificación completada: ${updated} de ${processed} puntos actualizados. La jerarquía se ha refrescado en el mapa y en "Buscar y Filtrar".`
          : `Geocodificación completada: ${processed} puntos revisados, ninguno necesitaba cambios.`,
        { duration: 6000 },
      );
      window.dispatchEvent(new CustomEvent('reload-locations'));
      window.dispatchEvent(new CustomEvent('locations:refresh'));
      window.dispatchEvent(new CustomEvent('locations:changed'));
    } else if (status === 'canceled') {
      toast.message(`Geocodificación detenida. ${row.updated ?? 0} actualizados.`);
      window.dispatchEvent(new CustomEvent('reload-locations'));
    } else if (status === 'failed') {
      toast.error('La geocodificación falló. Revisa el panel de geografía.');
    }
    unsubscribe();
  }
}

function subscribeToJob(jobId: string) {
  unsubscribe();
  lastNotifiedComplete = false;
  channel = supabase
    .channel(`geocoding-job-${jobId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'geocoding_jobs', filter: `id=eq.${jobId}` },
      (payload) => applyRow(payload.new as Record<string, any>),
    )
    .subscribe();

  pollTimer = setInterval(async () => {
    const { data: row, error } = await supabase
      .from('geocoding_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) {
      console.warn('[geocoding-job] poll sync failed:', error.message);
      return;
    }
    if (row) applyRow(row);
  }, 5000);
}

export const useGeocodingJobStore = create<GeocodingJobState>((set, get) => ({
  running: false,
  stopping: false,
  jobId: null,
  status: null,
  totalProcessed: 0,
  totalUpdated: 0,
  remaining: 0,
  initialPending: 0,
  failedThisBatch: 0,
  scope: null,
  startedAt: null,
  lastResult: null,

  clearLastResult: () => set({ lastResult: null }),


  stop: async () => {
    const { jobId, running } = get();
    if (!running || !jobId) {
      console.warn('[geocoding-job] stop ignored: no active job', { jobId, running });
      return;
    }
    set({ stopping: true });
    try {
      // Use SECURITY DEFINER RPC so cancel works even when the regular
      // UPDATE policy would be filtered (cross-user admin cancellations,
      // edge cases, etc.). RPC also returns affected row count so we can
      // confirm the cancel landed in the DB.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('cancel_geocoding_job', {
        _job_id: jobId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const updated = (row?.updated_count ?? 0) as number;
      if (updated === 0) {
        console.warn('[geocoding-job] cancel returned 0 rows', { jobId, row });
        toast.message('El trabajo ya había terminado o no se encontró.');
        set({ stopping: false });
        return;
      }
      toast.message('Deteniendo… puede tardar unos segundos en reaccionar.');
    } catch (err) {
      console.error('[geocoding-job] cancel failed:', err);
      toast.error('No se pudo detener la geocodificación.');
      set({ stopping: false });
    }
  },

  start: async (initialPending: number, scope?: GeocodingScope) => {
    if (get().running) return;

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      toast.error('Debes iniciar sesión para geocodificar.');
      return;
    }

    const mode = scope?.mode ?? (scope?.forceRenormalize ? 'overwrite' : 'fill');
    const ownerId = scope?.targetUserId ?? uid;
    const isCrossUser = ownerId !== uid;

    // If the target user already has an active job, attach to it (admins included).
    const { data: existing } = await supabase
      .from('geocoding_jobs')
      .select('*')
      .eq('user_id', ownerId)
      .in('status', ['running', 'canceling'])
      .maybeSingle();

    if (existing) {
      applyRow(existing);
      subscribeToJob(existing.id);
      toast.message(
        isCrossUser
          ? 'Ese usuario ya tiene una geocodificación en curso. Mostrando progreso.'
          : 'Ya hay una geocodificación en curso. Mostrando progreso.',
      );
      return;
    }

    const insertPayload: Record<string, unknown> = {
      user_id: ownerId,
      created_by: uid,
      status: 'running',
      mode,
      catalog_only: !!scope?.catalogOnly,
      scope: scope ? (scope as unknown as Record<string, unknown>) : {},
    };
    if (scope?.documentId) insertPayload.document_id = scope.documentId;
    if (scope?.label) insertPayload.label = scope.label;
    if (scope?.locationIds && scope.locationIds.length > 0) {
      insertPayload.location_ids = scope.locationIds;
    }
    if (scope?.adminScope && Object.values(scope.adminScope).some(Boolean)) {
      insertPayload.admin_scope = scope.adminScope;
    }
    if (initialPending > 0) {
      insertPayload.total_in_scope = initialPending;
      insertPayload.remaining = initialPending;
    }

    const { data: created, error } = await supabase
      .from('geocoding_jobs')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insertPayload as any)
      .select()
      .single();

    if (error || !created) {
      console.error('[geocoding-job] insert failed:', error);
      toast.error('No se pudo iniciar la geocodificación.');
      return;
    }

    applyRow(created);
    subscribeToJob(created.id);

    // Trigger a tick immediately so the user sees progress without waiting for cron.
    void supabase.functions.invoke('geocoding-job-tick', { body: {} }).catch(() => { /* noop */ });

    toast.message(
      `Geocodificación lanzada. Continúa en segundo plano${scope?.label ? ` (${scope.label})` : ''}.`,
    );
  },
}));

/**
 * Hydrate the store on app mount: if the user already has an active job
 * (because they closed the tab earlier and reopened), surface it in the UI.
 */
export async function resumeIfPending(): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;

    const { data: row } = await supabase
      .from('geocoding_jobs')
      .select('*')
      .eq('user_id', uid)
      .in('status', ['running', 'canceling'])
      .maybeSingle();

    if (row) {
      applyRow(row);
      subscribeToJob(row.id);
    }
  } catch (err) {
    console.error('[geocoding-job] resume failed:', err);
  }
}
