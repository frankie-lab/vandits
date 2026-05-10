/**
 * useLocationCollections — Devuelve las colecciones (con name/color/icon) que
 * contienen un location concreto. Backend del hook = store transversal único
 * `location-collections-store`. Misma fuente que el popup del mapa.
 */
import { useEffect, useState } from 'react';
import {
  getCollectionsForLocation,
  primeCollectionsForLocations,
  subscribeLocationCollections,
  type LocationCollectionChip,
} from '@/domains/content/store/location-collections-store';

export type { LocationCollectionChip };

export function useLocationCollections(locationId: string | null | undefined) {
  const [items, setItems] = useState<LocationCollectionChip[]>(
    () => getCollectionsForLocation(locationId),
  );
  const [loading, setLoading] = useState<boolean>(() => {
    return !!locationId && getCollectionsForLocation(locationId).length === 0;
  });

  useEffect(() => {
    if (!locationId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(getCollectionsForLocation(locationId));
    primeCollectionsForLocations([locationId]);
    const unsubscribe = subscribeLocationCollections((changed) => {
      if (changed && !changed.has(locationId)) return;
      setItems(getCollectionsForLocation(locationId));
      setLoading(false);
    });
    return () => { unsubscribe(); };
  }, [locationId]);

  return { collections: items, loading };
}
