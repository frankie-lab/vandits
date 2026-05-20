/**
 * Canonical guard for the `zone ≠ region` rule (R8 of the enrichment
 * coordinate-coherence contract).
 *
 * Single source of truth, mirrored in `supabase/functions/_shared/zone-region-guard.ts`.
 *
 * Rationale: `locations.zone_id` MUST hold a province (ISO 3166-2 level 2),
 * never a duplicate of the region/admin1. If the caller's zone name matches
 * the region name (case- and diacritic-insensitive), `zone_id` MUST be NULL.
 * `region_id` is left untouched.
 *
 * Contract: see `docs/contracts/enrichment-coord-coherence-contract.md` (R8).
 */

function norm(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function shouldDropZone(
  zone?: string | null,
  region?: string | null,
): boolean {
  const z = norm(zone);
  const r = norm(region);
  if (!z || !r) return false;
  return z === r;
}
