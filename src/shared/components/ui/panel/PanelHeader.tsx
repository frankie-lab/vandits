/**
 * PanelHeader — Header opcional INTERNO a un PanelShell.
 *
 * IMPORTANTE: PanelShell ya renderiza su propio header (título + cerrar) vía
 * FloatingPanel. Este componente existe para sub-headers internos (p.ej. una
 * sección de filtros antes del body), no para sustituir el header principal.
 *
 * Si no necesitas sub-header, no uses este componente.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PanelHeaderProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PanelHeader({ icon, title, actions, className, children }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'shrink-0 flex items-center justify-between gap-2 border-b bg-muted/30',
        'h-[var(--panel-header-h)] px-[var(--panel-padding-x)]',
        className,
      )}
    >
      {children ?? (
        <>
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            {title && <span className="font-medium text-sm truncate">{title}</span>}
          </div>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
        </>
      )}
    </div>
  );
}
