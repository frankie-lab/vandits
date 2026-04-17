import { useEffect } from 'react';
import { useLocationsStore } from '@/domains/content';
import { useAuth } from '@/domains/identity';
import { useDuplicateStore } from '@/stores/duplicate-store';

/**
 * Single source of truth for duplicate pair count + full pairs list.
 * Backed by a Zustand store so the heavy O(n²) scan runs once and
 * is shared across UserMenu badge, FloatingToolbar badge, and DuplicatesList.
 */
export function useDuplicateCount() {
  const { user, profile } = useAuth();
  const getAllLocations = useLocationsStore(s => s.getAllLocations);
  const resolvedDuplicatePairIds = useLocationsStore(s => s.resolvedDuplicatePairIds);
  const docVersion = useLocationsStore(s => s._docVersion);

  const pairs = useDuplicateStore(s => s.pairs);
  const threshold = useDuplicateStore(s => s.threshold);
  const setThreshold = useDuplicateStore(s => s.setThreshold);
  const recompute = useDuplicateStore(s => s.recompute);
  const lastComputedVersion = useDuplicateStore(s => s.lastComputedVersion);

  // Sync threshold from profile
  useEffect(() => {
    if (profile?.duplicate_threshold_meters !== undefined) {
      setThreshold(profile.duplicate_threshold_meters);
    }
  }, [profile?.duplicate_threshold_meters, setThreshold]);

  // Listen for panel threshold changes
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<{ threshold: number }>).detail?.threshold;
      if (t) setThreshold(t);
    };
    window.addEventListener('duplicate-threshold-changed', handler);
    return () => window.removeEventListener('duplicate-threshold-changed', handler);
  }, [setThreshold]);

  // Trigger recompute when dependencies change
  useEffect(() => {
    const getOwnership = useLocationsStore.getState().getLocationOwnership;
    const allLocations = getAllLocations();
    recompute(allLocations, user?.id ?? null, getOwnership, resolvedDuplicatePairIds, docVersion);
  }, [getAllLocations, user?.id, threshold, resolvedDuplicatePairIds, docVersion, recompute]);

  return {
    duplicateCount: pairs.length,
    threshold,
    pairs,
  };
}
