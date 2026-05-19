/**
 * external-maps-url — Resolver canónico de URLs para "Abrir en Maps".
 *
 * Escalera (idéntica para Google y Apple):
 *   1. Si el POI tiene una referencia externa persistida y válida
 *      (`external_refs.maps.{google|apple}`), úsala → `source: 'canonical'`.
 *   2. Si no, fallback a búsqueda por coordenadas → `source: 'coords-fallback'`.
 *
 * Validación dura: cualquier URL persistida pasa por `URL()` + whitelist
 * de host antes de aceptarse. Strings inválidos caen al fallback.
 *
 * Esta capa SOLO lee. No cablea ningún flujo de escritura ni UI manual.
 */
import type { GeoLocation } from '@/types/location';

export type ExternalMapsSource = 'canonical' | 'coords-fallback';

export interface ResolvedMapsUrl {
  url: string | null;
  source: ExternalMapsSource;
}

const GOOGLE_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
]);

const APPLE_HOSTS = new Set([
  'maps.apple.com',
  'beta.maps.apple.com',
]);

function isValidUrl(raw: string | undefined | null, allowedHosts: Set<string>): boolean {
  if (!raw || typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return allowedHosts.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function coordsFallbackGoogle(loc: Pick<GeoLocation, 'coordinates'>): string | null {
  const c = loc.coordinates;
  if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return null;
  return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
}

function coordsFallbackApple(loc: Pick<GeoLocation, 'coordinates' | 'name'>): string | null {
  const c = loc.coordinates;
  if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return null;
  const q = encodeURIComponent(loc.name || '');
  return `https://maps.apple.com/?ll=${c.lat},${c.lng}&q=${q}`;
}

export function resolveGoogleMapsUrl(
  loc: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
): ResolvedMapsUrl {
  const g = loc.externalRefs?.maps?.google;
  // 1a. placeId preferido — produce URL canónica determinista.
  if (g?.placeId && typeof g.placeId === 'string' && g.placeId.trim()) {
    return {
      url: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(g.placeId.trim())}`,
      source: 'canonical',
    };
  }
  // 1b. URL persistida si pertenece a host válido.
  if (isValidUrl(g?.url, GOOGLE_HOSTS)) {
    return { url: g!.url!, source: 'canonical' };
  }
  // 2. Fallback por coordenadas.
  return { url: coordsFallbackGoogle(loc), source: 'coords-fallback' };
}

export function resolveAppleMapsUrl(
  loc: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
): ResolvedMapsUrl {
  const a = loc.externalRefs?.maps?.apple;
  if (isValidUrl(a?.url, APPLE_HOSTS)) {
    return { url: a!.url!, source: 'canonical' };
  }
  return { url: coordsFallbackApple(loc), source: 'coords-fallback' };
}
