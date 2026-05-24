/**
 * Canonical WGS84 coordinate validity gate.
 *
 * Single source of truth used by both client (`triggerEnrichLocation`,
 * imports, popup actions) and edge functions (mirrored at
 * `supabase/functions/_shared/coord-validity.ts`).
 *
 * Contract: see `docs/contracts/enrichment-coord-coherence-contract.md` (R1).
 *
 * A coordinate is **valid** when it is finite, inside WGS84 bounds, and not
 * the `(0, 0)` Null Island sentinel — which in this project is the canonical
 * marker of "coords never resolved" (see `enrichment-coord-coherence-audit`).
 */

export type InvalidCoordReason =
  | 'not_a_number'
  | 'not_finite'
  | 'out_of_range'
  | 'null_island';

export interface CoordValidityResult {
  valid: boolean;
  reason?: InvalidCoordReason;
}

const NULL_ISLAND_EPSILON = 1e-7;

export function inspectWgs84Coord(
  lat: unknown,
  lng: unknown,
): CoordValidityResult {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { valid: false, reason: 'not_a_number' };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, reason: 'not_finite' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, reason: 'out_of_range' };
  }
  if (Math.abs(lat) < NULL_ISLAND_EPSILON && Math.abs(lng) < NULL_ISLAND_EPSILON) {
    return { valid: false, reason: 'null_island' };
  }
  return { valid: true };
}

export function isValidWgs84Coord(lat: unknown, lng: unknown): boolean {
  return inspectWgs84Coord(lat, lng).valid;
}
