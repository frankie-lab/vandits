// Helper único para geocodificar puntos durante la importación.
// Detecta puntos sin coordenadas válidas (lat/lng nulos o 0,0) y resuelve
// sus coordenadas vía Nominatim usando el nombre + país/región conocidos.
//
// Uso transversal — TODO insert masivo de locations debe pasar por aquí
// si quiere garantizar que los puntos terminen ubicados en el mapa.

import type { GeoLocation } from '@/types/location';

export interface GeocodeBatchResult {
  /** Locations with valid coordinates (originals + geocoded successes) */
  locations: GeoLocation[];
  /** Count of points that were geocoded (had no coords originally and now do) */
  geocodedCount: number;
  /** Count of points that still have no coords after the attempt */
  pendingCount: number;
}

function hasValidCoords(loc: GeoLocation): boolean {
  const { lat, lng } = loc.coordinates || ({} as { lat?: number; lng?: number });
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
      encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'es,en' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Geocodes any location whose coordinates are missing or (0,0).
 * Marks unresolvable points with `customData.needs_geocoding = true` so
 * the UI can surface them for manual fix.
 *
 * Sequential to respect Nominatim rate limit (1 req/s recommended).
 */
export async function geocodeLocations(
  locations: GeoLocation[],
): Promise<GeocodeBatchResult> {
  const result: GeoLocation[] = [];
  let geocodedCount = 0;
  let pendingCount = 0;

  for (const loc of locations) {
    if (hasValidCoords(loc)) {
      result.push(loc);
      continue;
    }

    // Build query: prefer "name, locality, region, country"
    const queryParts = [
      loc.name,
      (loc as any).zone,
      loc.region,
      loc.country,
    ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

    if (queryParts.length === 0) {
      pendingCount++;
      result.push({
        ...loc,
        customData: { ...(loc.customData || {}), needs_geocoding: 'true' },
      });
      continue;
    }

    const coords = await forwardGeocode(queryParts.join(', '));
    // Be polite with Nominatim
    await new Promise((r) => setTimeout(r, 1100));

    if (coords) {
      geocodedCount++;
      result.push({
        ...loc,
        coordinates: { ...loc.coordinates, lat: coords.lat, lng: coords.lng },
        customData: {
          ...(loc.customData || {}),
          geocoded_at: new Date().toISOString(),
          geocoded_source: 'nominatim',
        },
      });
    } else {
      pendingCount++;
      result.push({
        ...loc,
        customData: { ...(loc.customData || {}), needs_geocoding: 'true' },
      });
    }
  }

  return { locations: result, geocodedCount, pendingCount };
}
