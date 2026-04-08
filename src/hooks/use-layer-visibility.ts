/**
 * useLayerVisibility — Single Arbiter for map marker/heatmap visibility
 *
 * Replaces: use-ownership-filter, use-visibility-preferences
 * Spec: VISIBILITY_SPEC_v1.md
 */
import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocationsStore } from '@/store/locations-store';
import type { OwnershipFilter } from '@/types/location';

// ── Types ────────────────────────────────────────────────────
export type LayerType = 'own' | 'followed' | 'curator' | 'druid';

export interface LayerState {
  visible: boolean;
  entityHidden: string[];        // IDs hidden within this layer
  minVisibilityZooms: Map<string, number | null>; // entity-level zoom thresholds
}

export interface LayerVisibilityState {
  own: LayerState;
  followed: LayerState;
  curator: LayerState;
  druid: LayerState;
  [key: string]: LayerState;     // future extensibility
}

export interface VisibilityResult {
  opacity: number;
  pointerEvents: 'auto' | 'none';
}

// ── Persistence ──────────────────────────────────────────────
const STORAGE_KEY = 'vandits-layer-visibility';

interface PersistedState {
  own: { visible: boolean };
  followed: { visible: boolean; entityHidden: string[] };
  curator: { visible: boolean; entityHidden: string[] };
  druid: { visible: boolean; entityHidden: string[] };
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }

  // Migrate from legacy keys
  return migrateLegacy();
}

