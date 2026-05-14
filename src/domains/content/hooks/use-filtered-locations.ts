// Domain: Content — memoized filtered locations hook
// Avoids recalculating getFilteredLocations on every render
import { useEffect, useMemo, useState } from 'react';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { GeoLocation } from '@/types/location';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import { subscribeCollectionVisibility } from '@/domains/content/lib/collection-visibility';

function useCollectionVisibilityTick(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribeCollectionVisibility(() => {
      setTick((value) => value + 1);
    });
  }, []);

  return tick;
}

/**
 * Returns memoized filtered locations. Only recalculates when
 * documents or filters actually change (by reference).
 */
export function useFilteredLocations(): GeoLocation[] {
  const docVersion = useLocationsStore(s => s._docVersion);
  const filters = useLocationsStore(s => s.filters);
  const currentUserId = useLocationsStore(s => s.currentUserId);
  const selectedLocations = useLocationsStore(s => s.selectedLocations);
  const collectionVisibilityTick = useCollectionVisibilityTick();

  return useMemo(() => {
    return useLocationsStore.getState().getFilteredLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docVersion, filters, currentUserId, selectedLocations, collectionVisibilityTick]);
}

/**
 * Devuelve `filteredLocations` IGNORANDO el eje Salud (`healthFilter`).
 * Lo usan los chips del eje Salud para mostrar su count individual sin
 * canibalizarse entre sí cuando uno está activo.
 *
 * Cuando `healthFilter` está vacío, devuelve la misma referencia que
 * `useFilteredLocations()` (sin recomputar).
 */
export function useFilteredLocationsIgnoringHealth(): GeoLocation[] {
  const filtered = useFilteredLocations();
  const docVersion = useLocationsStore(s => s._docVersion);
  const filters = useLocationsStore(s => s.filters);
  const currentUserId = useLocationsStore(s => s.currentUserId);
  const selectedLocations = useLocationsStore(s => s.selectedLocations);
  const collectionVisibilityTick = useCollectionVisibilityTick();

  return useMemo(() => {
    if (!filters.healthFilter) return filtered;
    const state = useLocationsStore.getState();
    const all = state.getAllLocations();
    const sel = state.selectedLocations;
    const hasSelection = !!sel && sel.size > 0;
    const restricted = hasSelection ? all.filter(l => sel.has(l.id)) : all;
    return restricted.filter(loc =>
      matchesLocationFilters(loc, filters, {
        includeGeo: !hasSelection,
        includeHealth: false,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, docVersion, filters, currentUserId, selectedLocations, collectionVisibilityTick]);
}

/**
 * Returns memoized enrichment stats. Only recalculates when documents change.
 */
export function useEnrichedStats() {
  const docVersion = useLocationsStore(s => s._docVersion);

  return useMemo(() => {
    return useLocationsStore.getState().getEnrichedStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docVersion]);
}
