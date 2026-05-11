/**
 * AppEmptyState — Estado vacío canónico para TODA la app.
 *
 * Wrapper sobre `PanelEmptyState` pensado para usarse FUERA de un PanelShell
 * (vistas inline, listas, secciones de mapa). Misma estructura y tokens.
 *
 * Estructura obligatoria: icon + title + (opcional) description + (opcional)
 * action. La regla "icon+title obligatorios" se valida en DEV.
 *
 * Para uso dentro de un PanelShell sigue usando `PanelEmptyState`.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AppEmptyStateProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Single primary CTA. Do not duplicate. */
  action?: React.ReactNode;
  /** Optional row of meta chips below the description. */
  meta?: React.ReactNode;
  /** Compact variant for tight spaces (sub-tabs, small cards). */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_TOKENS: Record<NonNullable<AppEmptyStateProps['size']>, { padding: string; minH: string; iconBox: string; maxW: string }> = {
  sm: { padding: 'p-4', minH: 'min-h-[140px]', iconBox: 'w-8 h-8', maxW: 'max-w-[220px]' },
  md: { padding: 'p-6', minH: 'min-h-[200px]', iconBox: 'w-10 h-10', maxW: 'max-w-[260px]' },
  lg: { padding: 'p-8', minH: 'min-h-[280px]', iconBox: 'w-12 h-12', maxW: 'max-w-[320px]' },
};

export function AppEmptyState({
  icon,
  title,
  description,
  action,
  meta,
  size = 'md',
  className,
}: AppEmptyStateProps) {
  if (process.env.NODE_ENV !== 'production') {
    if (!icon || !title) {
      // eslint-disable-next-line no-console
      console.warn('[AppEmptyState] icon y title son obligatorios.');
    }
  }
  const t = SIZE_TOKENS[size];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3',
        t.padding,
        t.minH,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'flex items-center justify-center text-muted-foreground/60',
          t.iconBox,
        )}
        aria-hidden
      >
        {icon}
      </div>
      <div className="space-y-1">
        <h4 className="text-h4 font-semibold text-foreground">{title}</h4>
        {description && (
          <p className={cn('text-caption text-muted-foreground', t.maxW, 'mx-auto')}>
            {description}
          </p>
        )}
      </div>
      {meta && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
          {meta}
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
