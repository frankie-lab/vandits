/**
 * EffectBadge — Canon semántico de "runtime semantics" para paneles de BackOffice.
 *
 * Cada panel de configuración debe declarar el efecto observable de un cambio.
 * Elimina la percepción placebo: el admin sabe SIEMPRE qué pasa al guardar.
 *
 * Variantes:
 *   - immediate     → afecta runtime al instante (próximo render/llamada)
 *   - future-only   → sólo aplica a datos creados después (no retroactivo)
 *   - recompute     → requiere recompute manual (no se aplica solo)
 *   - deferred      → se aplica vía job en background (cron / queue)
 *   - cache-delay   → afecta runtime pero con TTL de caché (segundos/minutos)
 *
 * Uso:
 *   <EffectBadge kind="immediate" />
 *   <EffectBadge kind="future-only" detail="Aplica al próximo enrichment" />
 */
import { Zap, Clock, RefreshCw, Hourglass, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EffectKind =
  | 'immediate'
  | 'future-only'
  | 'recompute'
  | 'deferred'
  | 'cache-delay';

const META: Record<
  EffectKind,
  { label: string; icon: typeof Zap; tone: string; ring: string }
> = {
  immediate: {
    label: 'Efecto inmediato',
    icon: Zap,
    tone: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300',
    ring: 'border-emerald-500/30',
  },
  'future-only': {
    label: 'Sólo datos futuros',
    icon: Clock,
    tone: 'text-amber-700 bg-amber-500/10 dark:text-amber-300',
    ring: 'border-amber-500/30',
  },
  recompute: {
    label: 'Requiere recompute',
    icon: RefreshCw,
    tone: 'text-orange-700 bg-orange-500/10 dark:text-orange-300',
    ring: 'border-orange-500/30',
  },
  deferred: {
    label: 'Job en background',
    icon: Hourglass,
    tone: 'text-blue-700 bg-blue-500/10 dark:text-blue-300',
    ring: 'border-blue-500/30',
  },
  'cache-delay': {
    label: 'Runtime · delay por caché',
    icon: Database,
    tone: 'text-violet-700 bg-violet-500/10 dark:text-violet-300',
    ring: 'border-violet-500/30',
  },
};

export interface EffectBadgeProps {
  kind: EffectKind;
  detail?: string;
  className?: string;
}

export function EffectBadge({ kind, detail, className }: EffectBadgeProps) {
  const meta = META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium leading-tight',
        meta.tone,
        meta.ring,
        className,
      )}
      title={detail ?? meta.label}
      data-effect-kind={kind}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{meta.label}</span>
      {detail && <span className="opacity-75 font-normal">· {detail}</span>}
    </span>
  );
}
