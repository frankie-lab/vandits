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
        const tokens = getCollectionChipColors(c.color);
        return (
          <span
            key={c.id}
            title={c.name}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border"
            style={{
              color: tokens.text,
              borderColor: tokens.border,
              backgroundColor: tokens.background,
            }}
          >
            <span style={{ color: tokens.hashtag }}>#</span>
            {slug}
          </span>
        );
      })}
    </div>
  );
}
