/**
 * map-layer-groups — Manages real Leaflet LayerGroups per content type.
 */
import L from 'leaflet';
import type { LayerType, LayerVisibilityState } from '@/hooks/use-layer-visibility';

// ── Registry ─────────────────────────────────────────────────

/** Key for entity-scoped groups: "followed:<userId>" */
export type LayerGroupKey = 'own' | 'catalog' | 'workspace' | `followed:${string}`;

const layerGroups = new Map<LayerGroupKey, L.LayerGroup>();
let mapInstance: L.Map | null = null;

// ── Lifecycle ────────────────────────────────────────────────

export function initLayerGroups(map: L.Map) {
  mapInstance = map;
  layerGroups.clear();
}

export function destroyLayerGroups() {
  layerGroups.forEach(group => {
    if (mapInstance?.hasLayer(group)) {
      mapInstance.removeLayer(group);
    }
    group.clearLayers();
  });
  layerGroups.clear();
  mapInstance = null;
}

// ── Group access ─────────────────────────────────────────────

function resolveKey(layerType: LayerType, entityId?: string): LayerGroupKey {
  if (layerType === 'own' || layerType === 'catalog' || layerType === 'workspace') return layerType as LayerGroupKey;
  if (!entityId) return layerType as LayerGroupKey; // fallback
  return `${layerType}:${entityId}` as LayerGroupKey;
}

/** Get or create a LayerGroup for the given layer type + entity */
export function getOrCreateGroup(layerType: LayerType, entityId?: string): L.LayerGroup {
  const key = resolveKey(layerType, entityId);
  let group = layerGroups.get(key);
  if (!group) {
    group = L.layerGroup();
    layerGroups.set(key, group);
  }
  return group;
}

/** Get an existing group (or undefined) */
export function getGroup(layerType: LayerType, entityId?: string): L.LayerGroup | undefined {
  return layerGroups.get(resolveKey(layerType, entityId));
}

// ── Visibility control ───────────────────────────────────────

export function applyLayerVisibility(layers: LayerVisibilityState, zoom: number) {
  if (!mapInstance) return;

  const pointsVisible = layers.points?.visible !== false;

  layerGroups.forEach((group, key) => {
    const { layerType, entityId } = parseKey(key);
    const layer = layers[layerType];
    if (!layer) return;

    let shouldBeVisible = layer.visible && pointsVisible;

    if (shouldBeVisible && entityId && layer.entityHidden.includes(entityId)) {
      shouldBeVisible = false;
    }

    if (shouldBeVisible && entityId) {
      const minZoom = layer.minVisibilityZooms.get(entityId);
      if (minZoom != null && zoom < minZoom) {
        shouldBeVisible = false;
      }
    }

    const isOnMap = mapInstance!.hasLayer(group);

    if (shouldBeVisible && !isOnMap) {
      group.addTo(mapInstance!);
    } else if (!shouldBeVisible && isOnMap) {
      mapInstance!.removeLayer(group);
    }
  });
}

function parseKey(key: LayerGroupKey): { layerType: LayerType; entityId?: string } {
  if (key === 'own' || key === 'catalog' || key === 'workspace') return { layerType: key };
  const colonIdx = key.indexOf(':');
  if (colonIdx === -1) return { layerType: key as LayerType };
  return {
    layerType: key.substring(0, colonIdx) as LayerType,
    entityId: key.substring(colonIdx + 1),
  };
}

/** Remove all markers from all groups (for full re-render) */
export function clearAllGroups() {
  layerGroups.forEach(group => group.clearLayers());
}

/** Get all registered group keys */
export function getRegisteredKeys(): LayerGroupKey[] {
  return Array.from(layerGroups.keys());
}
