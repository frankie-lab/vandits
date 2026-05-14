/**
 * image-recovery-job-store — Zustand singleton mirroring the server-side
 * `image_recovery_jobs` row. The actual loop now lives in the
 * `image-recovery-job-tick` edge function (driven by pg_cron), so the job
 * survives F5, tab close, and device changes — same model as `geocoding_jobs`.
 *
 * The store keeps the SAME public shape as before (running, scanned, updated,
 * recentItems, etc.) so RecoverImagesPanel and ImageRecoveryLane don't need to
 * know there's a database behind it. It hydrates once on app mount and stays
 * in sync via Supabase Realtime on `image_recovery_jobs`.
 */
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  mode?: ImageRecoveryMode;
  userId?: string;
  locationIds?: string[];
  batchSize: number;
  dryRun: boolean;
  force: boolean;
  retryStaleDays: number;
  maxTotal?: number | null;
  continent?: string | null;
  country?: string | null;
  region?: string | null;
  zone?: string | null;
  createdBefore?: string | null;
  createdAfter?: string | null;
}

interface ImageRecoveryState {
  jobId: string | null;
  running: boolean;
  stopping: boolean;
  config: ImageRecoveryStartConfig | null;
  startedAt: number | null;
  totalTarget: number | null;
  waves: number;
  scanned: number;
  updated: number;
  noImage: number;
  skippedAlreadyAttempted: number;
  failedTransient: number;
  recentItems: ImageRecoveryItemLog[];
  hydrated: boolean;
  // Actions
  hydrate: () => Promise<void>;
  start: (config: ImageRecoveryStartConfig, totalTarget?: number | null) => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

const INITIAL = {
  jobId: null as string | null,
  running: false,
  stopping: false,
  config: null as ImageRecoveryStartConfig | null,
  startedAt: null as number | null,
  totalTarget: null as number | null,
  waves: 0,
  scanned: 0,
  updated: 0,
  noImage: 0,
  skippedAlreadyAttempted: 0,
  failedTransient: 0,
  recentItems: [] as ImageRecoveryItemLog[],
};

function rowToState(row: any) {
  const scope = (row.scope ?? {}) as Record<string, any>;
  const scopeKind: ImageRecoveryScope =
    Array.isArray(scope.locationIds) && scope.locationIds.length > 0
      ? 'ids'
      : (scope.userId ? 'user' : 'all');
  const config: ImageRecoveryStartConfig = {
    scope: scopeKind,
    mode: row.mode ?? 'missing',
    userId: scope.userId,
    locationIds: scope.locationIds,
    batchSize: row.page_size ?? 50,
    dryRun: !!row.dry_run,
    force: !!row.force,
    retryStaleDays: row.retry_stale_days ?? 30,
    maxTotal: row.max_total ?? null,
    continent: scope.continent ?? null,
    country: scope.country ?? null,
    region: scope.region ?? null,
    zone: scope.zone ?? null,
    createdBefore: scope.createdBefore ?? null,
    createdAfter: scope.createdAfter ?? null,
  };
  const isLive = row.status === 'running' || row.status === 'canceling';
  return {
    jobId: row.id as string,
    running: isLive,
    stopping: row.status === 'canceling',
    config,
    startedAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    totalTarget: row.total_in_scope ?? null,
    waves: row.waves ?? 0,
    scanned: row.scanned ?? 0,
    updated: row.updated ?? 0,
    noImage: row.no_image ?? 0,
    skippedAlreadyAttempted: row.skipped ?? 0,
    failedTransient: row.failed ?? 0,
    recentItems: Array.isArray(row.recent_items) ? row.recent_items : [],
  };
}

let channel: RealtimeChannel | null = null;
let hydratePromise: Promise<void> | null = null;

function subscribeToJob(jobId: string, set: (s: Partial<ImageRecoveryState>) => void, get: () => ImageRecoveryState) {
  if (channel) {
    try { supabase.removeChannel(channel); } catch { /* noop */ }
    channel = null;
  }
  channel = supabase
    .channel(`image_recovery_jobs:${jobId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'image_recovery_jobs', filter: `id=eq.${jobId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as any;
        if (!row) return;
        const prevUpdated = get().updated;
        const next = rowToState(row);
        set(next);
        // Emit a "tick" event when the count of really-updated POIs grows.
        // Listeners (admin panel, counters) can use it to refresh in-place
        // without polling. Only emitted in write mode (dry_run=false) since
        // dry-run never persists to BD.
        const updatedDelta = (next.updated ?? 0) - (prevUpdated ?? 0);
        if (!row.dry_run && updatedDelta > 0 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('lovable:image-recovery-job-tick', {
            detail: { jobId, delta: updatedDelta, total: next.updated },
          }));
        }
        if (row.status === 'done') {
          toast.success(row.dry_run ? 'Dry-run completado' : 'Recuperación completada');
        } else if (row.status === 'canceled') {
          toast.message('Recuperación cancelada');
        } else if (row.status === 'failed') {
          toast.error('Recuperación fallida', { description: row.last_error ?? undefined });
        }
      },
    )
    .subscribe();
}

