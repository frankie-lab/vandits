/**
 * useLayerVisibility — Single Arbiter for map marker/heatmap visibility
 *
 * Replaces: use-ownership-filter, use-visibility-preferences
 * Now backed by the shared preference system for persistence.
 */
import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocationsStore } from '@/store/locations-store';
import type { OwnershipFilter } from '@/types/location';

// Import discovery preferences to ensure unit is registered
import '@/domains/discovery/preferences';

// ── Types ────────────────────────────────────────────────────
export type LayerType = 'catalog' | 'workspace' | 'own' | 'followed' | 'routes' | 'points';

export interface LayerState {
  visible: boolean;
  entityHidden: string[];
  minVisibilityZooms: Map<string, number | null>;
}

export interface LayerVisibilityState {
  own: LayerState;
  catalog: LayerState;
  workspace: LayerState;
  followed: LayerState;
  [key: string]: LayerState;
}

export interface VisibilityResult {
  opacity: number;
  pointerEvents: 'auto' | 'none';
}

// ── Persistence ──────────────────────────────────────────────
const STORAGE_KEY = 'vandits-layer-visibility';

interface PersistedState {
  own: { visible: boolean };
  catalog: { visible: boolean };
  workspace: { visible: boolean };
  followed: { visible: boolean; entityHidden: string[] };
  routes?: { visible: boolean };
  points?: { visible: boolean };
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Strip dead curator/druid keys from legacy data
      delete parsed.curator;
      delete parsed.druid;
      return parsed;
    }
  } catch { /* ignore */ }
  return migrateLegacy();
}

function migrateLegacy(): PersistedState {
  const result: PersistedState = {
    own: { visible: true },
    catalog: { visible: true },
    workspace: { visible: false },
    followed: { visible: true, entityHidden: [] },
    routes: { visible: true },
    points: { visible: true },
  };

  try {
    const ownership = localStorage.getItem('vandits-ownership-filter');
    if (ownership === 'mine') {
      result.followed.visible = false;
    }

    const hiddenUsers = localStorage.getItem('vandits_hidden_followed_users');
    if (hiddenUsers) {
      const parsed = JSON.parse(hiddenUsers);
      if (Array.isArray(parsed)) result.followed.entityHidden = parsed;
    }

    // Clean up all legacy keys (including dead curator/druid ones)
    localStorage.removeItem('vandits-ownership-filter');
    localStorage.removeItem('vandits_hidden_followed_users');
    localStorage.removeItem('vandits_hidden_curators');
    localStorage.removeItem('vandits_hidden_druids');
  } catch { /* ignore */ }

  savePersisted(result);
  return result;
}

