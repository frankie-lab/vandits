/**
 * POI-Identity Root Status — espejo CLIENTE del clasificador Deno.
 *
 * Port 1:1 de `supabase/functions/_shared/poi-identity-root-status.ts`.
 *
 * - Mismo orden de decisión.
 * - Mismas reglas A/B/C/D.
 * - Mismas `skipReason`.
 * - Cualquier drift respecto al Deno DEBE romper el contract test de paridad
 *   (`src/test/poi-identity-root-status-client-parity.test.ts`) consumiendo
 *   las fixtures compartidas en `src/test/fixtures/poi-identity-root-status.fixtures.json`.
 *
 * NORMA: no se reimplementan predicados, no se reordenan ramas. Si Deno
 * cambia, este archivo Y las fixtures cambian en el mismo PR.
 *
 * Ver:
 *   - docs/contracts/poi-identity-root-status-contract.md
 *   - docs/audits/search-filter-root-status-filter-plan.md §5.1
 */

import { inspectWgs84Coord } from '@/shared/geography/coord-validity';
import { TERRITORIAL_CANON } from '@/shared/geography/territorial-canon';
import type { GeoLocation } from '@/types/location';

/** Hard sandbox uid (sandbox-agent@vandits.test). Idéntico a Deno. */
export const SANDBOX_OWNER_UID = 'f04b3b95-7308-4b74-b3c7-7e819767c5fb';

export type IdentityRoot = 'A' | 'B' | 'C' | 'D';

export type SkipReason =
  | 'root_a_missing_identity'
  | 'root_c_incoherent_identity'
  | 'root_b_unresolved'
  | 'fixture'
  | 'under_review'
  | 'geo_hard_error'
  | 'canon_gap'
  | 'already_enriched'
  | 'in_progress'
  | 'unresolved_flag'
  | 'invalid_coordinates'
  | 'deleted'
  | 'not_approved';

/**
 * Shape canónico de la fila (snake_case, igual al Deno). El adaptador
 * `geoLocationToRow` mapea desde `GeoLocation` cliente.
 */
