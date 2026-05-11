/**
 * BadgeRowSkeleton — Placeholder para una fila de chips/badges.
 *
 * Prop funcional: `count` (default 3). Sin alturas absolutas: usa
 * `--control-h-sm` (chip height) y `--radius-md`.
 *
 * Ver: mem://ui/skeleton-patterns
 */
import { AppSkeleton } from '@/shared/components/ui/AppSkeleton';

export interface BadgeRowSkeletonProps {
  count?: number;
}

const WIDTHS = ['56px', '72px', '48px', '64px', '80px'];

export function BadgeRowSkeleton({ count = 3 }: BadgeRowSkeletonProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <AppSkeleton
          key={i}
          variant="line"
          width={WIDTHS[i % WIDTHS.length]}
          height="var(--control-h-sm)"
          className="rounded-token-md"
        />
      ))}
    </div>
  );
}
