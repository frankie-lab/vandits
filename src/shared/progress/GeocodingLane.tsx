/**
 * GeocodingLane — visualises the active server-side geocoding job
 * (`geocoding_jobs` → `backfill-admin-fks`) inside the unified BottomProgressBar.
 *
 * Replaces the standalone <GeocodingJobIndicator/> pill so the two background
 * jobs (AI enrichment + geo normalization) share the same visual lane shell.
 *
 * The job runs entirely server-side via pg_cron; the user can only Stop. The
 * lane body is clickable to open the full Geography admin panel (same hook as
 * the old indicator: window event 'admin:open-geography').
 */
import { Compass, Loader2, Square } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';
import { computeEta, formatDuration } from '@/shared/geography/eta';
import { LaneRow, type LaneSegment, type LaneMetric } from './LaneRow';

interface GeocodingLaneProps {
  onActiveChange?: (active: boolean) => void;
}

export function GeocodingLane({ onActiveChange }: GeocodingLaneProps) {
  const job = useGeocodingJobStore();
  const visible = job.running;

  useEffect(() => {
    onActiveChange?.(visible);
  }, [visible, onActiveChange]);

  if (!visible) return null;

  const total = Math.max(1, job.initialPending);
  const done = job.totalProcessed;
  const failed = job.failedThisBatch;
  const queue = Math.max(0, total - done);
  const donePct = (done / total) * 100;
  const failedPct = (failed / total) * 100;

  const eta = computeEta({
    startedAt: job.startedAt,
    totalProcessed: job.totalProcessed,
    remaining: job.remaining,
  });

  const segments: LaneSegment[] = [
    { pct: donePct, className: 'bg-gradient-to-r from-amber-500 to-orange-500' },
    { pct: failedPct, className: 'bg-gradient-to-r from-red-500 to-rose-600' },
  ];

  const metrics: LaneMetric[] = [
    { dotClassName: 'bg-red-500', label: 'Fallos', count: failed },
    { dotClassName: 'bg-foreground/40', label: 'En cola', count: queue },
  ];

  const openPanel = () =>
    window.dispatchEvent(new CustomEvent('admin:open-geography'));

  const controls = (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => void useGeocodingJobStore.getState().stop()}
      disabled={job.stopping}
      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
      title="Detener geocodificación"
    >
      {job.stopping ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Square className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">Detener</span>
    </Button>
  );

  return (
    <div
      onClick={openPanel}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openPanel();
      }}
      className="cursor-pointer hover:bg-muted/40 transition-colors"
      title="Abrir panel de Geografía"
    >
      <LaneRow
        iconNode={
          job.stopping ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Compass className="w-3.5 h-3.5" />
          )
        }
        iconTone="amber"
        title={(() => {
          // PR-4A.3a: si el job nace de la consola de salud, prefijar el título.
          if (job.scope?.source === 'health_cta') {
            const cleanLabel = job.scope?.label?.replace(/^health-cta:\s*/i, '');
            return cleanLabel
              ? `Reparación de salud · ${cleanLabel}`
              : 'Reparación de salud';
          }
          return job.scope?.label
            ? `Normalización geográfica · ${job.scope.label}`
            : 'Normalización geográfica';
        })()}
        subtitle={
          eta.etaMs !== null
            ? `ETA ${formatDuration(eta.etaMs)} · servidor`
            : 'Calculando ETA… · servidor'
        }
        progressPct={donePct + failedPct}
        segments={segments}
        metrics={metrics}
        counter={{ done, total: job.initialPending }}
        eta={null /* subtitle ya lo expone */}
        controls={controls}
        running={!job.stopping}
      />
    </div>
  );
}
