/**
 * AppSpinner — Spinner único de la app.
 *
 * Una sola animación (Loader2 girando) en lugar de mezclar Loader2, RefreshCw
 * y Progress sueltos. Usa tokens de density para el tamaño.
 *
 * Para barras de progreso reales (job IA, geocoding) sigue usando los carriles
 * del BottomProgressBar — el spinner es para feedback puntual.
 */
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AppSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Accessible label. Defaults to "Cargando". */
  label?: string;
  /** Hide the label visually (still announced by screen readers). */
  srOnly?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<AppSpinnerProps['size']>, string> = {
  xs: 'w-[var(--icon-xs)] h-[var(--icon-xs)]',
  sm: 'w-[var(--icon-sm)] h-[var(--icon-sm)]',
  md: 'w-[var(--icon-md)] h-[var(--icon-md)]',
  lg: 'w-[var(--icon-lg)] h-[var(--icon-lg)]',
  xl: 'w-[var(--icon-xl)] h-[var(--icon-xl)]',
};

export function AppSpinner({
  size = 'md',
  label = 'Cargando',
  srOnly = true,
  className,
}: AppSpinnerProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-2 text-muted-foreground', className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2 className={cn('animate-spin', SIZE_CLASS[size])} aria-hidden />
      <span className={srOnly ? 'sr-only' : 'text-caption'}>{label}</span>
    </span>
  );
}