function migrateLegacy(): PersistedState {
  const result: PersistedState = {
    own: { visible: true },
    followed: { visible: true, entityHidden: [] },
    curator: { visible: true, entityHidden: [] },
    druid: { visible: true, entityHidden: [] },
  };

  try {
    // Migrate ownership filter
    const ownership = localStorage.getItem('vandits-ownership-filter');
    if (ownership === 'mine') {
      result.followed.visible = false;
      result.curator.visible = false;
      result.druid.visible = false;
    }

    // Migrate hidden entities
    const hiddenUsers = localStorage.getItem('vandits_hidden_followed_users');
    if (hiddenUsers) {
      const parsed = JSON.parse(hiddenUsers);
      if (Array.isArray(parsed)) result.followed.entityHidden = parsed;
    }

    const hiddenCurators = localStorage.getItem('vandits_hidden_curators');
    if (hiddenCurators) {
      const parsed = JSON.parse(hiddenCurators);
      if (Array.isArray(parsed)) result.curator.entityHidden = parsed;
    }

    const hiddenDruids = localStorage.getItem('vandits_hidden_druids');
    if (hiddenDruids) {
      const parsed = JSON.parse(hiddenDruids);
      if (Array.isArray(parsed)) result.druid.entityHidden = parsed;
    }

    // Clean up legacy keys
    localStorage.removeItem('vandits-ownership-filter');
    localStorage.removeItem('vandits_hidden_followed_users');
    localStorage.removeItem('vandits_hidden_curators');
    localStorage.removeItem('vandits_hidden_druids');
  } catch { /* ignore */ }

  // Persist the migrated state
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

// ── Visibility resolution algorithm (spec §5) ───────────────
export interface MarkerContext {
  layerType: LayerType;
  entityId?: string;
}

/**
 * Single arbiter: resolves the final visibility of a marker.
 * Called once per marker per relevant event. No other code touches opacity.
 */
export function resolveVisibility(
  ctx: MarkerContext,
  zoom: number,
  layers: LayerVisibilityState,
): VisibilityResult {
  const HIDDEN: VisibilityResult = { opacity: 0, pointerEvents: 'none' };
  const VISIBLE: VisibilityResult = { opacity: 1, pointerEvents: 'auto' };

  const layer = layers[ctx.layerType];
  if (!layer) return HIDDEN;

  // Step 2: Global layer toggle
  if (!layer.visible) return HIDDEN;

  // Step 3: Entity-level hidden
  if (ctx.entityId && layer.entityHidden.includes(ctx.entityId)) return HIDDEN;

  // Step 5: Entity min visibility zoom
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

  // Layer states stored in ref to avoid excess re-renders; we use the event bus
  const layersRef = useRef<LayerVisibilityState>(null!);

  if (!layersRef.current) {
    const persisted = loadPersisted();
    layersRef.current = {
      own: { visible: persisted.own.visible, entityHidden: [], minVisibilityZooms: new Map() },
      followed: { visible: persisted.followed.visible, entityHidden: persisted.followed.entityHidden, minVisibilityZooms: new Map() },
      curator: { visible: persisted.curator.visible, entityHidden: persisted.curator.entityHidden, minVisibilityZooms: new Map() },
      druid: { visible: persisted.druid.visible, entityHidden: persisted.druid.entityHidden, minVisibilityZooms: new Map() },
    };
  }

  // Sync store filters on first mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const l = layersRef.current;
    const currentFilters = useLocationsStore.getState().filters;
    const updates: Record<string, any> = {};

    // Map layer visibility to store ownership filter
    if (!l.own.visible && !l.followed.visible && !l.curator.visible && !l.druid.visible) {
      // Everything hidden — unusual, reset to all
    } else if (l.own.visible && !l.followed.visible && !l.curator.visible && !l.druid.visible) {
      updates.ownershipFilter = 'mine' as OwnershipFilter;
    }

    if (l.followed.entityHidden.length > 0) updates.hiddenFollowedUserIds = l.followed.entityHidden;
    if (l.curator.entityHidden.length > 0) updates.hiddenCuratorIds = l.curator.entityHidden;
    if (l.druid.entityHidden.length > 0) updates.hiddenDruidIds = l.druid.entityHidden;

    if (Object.keys(updates).length > 0) {
      setFilters({ ...currentFilters, ...updates });
    }
  }, []);

  // ── Persist helper ─────────────────────────────────────────
  const persist = useCallback(() => {
    const l = layersRef.current;
    savePersisted({
      own: { visible: l.own.visible },
      followed: { visible: l.followed.visible, entityHidden: l.followed.entityHidden },
      curator: { visible: l.curator.visible, entityHidden: l.curator.entityHidden },
      druid: { visible: l.druid.visible, entityHidden: l.druid.entityHidden },
    });
  }, []);

  // Sync layer state → store filters
  const syncToStore = useCallback(() => {
    const l = layersRef.current;
    const current = useLocationsStore.getState().filters;

    // Derive ownershipFilter from layer toggles
    let ownershipFilter: OwnershipFilter = 'all';
    if (l.own.visible && !l.followed.visible && !l.curator.visible && !l.druid.visible) {
      ownershipFilter = 'mine';
    } else if (!l.own.visible && l.followed.visible) {
      ownershipFilter = 'followed';
    }

    setFilters({
      ...current,
      ownershipFilter,
      hiddenFollowedUserIds: l.followed.entityHidden.length > 0 ? l.followed.entityHidden : undefined,
      hiddenCuratorIds: l.curator.entityHidden.length > 0 ? l.curator.entityHidden : undefined,
      hiddenDruidIds: l.druid.entityHidden.length > 0 ? l.druid.entityHidden : undefined,
    });
  }, [setFilters]);

  // ── Public API ─────────────────────────────────────────────

  /** Toggle entire layer type on/off */
  const toggleLayer = useCallback((type: LayerType) => {
    const layer = layersRef.current[type];
    if (!layer) return;
    layer.visible = !layer.visible;
    persist();
    syncToStore();
    emitChange();
  }, [persist, syncToStore]);

  /** Toggle a specific entity within a layer */
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

  /** Set min visibility zooms for entities in a layer */
  const setMinVisibilityZooms = useCallback((type: LayerType, zooms: Map<string, number | null>) => {
    const layer = layersRef.current[type];
    if (!layer) return;
    layer.minVisibilityZooms = zooms;
    emitChange();
  }, []);

  /** Check if a layer type is globally visible */
  const isLayerVisible = useCallback((type: LayerType): boolean => {
    return layersRef.current[type]?.visible ?? true;
  }, []);

  /** Check if a specific entity is hidden */
  const isEntityHidden = useCallback((type: LayerType, entityId: string): boolean => {
    return layersRef.current[type]?.entityHidden.includes(entityId) ?? false;
  }, []);

  /** Set ownership filter (backward compat for FloatingToolbar) */
  const setOwnershipFilter = useCallback((filter: OwnershipFilter) => {
    const l = layersRef.current;
    if (filter === 'mine') {
      l.own.visible = true;
      l.followed.visible = false;
      l.curator.visible = false;
      l.druid.visible = false;
    } else if (filter === 'followed') {
      l.own.visible = false;
      l.followed.visible = true;
      l.curator.visible = true;
      l.druid.visible = true;
    } else {
      l.own.visible = true;
      l.followed.visible = true;
      l.curator.visible = true;
      l.druid.visible = true;
    }
    persist();
    syncToStore();
    emitChange();
  }, [persist, syncToStore]);

  /** Get current ownership filter equivalent */
  const ownershipFilter = useMemo((): OwnershipFilter => {
    const l = layersRef.current;
    if (l.own.visible && !l.followed.visible && !l.curator.visible && !l.druid.visible) return 'mine';
    if (!l.own.visible && l.followed.visible) return 'followed';
    return 'all';
  }, []);

  /** Toggle mine shortcut */
  const toggleMine = useCallback(() => {
    setOwnershipFilter(ownershipFilter === 'mine' ? 'all' : 'mine');
  }, [ownershipFilter, setOwnershipFilter]);

  /** Get layers ref for external use (map, heatmap) */
  const getLayers = useCallback((): LayerVisibilityState => layersRef.current, []);

  return {
    // Layer operations
    toggleLayer,
    toggleEntity,
    setMinVisibilityZooms,
    isLayerVisible,
    isEntityHidden,
    getLayers,

    // Backward-compatible API
    ownershipFilter,
    setOwnershipFilter,
    toggleMine,

    // Visibility preferences compat
    toggleUserVisibility: (userId: string) => toggleEntity('followed', userId),
    toggleCuratorVisibility: (curatorId: string) => toggleEntity('curator', curatorId),
    toggleDruidVisibility: (druidId: string) => toggleEntity('druid', druidId),
    isUserHidden: (userId: string) => isEntityHidden('followed', userId),
    isCuratorHidden: (curatorId: string) => isEntityHidden('curator', curatorId),
    isDruidHidden: (druidId: string) => isEntityHidden('druid', druidId),
  };
}
