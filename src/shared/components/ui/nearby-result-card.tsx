import * as React from 'react';
import { cn } from '@/lib/utils';

export interface NearbyResultCardProps {
  /** Primary label. Truncated in `comfortable`, clamped to 2 lines in `compact`. */
  name: string;
  /** Optional emphasized leading metric, e.g. "110 m". */
  distanceLabel?: string;
  /** Optional secondary meta line, e.g. coordinates or place type. */
  metaLabel?: string;
  /** Optional trailing action node (button, icon). Shown on hover/focus. */
  action?: React.ReactNode;
  /** Whether the action should be permanently visible (e.g. while loading). */
  actionAlwaysVisible?: boolean;
  /**
   * Layout density.
   * - `comfortable` (default): original padding/typography. Kept for non-inline consumers.
   * - `compact` (P-POI-CURATION-2.3): tighter paddings, 2-line clamped name, lighter meta.
   *   Used by POI-1b inline "Contexto cercano" to widen useful text area.
   */
  density?: 'comfortable' | 'compact';
  /**
   * Optional accessible label for the row (used by `title` and `aria-label`).
   * Useful when the visible meta has been simplified but full data must remain
   * available (e.g. compact rows hide raw coordinates).
   */
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

/**
 * Visual primitive for "nearby result" rows.
 * Domain-agnostic: used by proximity context, search results, POI suggestions,
 * etc. Owners pass their own action node (no business logic baked in).
 */
export function NearbyResultCard({
  name,
  distanceLabel,
  metaLabel,
  action,
  actionAlwaysVisible = false,
  density = 'comfortable',
  ariaLabel,
  onClick,
  className,
}: NearbyResultCardProps) {
  const isCompact = density === 'compact';
  return (
    <div
      onClick={onClick}
      title={ariaLabel}
      aria-label={ariaLabel}
      data-density={density}
      className={cn(
        'group flex w-full items-center border border-border/60 bg-card/40 shadow-sm transition-all hover:border-border hover:bg-muted/40 hover:shadow-md',
        // P-POI-CURATION-2.5 — compact: padding lateral mínimo + gap ajustado
        // para maximizar ancho útil de lectura del nombre, sin alterar el
        // ritmo vertical (py-2). Solo afecta a inline; `comfortable` intacto.
        isCompact ? 'gap-1.5 rounded-md px-1.5 py-2' : 'gap-3 rounded-lg px-3 py-2',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'text-sm font-semibold text-foreground',
            isCompact ? 'leading-snug line-clamp-2' : 'truncate',
          )}
        >
          {name}
        </span>
        {(distanceLabel || metaLabel) && (
          <span
            className={cn(
              'mt-0.5 flex min-w-0 items-baseline gap-1.5',
              isCompact
                ? 'text-[10px] text-muted-foreground/80'
                : 'text-[11px] text-muted-foreground gap-2',
            )}
          >
            {distanceLabel && (
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  isCompact ? 'font-medium text-foreground/70' : 'font-medium text-foreground/70',
                )}
              >
                {distanceLabel}
              </span>
            )}
            {distanceLabel && metaLabel && isCompact && (
              <span className="opacity-40">·</span>
            )}
            {metaLabel && (
              <span
                className={cn(
                  'truncate',
                  isCompact ? '' : 'font-mono tabular-nums',
                )}
              >
                {metaLabel}
              </span>
            )}
          </span>
        )}
      </div>
      {action && (
        <div
          className={cn(
            'shrink-0 transition-opacity',
            actionAlwaysVisible
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}
