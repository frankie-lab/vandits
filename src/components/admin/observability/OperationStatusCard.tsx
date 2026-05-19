/**
 * OperationStatusCard (PR-BACKOFFICE-UX-CLOSURE-1 — Sec. 4).
 *
 * Tarjeta compacta que muestra el estado y las últimas N ejecuciones de una
 * operación BackOffice. Lee de `useOperationHistory` (localStorage).
 *
 * No introduce schema nuevo. No comparte historial entre operadores.
 * Diseñado para ir DEBAJO del header del panel, junto al EffectBadgeRow.
 */
import { CheckCircle2, AlertCircle, Loader2, Hourglass, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOperationHistory, type OperationStatus } from './useOperationHistory';

const STATUS_META: Record<OperationStatus, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  ok: { label: 'OK', className: 'text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  error: { label: 'Error', className: 'text-destructive', icon: AlertCircle },
  cancelled: { label: 'Cancelado', className: 'text-muted-foreground', icon: AlertCircle },
  running: { label: 'En curso', className: 'text-blue-700 dark:text-blue-300', icon: Loader2 },
};

function fmtDuration(ms?: number): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function fmtAgo(ts?: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'hace unos segundos';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export interface OperationStatusCardProps {
  opKey: string;
  /** Etiqueta humana, ej. "Image recovery". Si se omite, usa opKey. */
  label?: string;
  className?: string;
  /** Compact = una sola línea (default), full = expandido con historial. */
  variant?: 'compact' | 'full';
}

export function OperationStatusCard({ opKey, label, className, variant = 'compact' }: OperationStatusCardProps) {
  const { runs, last, running } = useOperationHistory(opKey);
  const current = running ?? last;
  const Spec = current ? STATUS_META[current.status] : null;
  const Icon = Spec?.icon ?? Hourglass;

  if (!current && variant === 'compact') {
    return (
      <div
        data-operation-card={opKey}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-border/60 bg-muted/20 text-[11px] text-muted-foreground',
          className,
        )}
      >
        <History className="w-3 h-3" />
        <span>Sin ejecuciones registradas en este navegador</span>
      </div>
    );
  }

  return (
    <div
      data-operation-card={opKey}
      data-operation-status={current?.status ?? 'idle'}
      className={cn(
        'rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px]',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            'w-3.5 h-3.5 shrink-0',
            Spec?.className,
            current?.status === 'running' && 'animate-spin',
          )}
        />
        <span className="font-semibold text-foreground truncate">
          {label ?? opKey}
        </span>
        {current && (
          <span className={cn('font-medium', Spec?.className)}>· {Spec?.label}</span>
        )}
        {current && (
          <span className="text-muted-foreground ml-auto">
            {current.status === 'running'
              ? `iniciado ${fmtAgo(current.startedAt)}`
              : `${fmtAgo(current.finishedAt ?? current.startedAt)} · ${fmtDuration(current.durationMs)}`}
          </span>
        )}
      </div>
      {current?.summary && (
        <div className="mt-1 text-muted-foreground truncate" title={current.summary}>
          {current.summary}
        </div>
      )}
      {variant === 'full' && runs.length > 1 && (
        <ul className="mt-2 border-t pt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
          {runs.slice(1).map(r => {
            const RSpec = STATUS_META[r.status];
            const RIcon = RSpec.icon;
            return (
              <li key={r.id} className="flex items-center gap-1.5 text-[10px]">
                <RIcon className={cn('w-3 h-3', RSpec.className)} />
                <span className={cn('font-medium', RSpec.className)}>{RSpec.label}</span>
                <span className="text-muted-foreground">· {fmtAgo(r.finishedAt ?? r.startedAt)}</span>
                <span className="text-muted-foreground">· {fmtDuration(r.durationMs)}</span>
                {r.scope && <span className="text-muted-foreground truncate">· {r.scope}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
