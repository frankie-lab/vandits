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
import { getImageRecoveryMetrics } from '@/stores/image-recovery-job-metrics';
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

  // Barra segmentada sobre el total a procesar:
  //   verde  = updated  / totalTarget
  //   rojo   = (noImage + failed) / totalTarget
  //   resto  = pendiente
  // Si totalTarget es desconocido, fallback a un único segmento de avance.
  const failedTotal = m.noImage + m.failed;
  const hasTotal = m.totalTarget != null && m.totalTarget > 0;
  const successPct = hasTotal ? (m.updated / (m.totalTarget as number)) * 100 : 0;
  const failPct = hasTotal ? (failedTotal / (m.totalTarget as number)) * 100 : 0;
  const barPct = hasTotal
    ? Math.min(100, successPct + failPct)
    : (m.progressPct ?? Math.min(95, m.updateRatePct ?? 0));

  const segments: LaneSegment[] = hasTotal
    ? [
        {
          pct: successPct,
          className: dryRun
            ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
            : 'bg-gradient-to-r from-emerald-500 to-emerald-600',
        },
        {
          pct: failPct,
          className: 'bg-gradient-to-r from-destructive/80 to-destructive',
        },
      ]
    : [
        {
          pct: barPct,
          className: dryRun
            ? 'bg-gradient-to-r from-violet-400 to-indigo-500'
            : 'bg-gradient-to-r from-violet-500 to-indigo-600',
        },
      ];

  // Subtítulo: éxito · fallidos · lote (saltados solo si > 0).
  const subtitleParts = [
    `${m.updated} éxito`,
    `${failedTotal} fallidos`,
  ];
  if (m.skipped > 0) subtitleParts.push(`${m.skipped} saltados`);
  subtitleParts.push(`lote ${job.waves}`);
  const subtitle =
    m.scanned > 0 ? subtitleParts.join(' · ') : `Lote ${job.waves} · iniciando…`;

  // Título: avance honesto (procesados / total).
  const title = dryRun
    ? `Dry-run · ${m.progressLabel} procesados`
    : `Recuperación · ${m.progressLabel} procesados`;

  const metrics: LaneMetric[] = [
    { dotClassName: 'bg-emerald-500', label: dryRun ? 'Encontrarían' : 'Éxito', count: m.updated },
    { dotClassName: 'bg-destructive', label: 'Fallidos', count: failedTotal },
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
