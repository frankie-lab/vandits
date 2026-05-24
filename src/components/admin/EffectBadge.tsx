/**
 * EffectBadge (PR-BACKOFFICE-UX-CLOSURE-1 — Sec. 3).
 *
 * Componente único para señalizar el efecto operativo de un panel o
 * capability. Reemplaza textos sueltos por una taxonomía cerrada.
 *
 * Kinds canónicos:
 *   - immediate     → aplica al instante a todos
 *   - future-only   → sólo afecta datos futuros
 *   - recompute     → requiere recompute manual posterior
 *   - deferred      → dispara un job en background
 *   - batch         → operación batch (muchos items)
 *   - destructive   → borra/altera datos de forma irreversible
 *   - global        → afecta a todos los usuarios
 *   - read-only     → no muta nada
 *   - internal      → tooling interno (master-only)
 *
 * Uso:
 *   <EffectBadgeRow effects={['deferred','batch','global']} />
 *
 * O derivado desde una capability:
 *   <EffectBadgeRow effects={effectsForCapability('run_geo_backfill')} />
 */
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Zap,
  Clock,
  RotateCw,
  Hourglass,
  Layers,
  AlertTriangle,
  Globe,
  Eye,
  Wrench,
} from 'lucide-react';
import type { Capability } from '@/domains/identity/capabilities';
import { CAPABILITY_META } from './permissions/capability-metadata';

export type EffectKind =
  | 'immediate'
  | 'future-only'
  | 'recompute'
  | 'deferred'
  | 'batch'
  | 'destructive'
  | 'global'
  | 'read-only'
  | 'internal';

interface EffectSpec {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}

const SPEC: Record<EffectKind, EffectSpec> = {
  immediate: {
    label: 'efecto inmediato',
    description: 'El cambio aplica al instante y se propaga a la siguiente lectura.',
    icon: Zap,
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  'future-only': {
    label: 'sólo datos futuros',
    description: 'No reescribe datos existentes; sólo afecta a contenido creado a partir de ahora.',
    icon: Clock,
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  recompute: {
    label: 'requiere recompute',
    description: 'El cambio queda persistido pero exige una operación posterior para reflejarse.',
    icon: RotateCw,
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  deferred: {
    label: 'job en background',
    description: 'Lanza un job asíncrono. El resultado aparece cuando el job termina.',
    icon: Hourglass,
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  },
  batch: {
    label: 'batch',
    description: 'Operación batch sobre muchos items a la vez.',
    icon: Layers,
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  },
  destructive: {
    label: 'destructive',
    description: 'Borra o altera datos de forma irreversible. Sin rollback automático.',
    icon: AlertTriangle,
    className: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  global: {
    label: 'global',
    description: 'Afecta a todos los usuarios del sistema, no sólo al operador.',
    icon: Globe,
    className: 'bg-primary/10 text-primary border-primary/30',
  },
  'read-only': {
    label: 'read-only',
    description: 'Esta superficie no muta datos: sólo inspecciona o reporta.',
    icon: Eye,
    className: 'bg-muted text-muted-foreground border-border',
  },
  internal: {
    label: 'internal',
    description: 'Tooling interno (master-only). No forma parte del flujo operativo normal.',
    icon: Wrench,
    className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30',
  },
};

export function EffectBadge({ kind, className }: { kind: EffectKind; className?: string }) {
  const spec = SPEC[kind];
  const Icon = spec.icon;
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-effect-badge={kind}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium leading-none',
              spec.className,
              className,
            )}
          >
            <Icon className="w-3 h-3" />
            {spec.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {spec.description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EffectBadgeRow({
  effects,
  className,
}: {
  effects: readonly EffectKind[];
  className?: string;
}) {
  if (effects.length === 0) return null;
  // Dedupe preservando orden.
  const seen = new Set<EffectKind>();
  const unique = effects.filter(e => (seen.has(e) ? false : (seen.add(e), true)));
  return (
    <div
      data-effect-row
      className={cn('flex flex-wrap items-center gap-1.5 py-1', className)}
    >
      {unique.map(e => (
        <EffectBadge key={e} kind={e} />
      ))}
    </div>
  );
}

/**
 * Deriva los effects estándar de una capability a partir de su metadata.
 * Usado por la matriz RBAC para mostrar señales consistentes por fila.
 */
export function effectsForCapability(cap: Capability): EffectKind[] {
  const meta = CAPABILITY_META[cap];
  if (!meta) return [];
  const out: EffectKind[] = [];
  switch (meta.runtime) {
    case 'immediate': out.push('immediate'); break;
    case 'future-only': out.push('future-only'); break;
    case 'recompute': out.push('recompute'); break;
    case 'deferred': out.push('deferred', 'batch'); break;
    case 'none': out.push('read-only'); break;
  }
  if (meta.destructive) out.push('destructive');
  if (meta.internal) out.push('internal');
  return out;
}