export interface LocationRow {
  id?: string | null;
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  country_code?: string | null;
  country_id?: string | null;
  region_id?: string | null;
  geo_health?: string | null;
  enrichment_status?: string | null;
  is_approved?: boolean | null;
  deleted_at?: string | null;
  owner_user_id?: string | null;
  enriched_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface ClassificationResult {
  root: IdentityRoot;
  /** True sólo cuando root='D' AND ninguna skip reason aplica. */
  eligibleForAutoEnrich: boolean;
  /** Presente sii `eligibleForAutoEnrich === false`. */
  skipReason?: SkipReason;
  /** Detalle humano para logs / audit. */
  detail?: string;
}

function isCanonCountry(iso2: string | null | undefined): boolean {
  if (!iso2) return false;
  return Object.prototype.hasOwnProperty.call(
    TERRITORIAL_CANON,
    iso2.toUpperCase(),
  );
}

function hasDescripcion(
  enriched: Record<string, unknown> | null | undefined,
): boolean {
  if (!enriched || typeof enriched !== 'object') return false;
  const d = (enriched as { descripcion?: unknown }).descripcion;
  return typeof d === 'string' && d.trim().length > 0;
}

function isFixture(loc: LocationRow): boolean {
  if (loc.owner_user_id === SANDBOX_OWNER_UID) return true;
  const meta = loc.metadata ?? {};
  if ((meta as { synthetic?: unknown }).synthetic === true) return true;
  if (String((meta as { synthetic?: unknown }).synthetic) === 'true') return true;
  const id = String(loc.id ?? '');
  if (id.includes('e2e')) return true;
  const name = String(loc.name ?? '');
  if (/^beta-chain-/i.test(name)) return true;
  return false;
}

/**
 * Clasifica una `LocationRow` en A/B/C/D y decide `eligibleForAutoEnrich`.
 *
 * Port literal del Deno. Cualquier cambio debe replicarse en el Deno SoT
 * y las fixtures compartidas en el mismo PR.
 */
export function classifyPoiIdentityRootStatusClient(
  loc: LocationRow,
): ClassificationResult {
  // Hard pre-conditions.
  if (loc.deleted_at) {
    return { root: 'A', eligibleForAutoEnrich: false, skipReason: 'deleted' };
  }
  if (loc.is_approved === false) {
    return { root: 'A', eligibleForAutoEnrich: false, skipReason: 'not_approved' };
  }

  // Fixture / under-review / lifecycle flags.
  if (isFixture(loc)) {
    return { root: 'D', eligibleForAutoEnrich: false, skipReason: 'fixture' };
  }
  if ((loc.metadata as { under_review?: unknown } | null)?.under_review === true) {
    return { root: 'D', eligibleForAutoEnrich: false, skipReason: 'under_review' };
  }
  if (loc.enrichment_status === 'in_progress') {
    return { root: 'D', eligibleForAutoEnrich: false, skipReason: 'in_progress' };
  }
  if (loc.enrichment_status === 'unresolved') {
    return { root: 'D', eligibleForAutoEnrich: false, skipReason: 'unresolved_flag' };
  }

  // Coordinate gate (A).
  const coord = inspectWgs84Coord(loc.latitude, loc.longitude);
  if (!coord.valid) {
    return {
      root: 'A',
      eligibleForAutoEnrich: false,
      skipReason: 'invalid_coordinates',
      detail: coord.reason,
    };
  }

  // Identity gate — A: nombre ausente.
  const rawName = (loc.name ?? '').trim();
  if (!rawName) {
    return { root: 'A', eligibleForAutoEnrich: false, skipReason: 'root_a_missing_identity' };
  }

  // C: identidad incoherente.
  const gh = (loc.geo_health ?? '').toLowerCase();
  if (gh === 'broken' || gh === 'stale_name' || gh === 'empty') {
    return {
      root: 'C',
      eligibleForAutoEnrich: false,
      skipReason: 'root_c_incoherent_identity',
      detail: gh,
    };
  }
  if (gh === 'harderror' || gh === 'hard_error') {
    return { root: 'C', eligibleForAutoEnrich: false, skipReason: 'geo_hard_error' };
  }

  // Canon gap — country fuera de TERRITORIAL_CANON.
  if (!isCanonCountry(loc.country_code)) {
    return {
      root: 'B',
      eligibleForAutoEnrich: false,
      skipReason: 'canon_gap',
      detail: loc.country_code ?? 'null',
    };
  }

  // B unresolved.
  if (gh === 'partial') {
    return {
      root: 'B',
      eligibleForAutoEnrich: false,
      skipReason: 'root_b_unresolved',
      detail: 'geo_partial',
    };
  }
  if (!loc.country_id) {
    return {
      root: 'B',
      eligibleForAutoEnrich: false,
      skipReason: 'root_b_unresolved',
      detail: 'country_id_null',
    };
  }
  if (gh && gh !== 'ok') {
    return {
      root: 'B',
      eligibleForAutoEnrich: false,
      skipReason: 'root_b_unresolved',
      detail: `geo_health=${gh}`,
    };
  }

  // Ya enriquecido (D pero no candidato).
  if (hasDescripcion(loc.enriched_data ?? null)) {
    return { root: 'D', eligibleForAutoEnrich: false, skipReason: 'already_enriched' };
  }

  // D candidato.
  return { root: 'D', eligibleForAutoEnrich: true };
}

// ============================================================================
// Adapter GeoLocation → LocationRow (best-effort)
// ============================================================================
//
// El cliente NO siempre tiene `country_code`, `country_id`, `metadata` ni
// `deleted_at` poblados. `dbLocationToGeoLocation` pasa-through ya
// `countryCode`/`countryId`/`metadata` cuando están en la vista. Si faltan,
// el clasificador caerá a la rama Deno conservadora (típicamente B).
// Es el comportamiento esperado.

type ClientLooseFields = {
  countryCode?: string | null;
  country_code?: string | null;
  countryId?: string | null;
  country_id?: string | null;
  regionId?: string | null;
  region_id?: string | null;
  metadata?: Record<string, unknown> | null;
  deletedAt?: string | null;
  deleted_at?: string | null;
};

export function geoLocationToRow(loc: GeoLocation): LocationRow {
  const x = loc as GeoLocation & ClientLooseFields;
  return {
    id: loc.id,
    name: loc.name,
    latitude: loc.coordinates?.lat ?? null,
    longitude: loc.coordinates?.lng ?? null,
    country_code: x.countryCode ?? x.country_code ?? null,
    country_id: x.countryId ?? x.country_id ?? null,
    region_id: x.regionId ?? x.region_id ?? null,
    geo_health: loc.geoHealth ?? null,
    enrichment_status: loc.enrichmentStatus ?? null,
    is_approved: loc.isApproved ?? null,
    deleted_at: x.deletedAt ?? x.deleted_at ?? null,
    owner_user_id: loc.ownerUserId ?? null,
    enriched_data: (loc.enrichedData as unknown as Record<string, unknown>) ?? null,
    metadata: x.metadata ?? null,
  };
}

/**
 * Conveniencia para UI/matcher: clasifica directamente un `GeoLocation`.
 * Memoizable por id+hash de campos relevantes en consumers calientes.
 */
export function classifyPoiRootStatusForLocation(
  loc: GeoLocation,
): { rootStatus: IdentityRoot; eligibleForAutoEnrich: boolean; reason: string } {
  const r = classifyPoiIdentityRootStatusClient(geoLocationToRow(loc));
  return {
    rootStatus: r.root,
    eligibleForAutoEnrich: r.eligibleForAutoEnrich,
    reason: r.skipReason ?? (r.eligibleForAutoEnrich ? 'eligible' : 'unknown'),
  };
}
