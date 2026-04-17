// Domain: Content — memoized filtered locations hook
// Avoids recalculating getFilteredLocations on every render
import { useMemo } from 'react';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { GeoLocation } from '@/types/location';

/**
 * Returns memoized filtered locations. Only recalculates when
 * documents or filters actually change (by reference).
 */
export function useFilteredLocations(): GeoLocation[] {
  const docVersion = useLocationsStore(s => s._docVersion);
  const filters = useLocationsStore(s => s.filters);
  const currentUserId = useLocationsStore(s => s.currentUserId);

  return useMemo(() => {
    return useLocationsStore.getState().getFilteredLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docVersion, filters, currentUserId]);
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
