/**
 * ImageRecoveryLane — visualises the `recover-missing-images` retroactive
 * job inside the unified BottomProgressBar.
 *
 * Reads from a global Zustand store (`useImageRecoveryJobStore`) so the lane
 * stays alive even when the admin panel that triggered the job is closed.
 *
 * METRICS CONTRACT — see `src/stores/image-recovery-job-metrics.ts`.
 *   - Visual bar     = job advance (scanned / totalTarget)
 *   - Highlighted %  = update rate (updated / scanned)
 *   - Subtitle       = absolute outcome counters
 * Both this lane and `RecoverImagesPanel` MUST show identical numbers — they
 * read from the same `getImageRecoveryMetrics(...)` helper.
 */
import { useEffect } from 'react';
import { Image as ImageIcon, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useImageRecoveryJobStore } from '@/stores/image-recovery-job-store';
import { getImageRecoveryMetrics, formatPct } from '@/stores/image-recovery-job-metrics';
import { LaneRow, type LaneSegment, type LaneMetric } from './LaneRow';

interface ImageRecoveryLaneProps {
  onActiveChange?: (active: boolean) => void;
}

export function ImageRecoveryLane({ onActiveChange }: ImageRecoveryLaneProps) {
  const job = useImageRecoveryJobStore();
  const visible = job.running;

  // Hydrate once on mount so a running job is picked up after F5 / device change.
  useEffect(() => {
    void useImageRecoveryJobStore.getState().hydrate();
  }, []);

  useEffect(() => {
    onActiveChange?.(visible);
  }, [visible, onActiveChange]);

  if (!visible) return null;

  const dryRun = job.config?.dryRun ?? false;
  const m = getImageRecoveryMetrics(job);

  // Visual bar = advance (NOT success rate). When totalTarget is unknown we
  // leave the bar at a symbolic value so it doesn't fake progress.
  const barPct = m.progressPct ?? Math.min(95, m.updateRatePct ?? 0);

  const segments: LaneSegment[] = [
    {
      pct: barPct,
      className: dryRun
        ? 'bg-gradient-to-r from-violet-400 to-indigo-500'
        : 'bg-gradient-to-r from-violet-500 to-indigo-600',
    },
  ];

  // Subtitle = absolute outcomes, in the same order as the admin panel.
  const subtitle =
    m.scanned > 0
      ? [
          `${m.updated} actualizados`,
          `${m.noImage} sin imagen`,
          `${m.failed} fallos téc.`,
          `${m.skipped} saltados`,
          `lote ${job.waves}`,
        ].join(' · ')
      : `Lote ${job.waves} · iniciando…`;

  // Title = update rate (the honest "how many POIs were really updated").
  const title = dryRun
    ? `Dry-run · Encontradas ${formatPct(m.updateRatePct)} (${m.updateLabel})`
    : `Actualizadas ${formatPct(m.updateRatePct)} (${m.updateLabel})`;

  const metrics: LaneMetric[] = [
    { dotClassName: 'bg-emerald-500', label: dryRun ? 'Encontrarían' : 'Actualizadas', count: m.updated },
    { dotClassName: 'bg-foreground/40', label: 'Sin imagen', count: m.noImage },
    { dotClassName: 'bg-amber-500', label: 'Fallos técnicos', count: m.failed },
  ];

  const openPanel = () =>
    window.dispatchEvent(new CustomEvent('admin:open-data-sources'));

  const controls = (
    <Button
      size="sm"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation();
        useImageRecoveryJobStore.getState().stop();
      }}
      disabled={job.stopping}
      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
      title="Detener recuperación tras lote actual"
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
      title="Abrir panel de Fuentes de datos"
    >
      <LaneRow
        iconNode={
          job.stopping ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImageIcon className="w-3.5 h-3.5" />
          )
        }
        iconTone="primary"
        title={title}
        subtitle={subtitle}
        progressPct={barPct}
        segments={segments}
        metrics={metrics}
        counter={{ done: m.scanned, total: m.totalTarget ?? m.scanned }}
        eta={null}
        controls={controls}
        running={!job.stopping}
      />
    </div>
  );
}
