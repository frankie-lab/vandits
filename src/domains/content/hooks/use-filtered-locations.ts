// Domain: Content — memoized filtered locations hook
// Avoids recalculating getFilteredLocations on every render
import { useMemo } from 'react';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { GeoLocation } from '@/types/location';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';

/**
 * Returns memoized filtered locations. Only recalculates when
 * documents or filters actually change (by reference).
 */
export function useFilteredLocations(): GeoLocation[] {
  const docVersion = useLocationsStore(s => s._docVersion);
  const filters = useLocationsStore(s => s.filters);
  const currentUserId = useLocationsStore(s => s.currentUserId);
  const selectedLocations = useLocationsStore(s => s.selectedLocations);

  return useMemo(() => {
    return useLocationsStore.getState().getFilteredLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docVersion, filters, currentUserId, selectedLocations]);
}

/**
 * Devuelve el universo visible/autorizado tras filtros, SIN recortar por
 * `selectedLocations`. Lo consume el contador de FilterBar (ownershipRatios
 * y bucketStats) para que los denominadores T/Tm/Ts reflejen siempre el
 * universo y no colapsen al tamaño de la selección. La memoización omite
 * deliberadamente `selectedLocations` en sus deps.
 * Ver docs/audits/selection-counter-ownership-ratios-plan.md.
 */
export function useFilteredUniverseIgnoringSelection(): GeoLocation[] {
  const docVersion = useLocationsStore(s => s._docVersion);
  const filters = useLocationsStore(s => s.filters);
  const currentUserId = useLocationsStore(s => s.currentUserId);

  return useMemo(() => {
    return useLocationsStore.getState().getFilteredUniverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docVersion, filters, currentUserId]);
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
  }, [filtered, docVersion, filters, currentUserId, selectedLocations]);
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
