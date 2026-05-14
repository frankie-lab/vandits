/**
 * ImageRecoveryLane — visualises the `recover-missing-images` retroactive
 * job inside the unified BottomProgressBar.
 *
 * Mirrors GeocodingLane / EnrichmentLane: reads from a global Zustand store
 * (`useImageRecoveryJobStore`) so the lane stays alive even when the admin
 * panel that triggered the job is closed.
 *
 * Click on the lane → opens the Data Sources admin panel via
 * `admin:open-data-sources` window event (handler lives in Index.tsx).
 */
import { useEffect } from 'react';
import { Image as ImageIcon, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useImageRecoveryJobStore } from '@/stores/image-recovery-job-store';
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
  const scanned = job.scanned;
  const updated = job.updated;
  const skipped = job.skippedAlreadyAttempted;
  const failed = job.failedTransient;
  const total = job.totalTarget;

  // Si conocemos el total objetivo (selección o maxTotal): % real = scanned/total.
  // Si no (scope=user/all sin tope): seguimos con avance simbólico tope 95%.
  const successRate = scanned > 0 ? (updated / scanned) * 100 : 0;
  const donePct = total && total > 0
    ? Math.min(100, (scanned / total) * 100)
    : Math.min(95, successRate);

  const segments: LaneSegment[] = [
    {
      pct: donePct,
      className: dryRun
        ? 'bg-gradient-to-r from-violet-400 to-indigo-500'
        : 'bg-gradient-to-r from-violet-500 to-indigo-600',
    },
  ];

  const metrics: LaneMetric[] = [
    { dotClassName: 'bg-emerald-500', label: dryRun ? 'Encontrarían' : 'Actualizadas', count: updated },
    { dotClassName: 'bg-foreground/40', label: 'Saltadas', count: skipped },
    { dotClassName: 'bg-amber-500', label: 'Errores transitorios', count: failed },
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
        title={dryRun ? 'Recuperando imágenes (dry-run)' : 'Recuperando imágenes faltantes'}
        subtitle={
          scanned > 0
            ? total && total > 0
              ? `${scanned}/${total} escaneados · tasa ${successRate.toFixed(1)}% · lote ${job.waves}`
              : `${scanned} escaneados · tasa ${successRate.toFixed(1)}% · lote ${job.waves}`
            : `Lote ${job.waves} · iniciando…`
        }
        progressPct={donePct}
        segments={segments}
        metrics={metrics}
        counter={total && total > 0 ? { done: scanned, total } : { done: updated, total: scanned }}
        eta={null}
        controls={controls}
        running={!job.stopping}
      />
    </div>
  );
}
