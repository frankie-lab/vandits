/**
 * ImportWizardShell — Carcasa común a las tres vías de importación.
 *
 * Toda vía abierta desde `ImportHub` se monta dentro de este shell:
 *  - Header con icono + título + subtítulo + botón "Volver" al hub.
 *  - Stepper visual (5 pasos canónicos: Fuente · Revisión · Destino · Importar · Resultado).
 *  - Body que delega en la vía concreta.
 *
 * El stepper es informativo: muchas vías existentes gestionan su propio
 * flujo interno y notifican el paso activo. El shell garantiza que las
 * tres vías SE VEN como un único importador.
 *
 * Ver `docs/contracts/import-canon.md` §5 y `mem://logic/import/import-canon`.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const IMPORT_WIZARD_STEPS = [
  { id: 'source', label: 'Fuente' },
  { id: 'review', label: 'Revisión' },
  { id: 'destination', label: 'Destino' },
  { id: 'import', label: 'Importar' },
  { id: 'result', label: 'Resultado' },
] as const;

export type ImportWizardStepId = (typeof IMPORT_WIZARD_STEPS)[number]['id'];

interface ImportWizardShellProps {
  channelId: 'file' | 'web' | 'onedrive';
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
  /** Paso activo (informativo). Por defecto `source`. */
  activeStep?: ImportWizardStepId;
  onBackToHub: () => void;
  children: ReactNode;
}

export function ImportWizardShell({
  channelId,
  icon,
  title,
  subtitle,
  activeStep = 'source',
  onBackToHub,
  children,
}: ImportWizardShellProps) {
  const activeIndex = IMPORT_WIZARD_STEPS.findIndex((s) => s.id === activeStep);

  return (
    <div
      data-import-wizard={channelId}
      className="flex flex-col h-full min-h-0"
    >
      {/* Header */}
      <div className="shrink-0 px-[var(--panel-padding-x)] pt-4 pb-3 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToHub}
            className="h-7 -ml-2 text-muted-foreground hover:text-foreground"
            data-import-back-to-hub
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Importar
          </Button>
        </div>

        <div className="flex items-start gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Stepper */}
        <ol
          className="flex items-center gap-1 text-[10px] font-medium"
          aria-label="Pasos del asistente de importación"
          data-import-stepper="v2"
        >
          {IMPORT_WIZARD_STEPS.map((step, idx) => {
            const isActive = idx === activeIndex;
            const isDone = idx < activeIndex;
            return (
              <li key={step.id} className="flex items-center gap-1 flex-1 min-w-0">
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md min-w-0',
                    isActive && 'bg-primary/10 text-primary',
                    isDone && 'text-foreground/70',
                    !isActive && !isDone && 'text-muted-foreground',
                  )}
                  data-import-step={step.id}
                  data-step-active={isActive ? 'true' : undefined}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center w-4 h-4 rounded-full text-[9px] shrink-0',
                      isActive && 'bg-primary text-primary-foreground',
                      isDone && 'bg-foreground/15',
                      !isActive && !isDone && 'bg-muted',
                    )}
                  >
                    {isDone ? <Check className="w-2.5 h-2.5" /> : idx + 1}
                  </span>
                  <span className="truncate uppercase tracking-wider">
                    {step.label}
                  </span>
                </div>
                {idx < IMPORT_WIZARD_STEPS.length - 1 && (
                  <div className="flex-1 h-px bg-border min-w-[8px]" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}
