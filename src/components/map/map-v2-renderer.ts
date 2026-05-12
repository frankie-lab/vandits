/**
 * map-v2-renderer.ts — Renders MapFeature[] as Leaflet markers.
 * Used when Phase D flag (v2_map_features) is active.
 *
 * CANON TRANSVERSAL (2026-05-12):
 * Este renderer NO genera SVG/HTML propio para POIs de contenido.
 * Delega 100% en `createCustomIcon` (single source of truth para tamaño,
 * paleta, banda por zoom, modeScale, health rings y polaroid). El grammar
 * V2 solo se usa para resolver `entityType` → estado enriquecido/vacío
 * sintético y para ownership (`isOwn`).
 *
 * Antes: cálculos paralelos `cfg.default?.base_normal ?? 14` rompían el
 * canon — POIs aparecían más grandes en V2 que en legacy a igual zoom.
 */

import L from 'leaflet';
import type { MapFeature } from '@/domains/v2';
import { createCustomIcon, syncRenderModeFromMap } from './map-icons';
import type { GeoLocation } from '@/types/location';

/**
 * Adapta un MapFeature al subset de GeoLocation que `getPointConfigKey`
 * y `getPointVisualState` necesitan. Regla:
 *   - shape `teardrop` (place enriquecido) → enriched (verde)
 *   - resto (waypoint, circle-solid promoted) → empty (naranja)
 *
 * V2 no tiene bucket "imported" (gris) porque su grammar parte de places
 * promovidos o waypoints sin descripción IA. Si en el futuro V2 expone
 * `description` plana, se añadirá aquí.
 */
function featureToLocationLike(feature: MapFeature): Partial<GeoLocation> {
  const isEnriched = feature.shape === 'teardrop';
  return {
    id: feature.id,
    name: feature.name,
    coordinates: { lat: feature.latitude, lng: feature.longitude },
    enrichedData: isEnriched
      ? ({ descripcion: '__v2_enriched__' } as any)
      : undefined,
  };
}

function createV2Icon(map: L.Map, feature: MapFeature): L.DivIcon {
  // Sincroniza render mode desde el mapa real (mismo patrón que photo
  // layer / preview). Sin esto, markers creados antes del primer
  // `zoomend` entrarían con el default `standard` rompiendo el canon.
  syncRenderModeFromMap(map);

  const locationLike = featureToLocationLike(feature) as GeoLocation;
  const isOwn = feature.ownershipSource === 'own';
  const isSelected = feature.state.isSelected;

  return createCustomIcon(
    isSelected,
    /* isFocused */ false,
    /* _isEnriched (legacy, ignored) */ false,
    locationLike,
    /* _criteriaTimestamp */ 0,
    /* isRecentlyEnriched */ false,
    /* collectionTint */ null,
    isOwn,
  );
}

/**
 * Renders V2 MapFeature[] onto a Leaflet map, returning the created markers.
 * Tamaño/paleta/forma se resuelven íntegramente vía `createCustomIcon`.
 */
export function renderV2Features(
  map: L.Map,
  features: MapFeature[],
  onFeatureClick?: (feature: MapFeature) => void,
): Map<string, L.Marker> {
  const markers = new Map<string, L.Marker>();

  for (const feature of features) {
    const icon = createV2Icon(map, feature);
    const marker = L.marker([feature.latitude, feature.longitude], {
      icon,
    });

    // Simple popup with feature name
    marker.bindPopup(`
      <div style="padding:8px;min-width:150px;">
        <div style="font-weight:600;font-size:13px;">${feature.name}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">
          ${feature.entityType === 'waypoint' ? 'Waypoint' : 'Place'} · ${feature.ownershipSource}
        </div>
      </div>
    `, {
      maxWidth: 300,
      className: 'custom-popup',
    });

    if (onFeatureClick) {
      marker.on('click', () => onFeatureClick(feature));
    }

    marker.addTo(map);
    markers.set(feature.id, marker);
  }

  return markers;
}

/**
 * Refresca los icons de los markers V2 ya existentes (sin recrear el
 * marker, preservando popups y handlers). Pensado para `zoomend`: el
 * canon cambia de banda y el divIcon debe regenerarse.
 */
export function refreshV2Icons(
  map: L.Map,
  markers: Map<string, L.Marker>,
  features: MapFeature[],
): void {
  if (markers.size === 0) return;
  const byId = new Map(features.map(f => [f.id, f] as const));
  markers.forEach((marker, id) => {
    const feature = byId.get(id);
    if (!feature) return;
    marker.setIcon(createV2Icon(map, feature));
  });
}

/**
 * Clears V2 markers from the map.
 */
export function clearV2Features(
  map: L.Map,
  markers: Map<string, L.Marker>,
): void {
  markers.forEach(marker => map.removeLayer(marker));
  markers.clear();
}
