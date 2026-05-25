/**
 * EnrichmentLane — visualises the active `enrichment_jobs` session for the
 * current user inside the unified BottomProgressBar.
 *
 * Responsibilities (untouched, just relocated from BottomProgressBar.tsx):
 *   - Poll every 2s + aggregate ALL active jobs of the user into one session
 *     (a single handleEnrich can fan out across multiple documents).
 *   - In-place refresh of locations via trailing-debounce to avoid map flicker.
 *   - Pause / resume / stop broadcasting to every job in the session.
 *   - Flash "completed" badge for 5s when the last job finishes.
 *
 * Visual contract is delegated to <LaneRow/>.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, Pause, Play, Square, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore, loadLocationsFromDatabase } from '@/domains/content';
import { toast } from 'sonner';
import { countErrorBuckets } from '@/domains/content/lib/enrichment-error-kind';
import { LaneRow, type LaneSegment, type LaneMetric } from './LaneRow';
import { awaitMapInteractive } from '@/shared/boot/boot-gate';

interface EnrichmentJob {
  id: string;
  document_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
  total_count: number;
  processed_count: number;
  error_count: number;
  current_location_name: string | null;
  error_messages?: Record<string, unknown> | null;
}

interface EnrichmentSession {
  jobIds: string[];
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
  total_count: number;
  processed_count: number;
  error_count: number;
  current_location_name: string | null;
  error_messages: Record<string, unknown>;
}

function aggregateJobs(jobs: EnrichmentJob[]): EnrichmentSession | null {
  if (jobs.length === 0) return null;
  const merged: Record<string, unknown> = {};
  let total = 0;
  let processed = 0;
  let errors = 0;
  let runningJob: EnrichmentJob | null = null;
  let anyRunning = false;
  let anyPending = false;
  let allPaused = true;
  for (const j of jobs) {
    total += j.total_count || 0;
    processed += j.processed_count || 0;
    errors += j.error_count || 0;
    if (j.error_messages && typeof j.error_messages === 'object') {
      Object.assign(merged, j.error_messages);
    }
    if (j.status === 'running') {
      anyRunning = true;
      allPaused = false;
      if (!runningJob) runningJob = j;
    } else if (j.status === 'pending') {
      anyPending = true;
      allPaused = false;
    } else if (j.status !== 'paused') {
      allPaused = false;
    }
  }
  const status: EnrichmentSession['status'] = anyRunning
    ? 'running'
    : allPaused
      ? 'paused'
      : anyPending
        ? 'pending'
        : 'running';
  return {
    jobIds: jobs.map((j) => j.id),
    status,
    total_count: total,
    processed_count: processed,
    error_count: errors,
    current_location_name: runningJob?.current_location_name ?? null,
    error_messages: merged,
  };
}

function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, '0')}m`;
}

interface EnrichmentLaneProps {
  /** Reports active/visible state so the shell can decide whether to mount the container. */
  onActiveChange?: (active: boolean) => void;
}

