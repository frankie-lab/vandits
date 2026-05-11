/**
 * PanelListSkeleton — Placeholder de lista para body de paneles.
 *
 * Prop funcional: `rows` (default 6). Sin alturas absolutas: cada fila
 * usa `--control-h-xl` (panel-list-row-min-h) y separación `--panel-block-gap`.
 *
 * Ver: mem://ui/skeleton-patterns
 */
import { PoiCardSkeleton } from './PoiCardSkeleton';

export interface PanelListSkeletonProps {
  rows?: number;
}

export function PanelListSkeleton({ rows = 6 }: PanelListSkeletonProps) {
  return (
    <div
      className="flex flex-col"
      role="status"
      aria-busy="true"
      aria-label="Cargando lista"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <PoiCardSkeleton key={i} />
      ))}
    </div>
  );
}
