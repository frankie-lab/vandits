/**
 * Floating, app-wide indicator for the server-side geocoding job.
 *
 * Lives outside any panel so the user always sees that the job is running,
 * even after closing the admin panel or navigating away. Driven by the same
 * realtime-backed `useGeocodingJobStore` (single source of truth).
 *
 * Click on the body → opens the full Geography admin panel via the
 * `admin:open-geography` window event (handled in `pages/Index.tsx`).
 */
import { Compass, Square, Loader2 } from 'lucide-react';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';
import { computeEta, formatDuration, formatClock } from '@/shared/geography/eta';
import { cn } from '@/lib/utils';

export function GeocodingJobIndicator() {
  const job = useGeocodingJobStore();
  if (!job.running) return null;

  const total = Math.max(1, job.initialPending);
  const done = job.totalUpdated;
  const pct = Math.min(100, Math.round((done / total) * 100));
  const eta = computeEta({
    startedAt: job.startedAt,
    totalUpdated: job.totalUpdated,
    remaining: job.remaining,
  });

  const openPanel = () => {
    window.dispatchEvent(new CustomEvent('admin:open-geography'));
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    void useGeocodingJobStore.getState().stop();
  };

  return (
    <div
      className={cn(
        'fixed z-[1000] bottom-4 right-4',
        'pointer-events-auto select-none',
      )}
      role="status"
      aria-live="polite"
    >
      <div
        onClick={openPanel}
        className={cn(
          'group flex items-center gap-3 cursor-pointer',
          'bg-card/95 backdrop-blur border border-border shadow-lg',
          'rounded-full pl-3 pr-1 py-1',
          'hover:shadow-xl transition-shadow',
        )}
        title="Abrir panel de Geografía"
      >
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/10 text-amber-500">
          {job.stopping ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Compass className="w-3.5 h-3.5" />
          )}
        </div>

        <div className="hidden sm:flex flex-col min-w-[160px] py-0.5">
          <div className="flex items-baseline justify-between gap-2 text-[12px] leading-tight">
            <span className="font-medium text-foreground">
              Geocodificando {done.toLocaleString()} / {job.initialPending.toLocaleString()}
            </span>
            <span className="tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums mt-1">
            {eta.etaMs !== null && eta.finishAt
              ? <>ETA {formatDuration(eta.etaMs)} · ~{formatClock(eta.finishAt)}</>
              : <>Calculando ETA…</>}
          </div>
        </div>

        <div className="sm:hidden text-[11px] tabular-nums font-medium text-foreground pr-1">
          {pct}%
        </div>

        <button
          type="button"
          onClick={handleStop}
          disabled={job.stopping}
          className={cn(
            'ml-1 inline-flex items-center justify-center w-7 h-7 rounded-full',
            'bg-destructive/10 text-destructive hover:bg-destructive/20',
            'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
          )}
          title="Detener geocodificación"
          aria-label="Detener geocodificación"
        >
          <Square className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