export function EnrichmentLane({ onActiveChange }: EnrichmentLaneProps) {
  const { selectedDocument, updateDocumentLocations } = useLocationsStore();
  const [activeJob, setActiveJob] = useState<EnrichmentSession | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const lastProcessedCountRef = useRef(0);
  const etaAnchorRef = useRef<{ startedAt: number; startedCompleted: number } | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const refreshLocations = useCallback(async () => {
    if (!selectedDocument) return;
    const locations = await loadLocationsFromDatabase(selectedDocument.id);
    if (locations.length > 0) {
      updateDocumentLocations(selectedDocument.id, locations);
    }
  }, [selectedDocument, updateDocumentLocations]);

  const scheduleRefreshLocations = useCallback(() => {
    if (refreshTimerRef.current != null) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshLocations();
    }, 1500);
  }, [refreshLocations]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    },
    [],
  );

  // SOT del estado activo en ref — evita que cada `setActiveJob` recree
  // `fetchJobStatus` y por consiguiente el `setInterval` (lo que disparaba
  // un poll inmediato en cada render → tormenta de ~5 req/s sobre
  // enrichment_jobs y saturación HTTP/2 contra v_locations_resolved).
  const activeJobRef = useRef<EnrichmentSession | null>(null);
  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  const fetchJobStatus = useCallback(async () => {
    try {
      const { data: activeJobs, error } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .in('status', ['pending', 'running', 'paused'])
        .order('updated_at', { ascending: false });

      if (error) throw error;

      if (activeJobs && activeJobs.length > 0) {
        const session = aggregateJobs(activeJobs as EnrichmentJob[])!;
        const prevCount = lastProcessedCountRef.current;
        setActiveJob(session);
        if (session.status === 'running' && session.processed_count > prevCount) {
          lastProcessedCountRef.current = session.processed_count;
          scheduleRefreshLocations();
        }
      } else {
        const prev = activeJobRef.current;
        if (prev && prev.status !== 'completed') {
          const { data: recentDone } = await supabase
            .from('enrichment_jobs')
            .select('*')
            .eq('status', 'completed')
            .order('updated_at', { ascending: false })
            .limit(prev.jobIds.length);
          if (recentDone && recentDone.length > 0) {
            const finished = aggregateJobs(recentDone as EnrichmentJob[])!;
            finished.status = 'completed';
            setActiveJob(finished);
            setShowCompleted(true);
            await refreshLocations();
            setTimeout(() => setShowCompleted(false), 5000);
            lastProcessedCountRef.current = 0;
            return;
          }
        }
        setActiveJob(null);
        lastProcessedCountRef.current = 0;
      }
    } catch (err) {
      console.error('Error fetching job status:', err);
    }
  }, [refreshLocations, scheduleRefreshLocations]);

  useEffect(() => {
    let cancelled = false;
    let interval: number | null = null;
    awaitMapInteractive({ idle: true }).then(() => {
      if (cancelled) return;
      fetchJobStatus();
      interval = window.setInterval(fetchJobStatus, 2000);
    });
    return () => {
      cancelled = true;
      if (interval != null) window.clearInterval(interval);
    };
  }, [fetchJobStatus]);

  const broadcastAction = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!activeJob) return;
    await Promise.all(
      activeJob.jobIds.map((jobId) =>
        supabase.functions.invoke('batch-enrich', { body: { action, jobId } }),
      ),
    );
  };

  const handlePause = async () => {
    if (!activeJob) return;
    setActionLoading('pause');
    try {
      await broadcastAction('pause');
      toast.success('Proceso pausado');
      await fetchJobStatus();
    } catch {
      toast.error('Error al pausar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    if (!activeJob) return;
    setActionLoading('resume');
    try {
      await broadcastAction('resume');
      toast.success('Proceso reanudado');
      await fetchJobStatus();
    } catch {
      toast.error('Error al reanudar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    if (!activeJob) return;
    setActionLoading('stop');
    try {
      await broadcastAction('cancel');
      setActiveJob(null);
      toast.success('Proceso detenido');
    } catch {
      toast.error('Error al detener');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDismiss = async () => {
    if (!activeJob) return;
    try {
      await broadcastAction('cancel');
      setActiveJob(null);
      setShowCompleted(false);
    } catch {
      /* noop */
    }
  };

  const isActive = !!activeJob && ['pending', 'running', 'paused'].includes(activeJob.status);
  const isCompleted = activeJob?.status === 'completed' && showCompleted;
  const visible = isActive || isCompleted;
  useEffect(() => {
    onActiveChange?.(visible);
  }, [visible, onActiveChange]);

  // ETA anchor
  const total = activeJob?.total_count ?? 0;
  const enriched = activeJob ? Math.max(0, activeJob.processed_count) : 0;
  const buckets = countErrorBuckets(activeJob?.error_messages ?? {});
  const hardErr = buckets.hard;
  const softErr = buckets.soft;
  const errorTotal = activeJob ? activeJob.error_count : 0;
  const completed = enriched + errorTotal;
  const queue = Math.max(0, total - completed);
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const enrichedPct = total > 0 ? (enriched / total) * 100 : 0;
  const hardPct = total > 0 ? (hardErr / total) * 100 : 0;
  const softPct = total > 0 ? (softErr / total) * 100 : 0;

  useEffect(() => {
    if (!isActive || activeJob?.status !== 'running') {
      if (!isActive) etaAnchorRef.current = null;
      return;
    }
    if (!etaAnchorRef.current) {
      etaAnchorRef.current = { startedAt: Date.now(), startedCompleted: completed };
    }
  }, [isActive, activeJob?.status, completed]);

  let etaMs = 0;
  if (isActive && activeJob?.status === 'running' && etaAnchorRef.current && queue > 0) {
    const elapsed = Date.now() - etaAnchorRef.current.startedAt;
    const delta = completed - etaAnchorRef.current.startedCompleted;
    if (delta > 0 && elapsed > 1500) {
      etaMs = queue / (delta / elapsed);
    }
  }

  if (!visible) return null;

  const isPaused = activeJob?.status === 'paused';
  const isPausedNoCredits =
    isPaused &&
    (activeJob?.error_messages as Record<string, unknown> | undefined)?.__pause_reason === 'no_credits';

  const segments: LaneSegment[] = isCompleted
    ? [{ pct: 100, className: 'bg-gradient-to-r from-emerald-500 to-green-500' }]
    : [
        {
          pct: enrichedPct,
          className: isPaused
            ? 'bg-gradient-to-r from-amber-400 to-amber-500'
            : 'bg-gradient-to-r from-emerald-500 to-green-500',
        },
        { pct: hardPct, className: 'bg-gradient-to-r from-red-500 to-rose-600' },
        { pct: softPct, className: 'bg-gradient-to-r from-amber-400 to-amber-500' },
      ];

  const metrics: LaneMetric[] = [
    { dotClassName: 'bg-red-500', label: 'Errores duros', count: hardErr },
    { dotClassName: 'bg-amber-500', label: 'Sin coincidencia', count: softErr },
    { dotClassName: 'bg-foreground/40', label: 'En cola', count: queue },
  ];

  const iconNode = isCompleted ? (
    <CheckCircle2 className="w-3.5 h-3.5" />
  ) : isPaused ? (
    <AlertTriangle className="w-3.5 h-3.5" />
  ) : activeJob?.status === 'pending' ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
  ) : (
    <Sparkles className="w-3.5 h-3.5" />
  );

  const title = isCompleted
    ? `¡${activeJob!.processed_count} ubicaciones enriquecidas!`
    : isPausedNoCredits
      ? 'Pausado: AI balance agotado'
      : isPaused
        ? 'Enriquecimiento pausado'
        : 'Enriqueciendo ubicaciones';

  const subtitle = isCompleted
    ? undefined
    : isPausedNoCredits
      ? 'Recarga en Settings → Cloud & AI balance y pulsa Reanudar'
      : isPaused
        ? `${queue} pendientes`
        : activeJob?.current_location_name ?? undefined;

  const controls = isCompleted ? (
    <Button size="sm" variant="ghost" onClick={handleDismiss} className="gap-1.5">
      <X className="w-4 h-4" />
      <span className="hidden sm:inline">Cerrar</span>
    </Button>
  ) : (
    <>
      {isPaused ? (
        <Button
          size="sm"
          variant="default"
          onClick={handleResume}
          disabled={actionLoading === 'resume'}
          className="gap-1.5"
        >
          {actionLoading === 'resume' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Reanudar</span>
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={handlePause}
          disabled={actionLoading === 'pause' || activeJob?.status === 'pending'}
          className="gap-1.5"
        >
          {actionLoading === 'pause' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Pause className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Pausar</span>
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={handleStop}
        disabled={!!actionLoading}
        className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        {actionLoading === 'stop' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Square className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Detener</span>
      </Button>
    </>
  );

  return (
    <LaneRow
      iconNode={iconNode}
      iconTone={isCompleted ? 'green' : isPaused ? 'amber' : 'primary'}
      title={title}
      subtitle={subtitle}
      progressPct={isCompleted ? 100 : progress}
      segments={segments}
      metrics={metrics}
      counter={{ done: completed, total }}
      eta={activeJob?.status === 'running' && etaMs > 0 ? formatEta(etaMs) : null}
      controls={controls}
      paused={isPaused}
      running={activeJob?.status === 'running'}
    />
  );
}
