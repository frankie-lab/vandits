/**
 * Map Viewport Culling v1 — helpers únicos.
 *
 * Regla canónica (alineada al canon POI z-bands micro≤8 / compact 9–10 / standard 11–13 / rich ≥14):
 *   - z ≤ 8    sin culling (banda micro: microdots baratos)
 *   - z 9–10   culling activo, pad 1.0   (compact, viewport ×2 por eje)
 *   - z 11–13  culling activo, pad 0.75  (standard)
 *   - z ≥ 14   culling estricto, pad 0.5 (rich)
 *
 * `keepIds` siempre se renderiza aunque caiga fuera del viewport ampliado.
 * Fuentes keep-always actuales: focusedLocationId, openPopupLocationId.
 * Cualquier panel nuevo que seleccione un POI debe registrarlo en keepIds.
 *
 * Separación obligatoria:
 *   filteredLocations  = verdad lógica (store, contadores, listas, exportación)
 *   markerLocations    = subset visual renderizable (cluster Leaflet)
 *
 * Ver memoria `mem://logic/map/viewport-culling-v1`.
 */
import type L from 'leaflet';
import type { GeoLocation } from '@/types/location';

export function shouldCullByViewport(zoom: number): boolean {
  return zoom >= 9;
}

export function getViewportPadForZoom(zoom: number): number {
  if (zoom >= 14) return 0.5;
  if (zoom >= 11) return 0.75;
  if (zoom >= 9) return 1.0;
  return 0;
}

export function applyViewportCulling(
  locations: GeoLocation[],
  bounds: L.LatLngBounds | null,
  zoom: number,
  keepIds: Set<string>,
): GeoLocation[] {
  if (!bounds || !shouldCullByViewport(zoom)) return locations;
  const padded = bounds.pad(getViewportPadForZoom(zoom));
  const result: GeoLocation[] = [];
  for (const loc of locations) {
    if (keepIds.has(loc.id)) {
      result.push(loc);
      continue;
    }
    const lat = loc.coordinates?.lat;
    const lng = loc.coordinates?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (padded.contains([lat, lng])) result.push(loc);
  }
  return result;
}

/**
 * Firma barata del subset para evitar reconstrucciones innecesarias del cluster.
 * Hash djb2-style sobre charCodes; combinado con length para discriminar tamaños.
 * O(n·k) sin allocaciones grandes (no genera strings con todos los IDs).
 * No es criptográfico: colisiones posibles pero extremadamente raras en este uso.
 */
export function getLocationSubsetSignature(locations: GeoLocation[]): string {
  let hash = 0;
  for (const loc of locations) {
    const id = loc.id;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
  }
  return `${locations.length}:${hash}`;
}
