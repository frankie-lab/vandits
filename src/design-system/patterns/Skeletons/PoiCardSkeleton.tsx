/**
 * PoiCardSkeleton — Placeholder para una fila/card de POI mientras carga.
 *
 * Sin tamaños absolutos: todo deriva de density/radius/spacing tokens.
 * Composición: thumbnail circle + 2 líneas (title + meta) + badge row.
 *
 * Ver: mem://ui/skeleton-patterns
 */
import { AppSkeleton } from '@/shared/components/ui/AppSkeleton';

export function PoiCardSkeleton() {
  return (
    <div className="flex items-center gap-3 h-[var(--control-h-xl)] px-[var(--panel-padding-x)] border-b border-border/40">
      <AppSkeleton variant="circle" width="var(--icon-xl)" height="var(--icon-xl)" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <AppSkeleton variant="line" width="60%" height="12px" />
        <AppSkeleton variant="line" width="35%" height="10px" />
      </div>
      <AppSkeleton variant="line" width="40px" height="var(--control-h-sm)" className="rounded-token-sm" />
    </div>
  );
}
