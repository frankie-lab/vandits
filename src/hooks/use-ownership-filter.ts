/**
 * useOwnershipFilter
 * 
 * Centralized hook for the ownership filter (mine / followed / all).
 * Persists to localStorage and syncs with the locations store.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useLocationsStore } from '@/store/locations-store';
import type { OwnershipFilter } from '@/types/location';

const STORAGE_KEY = 'vandits-ownership-filter';

function getStored(): OwnershipFilter {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'mine' || val === 'followed') return val;
    return 'all';
  } catch {
    return 'all';
  }
}

export function useOwnershipFilter() {
  const filters = useLocationsStore(s => s.filters);
  const setFilters = useLocationsStore(s => s.setFilters);
  const initializedRef = useRef(false);

  // Rehydrate from localStorage on first mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const stored = getStored();
    if (stored !== 'all') {
      const currentFilters = useLocationsStore.getState().filters;
      setFilters({ ...currentFilters, ownershipFilter: stored });
    }
  }, []);

  const current: OwnershipFilter = filters.ownershipFilter || 'all';

  const setOwnershipFilter = useCallback((value: OwnershipFilter) => {
    const currentFilters = useLocationsStore.getState().filters;
    setFilters({ ...currentFilters, ownershipFilter: value });
    localStorage.setItem(STORAGE_KEY, value);
  }, [setFilters]);

  const toggleMine = useCallback(() => {
    setOwnershipFilter(current === 'mine' ? 'all' : 'mine');
  }, [current, setOwnershipFilter]);

  return {
    ownershipFilter: current,
    setOwnershipFilter,
    toggleMine,
  };
}
