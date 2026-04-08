/**
 * useVisibilityPreferences
 * 
 * Centralized hook for managing entity visibility on the map.
 * Owns localStorage persistence and store synchronization for:
 *  - Hidden followed users
 *  - Hidden curators
 *  - Hidden druids
 *  - Map view mode (markers / heatmap / hybrid)
 * 
 * Single source of truth — consumed by UsersSidebar, LocationMap, and useMapHeatmap.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useLocationsStore } from '@/store/locations-store';

// ── Storage keys ──────────────────────────────────────────────
const KEYS = {
  hiddenUsers: 'vandits_hidden_followed_users',
  hiddenCurators: 'vandits_hidden_curators',
  hiddenDruids: 'vandits_hidden_druids',
} as const;

// ── Event names (for cross-component sync) ────────────────────
const EVENTS = {
  userVisibility: 'lovable:user-visibility-changed',
  curatorVisibility: 'lovable:curator-visibility-changed',
  druidVisibility: 'lovable:druid-visibility-changed',
} as const;

// ── Helpers ───────────────────────────────────────────────────
function loadArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveArray(key: string, arr: string[]) {
  localStorage.setItem(key, JSON.stringify(arr));
}

// ── Hook ──────────────────────────────────────────────────────
export function useVisibilityPreferences() {
  const filters = useLocationsStore(s => s.filters);
  const setFilters = useLocationsStore(s => s.setFilters);
  const initializedRef = useRef(false);

  // Restore from localStorage on first mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const hiddenUsers = loadArray(KEYS.hiddenUsers);
    const hiddenCurators = loadArray(KEYS.hiddenCurators);
    const hiddenDruids = loadArray(KEYS.hiddenDruids);

    const currentFilters = useLocationsStore.getState().filters;
    const updates: Record<string, string[] | undefined> = {};

    if (hiddenUsers.length > 0) updates.hiddenFollowedUserIds = hiddenUsers;
    if (hiddenCurators.length > 0) updates.hiddenCuratorIds = hiddenCurators;
    if (hiddenDruids.length > 0) updates.hiddenDruidIds = hiddenDruids;

    if (Object.keys(updates).length > 0) {
      setFilters({ ...currentFilters, ...updates });
    }
  }, []);

  // ── Toggle helpers ──────────────────────────────────────────
  const toggleUserVisibility = useCallback((userId: string) => {
    const current = useLocationsStore.getState().filters;
    const hidden = current.hiddenFollowedUserIds || [];
    const isHidden = hidden.includes(userId);
    const next = isHidden ? hidden.filter(id => id !== userId) : [...hidden, userId];
    const final = next.length > 0 ? next : undefined;

    setFilters({ ...current, hiddenFollowedUserIds: final });
    saveArray(KEYS.hiddenUsers, final || []);
    window.dispatchEvent(new CustomEvent(EVENTS.userVisibility));
  }, [setFilters]);

  const toggleCuratorVisibility = useCallback((curatorId: string) => {
    const current = useLocationsStore.getState().filters;
    const hidden = current.hiddenCuratorIds || [];
    const isHidden = hidden.includes(curatorId);
    const next = isHidden ? hidden.filter(id => id !== curatorId) : [...hidden, curatorId];
    const final = next.length > 0 ? next : undefined;

    setFilters({ ...current, hiddenCuratorIds: final });
    saveArray(KEYS.hiddenCurators, final || []);
    window.dispatchEvent(new CustomEvent(EVENTS.curatorVisibility));
  }, [setFilters]);

  const toggleDruidVisibility = useCallback((druidId: string) => {
    const current = useLocationsStore.getState().filters;
    const hidden = current.hiddenDruidIds || [];
    const isHidden = hidden.includes(druidId);
    const next = isHidden ? hidden.filter(id => id !== druidId) : [...hidden, druidId];
    const final = next.length > 0 ? next : undefined;

    setFilters({ ...current, hiddenDruidIds: final });
    saveArray(KEYS.hiddenDruids, final || []);
    window.dispatchEvent(new CustomEvent(EVENTS.druidVisibility));
  }, [setFilters]);

  // ── Query helpers ───────────────────────────────────────────
  const isUserHidden = useCallback((userId: string) => {
    return filters.hiddenFollowedUserIds?.includes(userId) ?? false;
  }, [filters.hiddenFollowedUserIds]);

  const isCuratorHidden = useCallback((curatorId: string) => {
    return filters.hiddenCuratorIds?.includes(curatorId) ?? false;
  }, [filters.hiddenCuratorIds]);

  const isDruidHidden = useCallback((druidId: string) => {
    return filters.hiddenDruidIds?.includes(druidId) ?? false;
  }, [filters.hiddenDruidIds]);

  return {
    // Toggles
    toggleUserVisibility,
    toggleCuratorVisibility,
    toggleDruidVisibility,
    // Queries
    isUserHidden,
    isCuratorHidden,
    isDruidHidden,
  };
}
