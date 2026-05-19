/**
 * external-maps-url — Resolver canónico de URLs para "Abrir en Maps".
 *
 * Canon v2 (PR-SHARE-EXT-MAPS-2):
 *
 *   Helper único `buildExternalMapLink(loc, provider)` que devuelve:
 *     - url
 *     - provider ('google' | 'apple')
 *     - mode    ('place_id' | 'name_coords' | 'coords')
 *     - confidence ('high' | 'medium' | 'low')
 *     - label  (texto UI ya localizado)
 *
 *   Escalera de prioridad (idéntica para Google y Apple):
 *     1. placeId estructurado          → mode 'place_id',  confidence 'high'
 *     2. name + coords                 → mode 'name_coords', confidence 'medium'
 *     3. solo coords                   → mode 'coords',     confidence 'low'
 *     4. URL persistida (fallback duro, sólo si nada anterior aplica)
 *
 *   Las URLs largas persistidas NO son la identidad principal: sólo se usan
 *   como último recurso cuando no hay coords ni nombre estructurados.
 *
 *   Labels (estrictos por confidence):
 *     - high   → "Abrir en {Google|Apple} Maps"
 *     - medium → "Buscar en {Google|Apple} Maps"
 *     - low    → "Abrir coordenadas en {Google|Apple} Maps"
 *
 *   Validación dura: cualquier URL persistida pasa por `URL()` + whitelist
 *   de host antes de aceptarse. Strings inválidos se descartan.
 *
 *   Vandits sigue siendo la SoT del share. Google/Apple son adaptadores
 *   externos consumidos sólo en acciones secundarias.
 *
 *   Wrappers legacy `resolveGoogleMapsUrl` / `resolveAppleMapsUrl` se
 *   mantienen para no romper `channel-adapters.ts` ni los tests existentes.
 *   Mapeo: mode ∈ {place_id, name_coords} → source 'canonical';
 *          mode === 'coords' → source 'coords-fallback'.
 */
import type { GeoLocation } from '@/types/location';

export type MapProvider = 'google' | 'apple';
export type MapLinkMode = 'place_id' | 'name_coords' | 'coords';
export type MapLinkConfidence = 'high' | 'medium' | 'low';

export interface ExternalMapLink {
  url: string | null;
  provider: MapProvider;
  mode: MapLinkMode | null;
  confidence: MapLinkConfidence | null;
  label: string | null;
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

const PROVIDER_NAME: Record<MapProvider, string> = {
  google: 'Google Maps',
  apple: 'Apple Maps',
};

function labelFor(provider: MapProvider, confidence: MapLinkConfidence): string {
  const name = PROVIDER_NAME[provider];
  switch (confidence) {
    case 'high':   return `Abrir en ${name}`;
    case 'medium': return `Buscar en ${name}`;
    case 'low':    return `Abrir coordenadas en ${name}`;
  }
}

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

function hasValidCoords(
  loc: Pick<GeoLocation, 'coordinates'>,
): loc is Pick<GeoLocation, 'coordinates'> & { coordinates: { lat: number; lng: number } } {
  const c = loc.coordinates;
  return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng);
}

function trimmedName(loc: Pick<GeoLocation, 'name'>): string | null {
  const n = typeof loc.name === 'string' ? loc.name.trim() : '';
  return n.length > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

function buildGoogleLink(
  loc: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
): ExternalMapLink {
  const placeId = loc.externalRefs?.maps?.google?.placeId?.trim();
  const name = trimmedName(loc);
  const coords = hasValidCoords(loc) ? loc.coordinates : null;

  // 1. placeId → high (URL canónica con query + query_place_id).
  if (placeId) {
    const q = name ?? (coords ? `${coords.lat},${coords.lng}` : 'place');
    const url =
      `https://www.google.com/maps/search/?api=1` +
      `&query=${encodeURIComponent(q)}` +
      `&query_place_id=${encodeURIComponent(placeId)}`;
    return { url, provider: 'google', mode: 'place_id', confidence: 'high', label: labelFor('google', 'high') };
  }

  // 2. name + coords → medium ("nombre lat,lng" como query unificada).
  if (name && coords) {
    const q = `${name} ${coords.lat},${coords.lng}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    return { url, provider: 'google', mode: 'name_coords', confidence: 'medium', label: labelFor('google', 'medium') };
  }

  // 3. solo coords → low.
  if (coords) {
    const url = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    return { url, provider: 'google', mode: 'coords', confidence: 'low', label: labelFor('google', 'low') };
  }

  // 4. URL persistida (último recurso: no hay placeId, ni name, ni coords).
  const persisted = loc.externalRefs?.maps?.google?.url;
  if (isValidUrl(persisted, GOOGLE_HOSTS)) {
    return { url: persisted!, provider: 'google', mode: 'place_id', confidence: 'high', label: labelFor('google', 'high') };
  }

  return { url: null, provider: 'google', mode: null, confidence: null, label: null };
}

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------

function buildAppleLink(
  loc: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
): ExternalMapLink {
  // Apple no tiene placeId estructurado público equivalente hoy.
  // Cuando lo introduzcamos como `external_refs.maps.apple.placeId`, irá aquí
  // como rama 1 (high). Por ahora, sólo escalera name_coords → coords →
  // persisted url.
  const name = trimmedName(loc);
  const coords = hasValidCoords(loc) ? loc.coordinates : null;

  // 2. name + coords → medium.
  if (name && coords) {
    const url =
      `https://maps.apple.com/?q=${encodeURIComponent(name)}` +
      `&ll=${coords.lat},${coords.lng}`;
    return { url, provider: 'apple', mode: 'name_coords', confidence: 'medium', label: labelFor('apple', 'medium') };
  }

  // 3. solo coords → low.
  if (coords) {
    const url = `https://maps.apple.com/?ll=${coords.lat},${coords.lng}`;
    return { url, provider: 'apple', mode: 'coords', confidence: 'low', label: labelFor('apple', 'low') };
  }

  // 4. URL persistida (último recurso).
  const persisted = loc.externalRefs?.maps?.apple?.url;
  if (isValidUrl(persisted, APPLE_HOSTS)) {
    return { url: persisted!, provider: 'apple', mode: 'place_id', confidence: 'high', label: labelFor('apple', 'high') };
  }

  return { url: null, provider: 'apple', mode: null, confidence: null, label: null };
}

/**
 * Helper canónico único. Toda UI/adapter que necesite una URL externa de
 * mapa para un POI DEBE pasar por aquí.
 */
export function buildExternalMapLink(
  loc: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
  provider: MapProvider,
): ExternalMapLink {
  return provider === 'google' ? buildGoogleLink(loc) : buildAppleLink(loc);
}

// ---------------------------------------------------------------------------
// Wrappers legacy (compat con channel-adapters y consumidores previos)
// ---------------------------------------------------------------------------

export type ExternalMapsSource = 'canonical' | 'coords-fallback';

export interface ResolvedMapsUrl {
  url: string | null;
  source: ExternalMapsSource;
}

function toLegacySource(link: ExternalMapLink): ExternalMapsSource {
  return link.mode === 'coords' ? 'coords-fallback' : 'canonical';
}

export function resolveGoogleMapsUrl(
  loc: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
): ResolvedMapsUrl {
  const link = buildExternalMapLink(loc, 'google');
  return { url: link.url, source: toLegacySource(link) };
}

export function resolveAppleMapsUrl(
  loc: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
): ResolvedMapsUrl {
  const link = buildExternalMapLink(loc, 'apple');
  return { url: link.url, source: toLegacySource(link) };
}
