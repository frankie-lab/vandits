/**
 * AppSkeleton — Skeleton placeholder único.
 *
 * Reusa la animación `shimmer` definida en tailwind.config.ts y aplica
 * el radio token correspondiente. Sustituye los `<div className="animate-pulse bg-gray-200 ..."/>`
 * dispersos por la app.
 *
 * Variantes:
 *   - 'line'   bloque rectangular (texto, contadores)
 *   - 'circle' círculo (avatares, badges)
 *   - 'card'   card grande (lista, hero)
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AppSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'line' | 'circle' | 'card';
  /** Width as CSS value (e.g. "120px", "60%", "full"). */
  width?: string;
  /** Height as CSS value. */
  height?: string;
}

export function AppSkeleton({
  variant = 'line',
  width,
  height,
  className,
  style,
  ...rest
}: AppSkeletonProps) {
  const radius =
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'card'
      ? 'rounded-token-lg'
      : 'rounded-token-sm';

  const defaultSize =
    variant === 'circle'
      ? { width: width ?? '32px', height: height ?? '32px' }
      : variant === 'card'
      ? { width: width ?? '100%', height: height ?? '96px' }
      : { width: width ?? '100%', height: height ?? '12px' };

  return (
    <div
      className={cn('bg-muted animate-shimmer', radius, className)}
      style={{ ...defaultSize, ...style }}
      aria-hidden
      {...rest}
    />
  );
}
