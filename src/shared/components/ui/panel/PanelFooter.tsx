/**
 * PanelFooter — Footer opcional con CTA primaria.
 *
 * Reglas:
 *   - Sticky por defecto al fondo del panel.
 *   - Separador superior siempre visible.
 *   - minHeight desde token; padding canónico.
 *   - Una sola CTA primaria por footer.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PanelFooterProps {
  className?: string;
  /** Si false, el footer no es sticky (raro; úsalo solo con razón). */
  sticky?: boolean;
  children: React.ReactNode;
}

export function PanelFooter({ className, sticky = true, children }: PanelFooterProps) {
  return (
    <div
      data-panel-footer
      className={cn(
        'shrink-0 border-t bg-background/95 backdrop-blur-sm',
        'min-h-[var(--panel-footer-min-h)] px-[var(--panel-padding-x)] py-3',
        'flex items-center justify-end gap-2',
        sticky && 'sticky bottom-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
