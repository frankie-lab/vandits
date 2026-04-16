/**
 * useMapData — Read-only hook that projects Content data for the map.
 *
 * Consumes the locations-store (Content domain) and produces
 * a filtered, annotated dataset optimized for map rendering.
 * Discovery never writes back to Content through this hook.
 */
import { useMemo } from 'react';
import { useLocationsStore } from '@/store/locations-store';
import type { GeoLocation } from '@/types/location';

export interface MapDataResult {
  /** All locations after applying active filters */
  filteredLocations: GeoLocation[];
  /** Total count before filtering */
  totalCount: number;
  /** Whether data is still loading */
  loading: boolean;
}

export function useMapData(): MapDataResult {
  const getAllLocations = useLocationsStore(s => s.getAllLocations);
  const getFilteredLocations = useLocationsStore(s => s.getFilteredLocations);

  const allLocations = getAllLocations();
  const filteredLocations = useMemo(() => {
    return getFilteredLocations();
  }, [getFilteredLocations, allLocations]);

  return {
    filteredLocations,
    totalCount: allLocations.length,
    loading: false,
  };
}
