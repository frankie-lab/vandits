/**
 * PanelSection — Bloque semántico dentro de un PanelBody.
 *
 * Estructura: título sistemático (uppercase pequeña, color muted) + contenido.
 * El gap entre secciones lo controla `PanelBody`; este componente solo aporta
 * el título y un margen inferior consistente.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PanelSectionProps {
  /** Título de sección. Si no se pasa, no se renderiza el label. */
  title?: React.ReactNode;
  /** Acciones a la derecha del título (opcional). */
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function PanelSection({ title, actions, className, children }: PanelSectionProps) {
  return (
    <section className={cn('flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between mb-[var(--panel-section-title-mb)]">
          {title && (
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </h3>
          )}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className="flex flex-col gap-[var(--panel-block-gap)]">{children}</div>
    </section>
  );
}
