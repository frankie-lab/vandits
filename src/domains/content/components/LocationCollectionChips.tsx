/**
 * LocationCollectionChips — Render reutilizable de las colecciones a las que
 * pertenece un punto, como hashtags coloreados. Usa el hook único
 * `useLocationCollections`.
 */
import React from 'react';
import { useLocationCollections } from '@/domains/content/hooks/use-location-collections';
import { getCollectionChipColors } from '@/shared/lib/collection-chip-color';

interface Props {
  locationId: string | null | undefined;
  className?: string;
  emptyFallback?: React.ReactNode;
}

export function LocationCollectionChips({ locationId, className, emptyFallback = null }: Props) {
  const { collections, loading } = useLocationCollections(locationId);
  if (loading || !collections.length) return <>{emptyFallback}</>;

  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {collections.map((c) => {
        const slug = c.name.replace(/\s+/g, '');
        const color = c.color || '#6b7280';
        return (
          <span
            key={c.id}
            title={c.name}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border"
            style={{
              color,
              borderColor: `${color}55`,
              backgroundColor: `${color}14`,
            }}
          >
            <span style={{ color }}>#</span>
            {slug}
          </span>
        );
      })}
    </div>
  );
}
