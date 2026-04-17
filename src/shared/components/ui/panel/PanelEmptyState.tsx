/**
 * PanelEmptyState — Estado vacío canónico para cualquier panel.
 *
 * Estructura obligatoria: icon + title + (opcional) description + (opcional)
 * action. La regla "icon+title obligatorios" se valida en runtime DEV.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PanelEmptyStateProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** CTA primaria opcional. Si la pones, ponla solo aquí (no duplicar). */
  action?: React.ReactNode;
  /** Lista de formatos/estados soportados (chips informativos). */
  supports?: React.ReactNode;
  className?: string;
}

export function PanelEmptyState({
  icon,
  title,
  description,
  action,
  supports,
  className,
}: PanelEmptyStateProps) {
  // DEV guard — el contrato exige icon y title.
  if (process.env.NODE_ENV !== 'production') {
    if (!icon || !title) {
      // eslint-disable-next-line no-console
      console.warn('[PanelEmptyState] icon y title son obligatorios.');
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'p-[var(--panel-empty-padding)] gap-3',
        'min-h-[200px]',
        className,
      )}
    >
      <div className="text-muted-foreground/60">{icon}</div>
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        {description && (
          <p className="text-xs text-muted-foreground max-w-[240px]">{description}</p>
        )}
      </div>
      {supports && <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">{supports}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
