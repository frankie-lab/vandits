/**
 * compute-geo-health — Helper cliente espejo del trigger SQL
 * `_compute_location_geo_health` (Fase 5 / R2).
 *
 * Fuente de verdad real = trigger en `public.locations` (migración
 * `20260509110659_*` ampliada en Fase 5). Este helper es **defensa en
 * profundidad**: si el cliente recibe un `loc.geoHealth = 'ok'` que ha
 * quedado stale (por ejemplo, fila vieja sin haber pasado por el trigger
 * tras la rewrite), las reglas R2 se reaplican localmente para que
 * sharing/export/UI no traten al POI como sano.
 *
 * Regla R2 — `hardError` cuando:
 *   - `latitude` o `longitude` son `null/undefined/NaN/no-finite`
 *   - `(0, 0)` Null Island
 *   - `|lat| > 90` o `|lng| > 180`
 *   - `enrichment_status = 'enriched'` y `raw_geocode IS NULL`
 *
 * Ver `docs/contracts/enrichment-coord-coherence-contract.md` §R2.
 */

import { inspectWgs84Coord } from './coord-validity';

export type GeoHealth =
  | 'ok'
  | 'broken'
  | 'partial'
  | 'stale_name'
  | 'empty'
  | 'hardError';

/**
 * Forma mínima que necesita el helper. Acepta tanto camelCase (cliente)
 * como snake_case (rows crudas de DB / fixtures de test).
 */
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

/**
 * ¿Las coords (o la falta de raw_geocode) hacen este POI un `hardError`?
 * Aplica R2 íntegro.
 */
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

/**
 * Devuelve el `geo_health` "honesto" del POI:
 *   - `hardError` si R2 falla, **independientemente** del valor persistido.
 *   - En cualquier otro caso, el valor persistido (o `'empty'` si falta).
 *
 * No reescribe DB: sólo se usa en lectura (sharing/export/UI).
 */
export function computeHonestGeoHealth(
  loc: GeoHealthInput | null | undefined,
): GeoHealth {
  if (isHardErrorGeo(loc)) return 'hardError';
  return readPersistedHealth(loc!);
}
