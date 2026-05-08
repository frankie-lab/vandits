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

export interface GeocodingScope {
  /** Restrict the backfill to a single document. Omit to process all of the user's pending points. */
  documentId?: string;
  /** Human-readable label used in toasts (e.g. document filename). */
  label?: string;
  /** Force re-normalize already-geocoded points using the latest canonical rules. */
  forceRenormalize?: boolean;
  /** Backfill mode: 'fill' (default), 'reconcile', 'overwrite'. */
  mode?: 'fill' | 'reconcile' | 'overwrite';
  /** Limit to approved/catalog points. */
  catalogOnly?: boolean;
  /** Explicit POI ids to process (overrides dynamic selection). */
  locationIds?: string[];
  /** Admin-area scope (any combination of continent/country/region/zone). */
  adminScope?: GeocodingAdminScope;
}

type JobStatus = 'running' | 'canceling' | 'canceled' | 'completed' | 'failed';

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
  start: (initialPending: number, scope?: GeocodingScope) => Promise<void>;
  stop: () => Promise<void>;
}

let channel: RealtimeChannel | null = null;
let lastNotifiedComplete = false;

function unsubscribe() {
  if (channel) {
    try { supabase.removeChannel(channel); } catch { /* noop */ }
    channel = null;
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
      // Trigger a FULL store reload so the geographic hierarchy (continent /
      // country / region / zone strings cached on each location) reflects the
      // updated FKs in every tree, list and filter. Realtime UPDATEs alone are
      // unreliable at scale and `locations:refresh` was not wired to the
      // database sync hook.
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

  stop: async () => {
    const { jobId, running } = get();
    if (!running || !jobId) return;
    set({ stopping: true });
    const { error } = await supabase
      .from('geocoding_jobs')
      .update({ status: 'canceling' })
      .eq('id', jobId);
    if (error) {
      console.error('[geocoding-job] cancel failed:', error);
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

    // If this user already has an active job, attach to it instead of creating a new one.
    const { data: existing } = await supabase
      .from('geocoding_jobs')
      .select('*')
      .eq('user_id', uid)
      .in('status', ['running', 'canceling'])
      .maybeSingle();

    if (existing) {
      applyRow(existing);
      subscribeToJob(existing.id);
      toast.message('Ya hay una geocodificación en curso. Mostrando progreso.');
      return;
    }

    const insertPayload: Record<string, unknown> = {
      user_id: uid,
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
