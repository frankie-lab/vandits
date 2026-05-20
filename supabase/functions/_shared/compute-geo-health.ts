/**
 * Deno mirror of `src/shared/geography/compute-geo-health.ts`.
 *
 * Fase 5 / R2 — defensa en profundidad para edges (no se cablea en esta
 * fase, sólo se publica). Mantener idéntico al cliente.
 */

import { inspectWgs84Coord } from './coord-validity.ts';

export type GeoHealth =
  | 'ok'
  | 'broken'
  | 'partial'
  | 'stale_name'
  | 'empty'
  | 'hardError';

export interface GeoHealthInput {
  latitude?: number | null;
  longitude?: number | null;
  enrichmentStatus?: string | null;
  enrichment_status?: string | null;
  rawGeocode?: unknown;
  raw_geocode?: unknown;
  geoHealth?: GeoHealth | string | null;
  geo_health?: GeoHealth | string | null;
}

function readEnrichmentStatus(loc: GeoHealthInput): string | null {
  return loc.enrichmentStatus ?? loc.enrichment_status ?? null;
}

function readRawGeocode(loc: GeoHealthInput): unknown {
  return loc.rawGeocode ?? loc.raw_geocode ?? null;
}

function readPersistedHealth(loc: GeoHealthInput): GeoHealth {
  const v = (loc.geoHealth ?? loc.geo_health) as GeoHealth | undefined | null;
  return (v ?? 'empty') as GeoHealth;
}

export function isHardErrorGeo(loc: GeoHealthInput | null | undefined): boolean {
  if (!loc) return true;
  const { latitude: lat, longitude: lng } = loc;
  if (lat == null || lng == null) return true;
  const check = inspectWgs84Coord(lat, lng);
  if (!check.valid) return true;
  if (readEnrichmentStatus(loc) === 'enriched' && readRawGeocode(loc) == null) {
    return true;
  }
  return false;
}

export function computeHonestGeoHealth(
  loc: GeoHealthInput | null | undefined,
): GeoHealth {
  if (isHardErrorGeo(loc)) return 'hardError';
  return readPersistedHealth(loc!);
}
