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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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

const STEPS: StepInfo[] = [
  { step: 'geocoding', label: 'Geocodificar puntos sin coordenadas', icon: MapPin },
  { step: 'fk-resolve', label: 'Resolver geografía (país/región/zona)', icon: Globe2 },
  { step: 'catalog-match', label: 'Buscar duplicados con tu catálogo', icon: Layers },
  { step: 'enrich', label: 'Enriquecer con IA', icon: Sparkles },
];

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
  const [statuses, setStatuses] = useState<Record<ProcessingStep, StepStatus>>({
    geocoding: 'pending',
    'fk-resolve': 'pending',
    'catalog-match': 'pending',
    enrich: 'pending',
  });
  const [counts, setCounts] = useState<Partial<Record<ProcessingStep, number>>>({});
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    if (!open || !docId) return;
    setStatuses({
      geocoding: 'pending',
      'fk-resolve': 'pending',
      'catalog-match': 'pending',
      enrich: 'pending',
    });
    setCounts({});
    setAllDone(false);

    const onStep = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        docId: string;
        step: ProcessingStep;
        status: StepStatus;
        count?: number;
        matched?: number;
        pending?: number;
      };
      if (detail.docId !== docId) return;
      setStatuses((s) => ({ ...s, [detail.step]: detail.status }));
      if (typeof detail.count === 'number') {
        setCounts((c) => ({ ...c, [detail.step]: detail.count }));
      }
      if (detail.step === 'catalog-match' && typeof detail.matched === 'number') {
        setCounts((c) => ({ ...c, 'catalog-match': detail.matched }));
      }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md z-[2200] bg-background border-2 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            Documento importado
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{docName || fileName}</span>
            <span className="block mt-1 text-xs">
              {pointCount} {pointCount === 1 ? 'punto' : 'puntos'}
              {routeCount > 0 ? `, ${routeCount} ${routeCount === 1 ? 'ruta' : 'rutas'}` : ''}{' '}
              guardados como workspace.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Procesando en background
          </p>
          <ul className="space-y-1.5">
            {STEPS.map(({ step, label, icon: Icon }) => {
              const status = statuses[step];
              const count = counts[step];
              return (
                <li
                  key={step}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-muted/40"
                >
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs flex-1 truncate">{label}</span>
                  {typeof count === 'number' && count > 0 && status === 'done' && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  )}
                  <StatusIcon status={status} />
                </li>
              );
            })}
          </ul>
          {!allDone && (
            <p className="text-[10px] text-muted-foreground pt-1">
              Puedes cerrar este diálogo. El proceso continúa en segundo plano.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={onViewDocument}>Ver documento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
