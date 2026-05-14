/**
 * map-layer-groups — Manages real Leaflet LayerGroups per content type.
 */
import L from 'leaflet';
import type { LayerType, LayerVisibilityState } from '@/hooks/use-layer-visibility';
import { DEFAULT_ZOOM_GATES, type ZoomGates } from '@/domains/content/lib/poi-layer';

// ── Registry ─────────────────────────────────────────────────

/** Key for entity-scoped groups. Free-form children of `app`/`source`/`followed`. */
export type LayerGroupKey =
  | 'own'
  | 'catalog'
  | 'workspace'
  | `followed:${string}`
  | `app:${string}`
  | `source:${string}`;

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

/**
 * Clear all groups but preserve a single layer (typically the marker that
 * owns an open popup). Avoids `group.clearLayers()` on the group containing
 * the preserved layer — that call would remove it from the map and close
 * the popup. Iterates layer-by-layer instead.
 *
 * Used by LocationMap rebuild when an open popup must survive a filter
 * change that would otherwise destroy its host marker.
 * Ver `mem://logic/map/popup-persist-on-rebuild`.
 */
export function clearAllGroupsExcept(preserved: L.Layer): void {
  layerGroups.forEach(group => {
    const toRemove: L.Layer[] = [];
    group.eachLayer(layer => {
      if (layer !== preserved) toRemove.push(layer);
    });
    toRemove.forEach(layer => group.removeLayer(layer));
  });
}

/** Get all registered group keys */
export function getRegisteredKeys(): LayerGroupKey[] {
  return Array.from(layerGroups.keys());
}