function savePersisted(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Event ────────────────────────────────────────────────────
export const LAYER_VISIBILITY_EVENT = 'layer-visibility-changed';

function emitChange() {
  window.dispatchEvent(new CustomEvent(LAYER_VISIBILITY_EVENT));
}

// ── Shared singleton state ───────────────────────────────────
let sharedLayers: LayerVisibilityState | null = null;

function getSharedLayers(): LayerVisibilityState {
  if (!sharedLayers) {
    const persisted = loadPersisted();
    sharedLayers = {
      own: { visible: persisted.own.visible, entityHidden: [], minVisibilityZooms: new Map() },
      catalog: { visible: persisted.catalog?.visible ?? true, entityHidden: [], minVisibilityZooms: new Map() },
      workspace: { visible: persisted.workspace?.visible ?? false, entityHidden: [], minVisibilityZooms: new Map() },
      followed: { visible: persisted.followed.visible, entityHidden: persisted.followed.entityHidden, minVisibilityZooms: new Map() },
      routes: { visible: persisted.routes?.visible ?? true, entityHidden: [], minVisibilityZooms: new Map() },
      points: { visible: persisted.points?.visible ?? true, entityHidden: [], minVisibilityZooms: new Map() },
    };
  }
  return sharedLayers;
}

// ── Visibility resolution algorithm ─────────────────────────
export interface MarkerContext {
  layerType: LayerType;
  entityId?: string;
}

export function resolveVisibility(
  ctx: MarkerContext,
  zoom: number,
  layers: LayerVisibilityState,
): VisibilityResult {
  const HIDDEN: VisibilityResult = { opacity: 0, pointerEvents: 'none' };
  const VISIBLE: VisibilityResult = { opacity: 1, pointerEvents: 'auto' };

  const layer = layers[ctx.layerType];
  if (!layer) return HIDDEN;

  if (!layer.visible) return HIDDEN;

  if (ctx.entityId && layer.entityHidden.includes(ctx.entityId)) return HIDDEN;

  if (ctx.entityId) {
    const minZoom = layer.minVisibilityZooms.get(ctx.entityId);
    if (minZoom != null && zoom < minZoom) return HIDDEN;
  }

  return VISIBLE;
}

// ── Hook ─────────────────────────────────────────────────────
export function useLayerVisibility() {
  const setFilters = useLocationsStore(s => s.setFilters);
  const initializedRef = useRef(false);

  const layersRef = useRef<LayerVisibilityState>(getSharedLayers());
  layersRef.current = getSharedLayers();

  // Sync store filters on first mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const l = layersRef.current;
    const currentFilters = useLocationsStore.getState().filters;
    const updates: Record<string, any> = {};

    const pointsOff = l.points?.visible === false;
    const allSubLayersOff = !l.own.visible && !l.catalog.visible && !l.workspace.visible && !l.followed.visible;
    if (pointsOff || allSubLayersOff) {
      updates.allPointsHidden = true;
    }

    if (!updates.allPointsHidden) {
      if (l.own.visible && !l.followed.visible) {
        updates.ownershipFilter = 'mine' as OwnershipFilter;
      }
    }

    if (l.followed.entityHidden.length > 0) updates.hiddenFollowedUserIds = l.followed.entityHidden;

    if (Object.keys(updates).length > 0) {
      setFilters({ ...currentFilters, ...updates });
    }
  }, []);

  // ── Persist helper ─────────────────────────────────────────
  const persist = useCallback(() => {
    const l = layersRef.current;
    savePersisted({
      own: { visible: l.own.visible },
      catalog: { visible: l.catalog.visible },
      workspace: { visible: l.workspace.visible },
      followed: { visible: l.followed.visible, entityHidden: l.followed.entityHidden },
      routes: { visible: l.routes.visible },
      points: { visible: l.points.visible },
    });
  }, []);

  // Sync layer state → store filters
  const syncToStore = useCallback(() => {
    const l = layersRef.current;
    const current = useLocationsStore.getState().filters;

    const pointsOff = l.points?.visible === false;
    const allSubLayersOff = !l.own.visible && !l.catalog.visible && !l.workspace.visible && !l.followed.visible;
    const allPointsHidden = pointsOff || allSubLayersOff;

    let ownershipFilter: OwnershipFilter = 'all';
    if (!allPointsHidden) {
      if (l.own.visible && !l.followed.visible) {
        ownershipFilter = 'mine';
      } else if (!l.own.visible && l.followed.visible) {
        ownershipFilter = 'followed';
      }
    }

    setFilters({
      ...current,
      allPointsHidden,
      ownershipFilter,
      hiddenFollowedUserIds: l.followed.entityHidden.length > 0 ? l.followed.entityHidden : undefined,
    });
  }, [setFilters]);

  // ── Public API ─────────────────────────────────────────────

  const toggleLayer = useCallback((type: LayerType) => {
    const layer = layersRef.current[type];
    if (!layer) return;
    layer.visible = !layer.visible;
    persist();
    syncToStore();
    emitChange();
  }, [persist, syncToStore]);

  const toggleEntity = useCallback((type: LayerType, entityId: string) => {
    const layer = layersRef.current[type];
    if (!layer) return;
    const idx = layer.entityHidden.indexOf(entityId);
    if (idx >= 0) {
      layer.entityHidden.splice(idx, 1);
    } else {
      layer.entityHidden.push(entityId);
    }
    persist();
    syncToStore();
    emitChange();
  }, [persist, syncToStore]);

  const setMinVisibilityZooms = useCallback((type: LayerType, zooms: Map<string, number | null>) => {
    const layer = layersRef.current[type];
    if (!layer) return;
    layer.minVisibilityZooms = zooms;
    emitChange();
  }, []);

  const isLayerVisible = useCallback((type: LayerType): boolean => {
    return layersRef.current[type]?.visible ?? true;
  }, []);

  const isEntityHidden = useCallback((type: LayerType, entityId: string): boolean => {
    return layersRef.current[type]?.entityHidden.includes(entityId) ?? false;
  }, []);

  const setOwnershipFilter = useCallback((filter: OwnershipFilter) => {
    const l = layersRef.current;
    if (filter === 'mine') {
      l.own.visible = true;
      l.catalog.visible = true;
      l.followed.visible = false;
    } else if (filter === 'followed') {
      l.own.visible = false;
      l.catalog.visible = false;
      l.workspace.visible = false;
      l.followed.visible = true;
    } else {
      l.own.visible = true;
      l.catalog.visible = true;
      l.followed.visible = true;
    }
    persist();
    syncToStore();
    emitChange();
  }, [persist, syncToStore]);

  const ownershipFilter = useMemo((): OwnershipFilter => {
    const l = layersRef.current;
    if (l.own.visible && !l.followed.visible) return 'mine';
    if (!l.own.visible && l.followed.visible) return 'followed';
    return 'all';
  }, []);

  const toggleMine = useCallback(() => {
    setOwnershipFilter(ownershipFilter === 'mine' ? 'all' : 'mine');
  }, [ownershipFilter, setOwnershipFilter]);

  const getLayers = useCallback((): LayerVisibilityState => layersRef.current, []);

  return {
    toggleLayer,
    toggleEntity,
    setMinVisibilityZooms,
    isLayerVisible,
    isEntityHidden,
    getLayers,

    ownershipFilter,
    setOwnershipFilter,
    toggleMine,

    toggleUserVisibility: (userId: string) => toggleEntity('followed', userId),
    isUserHidden: (userId: string) => isEntityHidden('followed', userId),
  };
}
