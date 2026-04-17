/**
 * PanelBody — Cuerpo del panel con scroll único y padding canónico.
 *
 * Reglas:
 *   - Único scroll vertical del panel (no anidar otro scroll dentro salvo
 *     casos de Library justificados, p.ej. lista virtualizada).
 *   - Padding y gap entre secciones se toman de los tokens CSS.
 *   - La densidad se ajusta con `variant`, que cambia el gap entre bloques.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { PanelVariant } from './tokens';

export interface PanelBodyProps {
  variant?: PanelVariant;
  /** Si true, NO aplica padding (útil cuando el hijo controla su propio layout). */
  noPadding?: boolean;
  /** Si true, desactiva el scroll (cuando el hijo gestiona su propio scroll). */
  noScroll?: boolean;
  className?: string;
  children: React.ReactNode;
}

const VARIANT_GAP: Record<PanelVariant, string> = {
  form: 'gap-[var(--panel-section-gap)]',
  library: 'gap-[var(--panel-block-gap)]',
  workflow: 'gap-[var(--panel-section-gap)]',
};

export function PanelBody({
  variant = 'library',
  noPadding = false,
  noScroll = false,
  className,
  children,
}: PanelBodyProps) {
  return (
    <div
      data-panel-body
      className={cn(
        'flex-1 min-h-0 flex flex-col',
        !noScroll && 'overflow-y-auto',
        !noPadding && 'px-[var(--panel-padding-x)] py-[var(--panel-padding-y)]',
        VARIANT_GAP[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