export const useImageRecoveryJobStore = create<ImageRecoveryState>((set, get) => ({
  ...INITIAL,
  hydrated: false,

  reset: () => {
    if (get().running) return;
    if (channel) {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
      channel = null;
    }
    set({ ...INITIAL, hydrated: get().hydrated });
  },

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        set({ hydrated: true });
        return;
      }
      const { data: rows } = await supabase
        .from('image_recovery_jobs')
        .select('*')
        .eq('user_id', uid)
        .in('status', ['running', 'canceling'])
        .order('created_at', { ascending: false })
        .limit(1);
      const row = rows?.[0];
      if (row) {
        set({ ...rowToState(row), hydrated: true });
        subscribeToJob(row.id, set, get);
      } else {
        set({ hydrated: true });
      }
    })();
    return hydratePromise;
  },

  start: async (config, totalTarget = null) => {
    if (get().running) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      toast.error('Sesión expirada');
      return;
    }

    const fallbackTotal: number | null =
      config.scope === 'ids'
        ? config.locationIds?.length ?? null
        : (config.maxTotal && config.maxTotal > 0 ? config.maxTotal : null);
    const inferredTotal: number | null = totalTarget ?? fallbackTotal;

    const scope: Record<string, any> = {};
    if (config.scope === 'user' && config.userId) scope.userId = config.userId;
    if (config.scope === 'ids' && config.locationIds) scope.locationIds = config.locationIds;
    if (config.continent) scope.continent = config.continent;
    if (config.country) scope.country = config.country;
    if (config.region) scope.region = config.region;
    if (config.zone) scope.zone = config.zone;
    if (config.createdBefore) scope.createdBefore = config.createdBefore;
    if (config.createdAfter) scope.createdAfter = config.createdAfter;

    const { data, error } = await supabase
      .from('image_recovery_jobs')
      .insert({
        user_id: uid,
        created_by: uid,
        status: 'running',
        mode: config.mode ?? 'missing',
        scope,
        dry_run: config.dryRun,
        force: config.force,
        retry_stale_days: config.retryStaleDays,
        page_size: config.batchSize,
        max_total: config.maxTotal ?? null,
        total_in_scope: inferredTotal,
        remaining: inferredTotal,
      })
      .select('*')
      .single();

    if (error || !data) {
      // Most common: a running job already exists for this user (unique idx).
      const msg = error?.message ?? 'no se pudo crear el job';
      if (msg.toLowerCase().includes('image_recovery_jobs_one_active_per_user')) {
        toast.message('Ya hay un job activo. Reanudando seguimiento.');
        await get().hydrate();
      } else {
        toast.error('No se pudo iniciar', { description: msg });
      }
      return;
    }

    set({ ...rowToState(data) });
    subscribeToJob(data.id, set, get);
    toast.success(config.dryRun ? 'Dry-run en marcha' : 'Recuperación iniciada');
  },

  stop: async () => {
    const { jobId, running } = get();
    if (!jobId || !running) return;
    set({ stopping: true });
    const { error } = await supabase.rpc('cancel_image_recovery_job', { _job_id: jobId });
    if (error) {
      toast.error('No se pudo cancelar', { description: error.message });
      set({ stopping: false });
    }
  },
}));
