import * as React from 'react';
import { cn } from '@/lib/utils';

export interface NearbyResultCardProps {
  /** Primary label (truncated if overflow). */
  name: string;
  /** Optional emphasized leading metric, e.g. "110 m". */
  distanceLabel?: string;
  /** Optional secondary meta line, e.g. coordinates. */
  metaLabel?: string;
  /** Optional trailing action node (button, icon). Shown on hover/focus. */
  action?: React.ReactNode;
  /** Whether the action should be permanently visible (e.g. while loading). */
  actionAlwaysVisible?: boolean;
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
  onClick,
  className,
}: NearbyResultCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2 shadow-sm transition-all hover:border-border hover:bg-muted/40 hover:shadow-md',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">
          {name}
        </span>
        {(distanceLabel || metaLabel) && (
          <span className="mt-0.5 flex min-w-0 items-baseline gap-2 text-[11px] text-muted-foreground">
            {distanceLabel && (
              <span className="shrink-0 font-medium tabular-nums text-foreground/70">
                {distanceLabel}
              </span>
            )}
            {metaLabel && (
              <span className="truncate font-mono tabular-nums">
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
