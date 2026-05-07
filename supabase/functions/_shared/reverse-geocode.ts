// Domain: Geography — Reverse-geocoding canónico desde (lat,lng).
// Centralizado para que `resolve-coordinates` y `backfill-admin-fks` compartan
// exactamente la misma lógica. Doble pasada Nominatim (zoom 18 + zoom 10).

import {
  normalizeNominatim,
  mergeCanonical,
  isMissingHighLevels,
  type CanonicalGeo,
  type NominatimAddress,
} from './geo-normalizer.ts';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'VandIts-Geo/1.0 (https://vandits.lovable.app)';
export const NOMINATIM_RATE_LIMIT_MS = 1100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nominatimReverseRaw(
  lat: number,
  lng: number,
  zoom: number,
): Promise<NominatimAddress | null> {
  const url =
    `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1&accept-language=es,en`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.address ?? null) as NominatimAddress | null;
  } catch {
    return null;
  }
}

/** Doble llamada (zoom 18 detalle + zoom 10 si faltan niveles altos). */
export async function reverseGeocodeCanonical(
  lat: number,
  lng: number,
): Promise<CanonicalGeo | null> {
  const detail = await nominatimReverseRaw(lat, lng, 18);
  if (!detail) return null;
  let canon = normalizeNominatim(detail);
  if (isMissingHighLevels(canon)) {
    await sleep(NOMINATIM_RATE_LIMIT_MS);
    const coarse = await nominatimReverseRaw(lat, lng, 10);
    if (coarse) canon = mergeCanonical(canon, normalizeNominatim(coarse));
  }
  return canon;
}

/** 0–100. Penaliza niveles administrativos faltantes. */
export function geoConfidenceScore(canon: CanonicalGeo): number {
  let c = 100;
  if (!canon.country) c -= 40;
  if (!canon.region) c -= 10;
  if (!canon.zone) c -= 10;
  if (!canon.admin3) c -= 5;
  if (!canon.locality) c -= 5;
  return Math.max(0, Math.min(100, c));
}

/** Construye el body que espera `resolve-admin-area` desde un CanonicalGeo. */
export function canonicalToResolveBody(canon: CanonicalGeo) {
  return {
    continent: canon.continent,
    country: canon.country,
    region: canon.region,
    zone: canon.zone,
    admin3: canon.admin3,
    locality: canon.locality,
    sublocality: canon.sublocality,
    meta: {
      country: canon.country_code
        ? { iso_code: canon.country_code, source: 'osm' }
        : undefined,
      region: canon.region_type
        ? { admin_type_local: canon.region_type, source: 'osm' }
        : undefined,
      zone: canon.zone_type
        ? { admin_type_local: canon.zone_type, source: 'osm' }
        : undefined,
      admin3: canon.admin3_type
        ? { admin_type_local: canon.admin3_type, source: 'osm' }
        : undefined,
    },
  };
}
