// Domain: Content — Non-blocking summary dialog shown right after a document
// is saved. Lists background processing steps with live status from
// `document:processing-step` and `document:processed` events emitted by
// `processImportedDocument`.
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  Loader2,
  Circle,
  AlertTriangle,
  MinusCircle,
  MapPin,
  Globe2,
  Layers,
  Sparkles,
  FileText,
  Route as RouteIcon,
} from 'lucide-react';
import type {
  ProcessingStep,
  StepStatus,
} from '@/domains/content/lib/process-imported-document';

interface ImportSummaryDialogProps {
  open: boolean;
  docId: string | null;
  docName: string | null;
  pointCount: number;
  routeCount: number;
  fileName: string | null;
  onOpenChange: (open: boolean) => void;
  onViewDocument: () => void;
}

interface StepInfo {
  step: ProcessingStep;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface StepProgress {
  status: StepStatus;
  total: number;
  processed: number;
  count?: number;
}

const STEPS: StepInfo[] = [
  { step: 'geocoding', label: 'Obtener coordenadas (puntos sin lat/lng)', icon: MapPin },
  { step: 'fk-resolve', label: 'Clasificar por país/región/zona', icon: Globe2 },
  { step: 'catalog-match', label: 'Buscar duplicados en tu catálogo', icon: Layers },
  { step: 'enrich', label: 'Enriquecer con IA', icon: Sparkles },
];

const initialProgress = (): Record<ProcessingStep, StepProgress> => ({
  geocoding: { status: 'pending', total: 0, processed: 0 },
  'fk-resolve': { status: 'pending', total: 0, processed: 0 },
  'catalog-match': { status: 'pending', total: 0, processed: 0 },
  enrich: { status: 'pending', total: 0, processed: 0 },
});

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
  if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'skipped') return <MinusCircle className="w-4 h-4 text-muted-foreground" />;
  if (status === 'error') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <Circle className="w-4 h-4 text-muted-foreground/40" />;
}

export function ImportSummaryDialog({
  open,
  docId,
  docName,
  pointCount,
  routeCount,
  fileName,
  onOpenChange,
  onViewDocument,
}: ImportSummaryDialogProps) {
  const [progress, setProgress] = useState<Record<ProcessingStep, StepProgress>>(initialProgress);
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    if (!open || !docId) return;
    setProgress(initialProgress());
    setAllDone(false);

    const onStep = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        docId: string;
        step: ProcessingStep;
        status: StepStatus;
        count?: number;
        total?: number;
        processed?: number;
        matched?: number;
      };
      if (detail.docId !== docId) return;
      setProgress((p) => {
        const prev = p[detail.step];
        return {
          ...p,
          [detail.step]: {
            status: detail.status,
            total: typeof detail.total === 'number' ? detail.total : prev.total,
            processed:
              typeof detail.processed === 'number' ? detail.processed : prev.processed,
            count:
              typeof detail.matched === 'number'
                ? detail.matched
                : typeof detail.count === 'number'
                ? detail.count
                : prev.count,
          },
        };
      });
    };
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent).detail as { docId: string };
      if (detail.docId !== docId) return;
      setAllDone(true);
    };

    window.addEventListener('document:processing-step', onStep);
    window.addEventListener('document:processed', onDone);
    return () => {
      window.removeEventListener('document:processing-step', onStep);
      window.removeEventListener('document:processed', onDone);
    };
  }, [open, docId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (allDone || !o === false) { /* allow only when done */ } if (allDone) onOpenChange(o); }}>
      <DialogContent
        className="sm:max-w-lg z-[2200] bg-background border-2 shadow-2xl [&>button]:hidden"
        onPointerDownOutside={(e) => { if (!allDone) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!allDone) e.preventDefault(); }}
        onInteractOutside={(e) => { if (!allDone) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            Documento importado
          </DialogTitle>
        </DialogHeader>

        {/* Resumen destacado */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold truncate">{docName || fileName}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-background border px-3 py-2">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xl font-bold tabular-nums leading-none">{pointCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                  {pointCount === 1 ? 'Punto' : 'Puntos'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background border px-3 py-2">
              <RouteIcon className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xl font-bold tabular-nums leading-none">{routeCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                  {routeCount === 1 ? 'Ruta' : 'Rutas'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Procesamiento - solo si hay algo en marcha o completo */}
        {!allDone && (
          <div className="space-y-2.5 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Procesando en background
            </p>
            <ul className="space-y-2.5">
              {STEPS.map(({ step, label, icon: Icon }) => {
                const { status, total, processed, count } = progress[step];
                const isActive = status === 'running' || status === 'done';
                const pct =
                  status === 'done'
                    ? 100
                    : total > 0
                    ? Math.min(100, Math.round((processed / total) * 100))
                    : status === 'running'
                    ? 5
                    : 0;
                const showCounter = isActive && total > 0;
                return (
                  <li key={step} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs flex-1 truncate">{label}</span>
                      {showCounter && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {status === 'done'
                            ? typeof count === 'number'
                              ? `${count} / ${total}`
                              : `${total} / ${total}`
                            : `${processed} / ${total}`}
                        </span>
                      )}
                      <StatusIcon status={status} />
                    </div>
                    <Progress
                      value={pct}
                      className={`h-1.5 ${
                        status === 'pending'
                          ? 'opacity-30'
                          : status === 'skipped'
                          ? 'opacity-20'
                          : ''
                      }`}
                    />
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-muted-foreground pt-1">
              Puedes cerrar este diálogo. El proceso continúa en segundo plano.
            </p>
          </div>
        )}

        {allDone && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-foreground">
              Procesamiento completado.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!allDone}>
            Cerrar
          </Button>
          <Button onClick={onViewDocument} disabled={!allDone}>Ver documento</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
