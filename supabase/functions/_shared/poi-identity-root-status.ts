/**
 * POI-Identity Root Status — server-side single source of truth.
 *
 * Implements the §2.2 inclusion filter + §2.3 exclusion filter from
 * `docs/audits/poi-identity-p1-p2-parallel-execution-plan.md`.
 *
 * Used by `batch-enrich` (pre-IA gate) and `enrich-location` (revalidation
 * just before write) to guarantee that ONLY POIs classified as root='D'
 * with a healthy, canon-resolvable territorial trail can reach the LLM.
 *
 * Contract reference:
 *   - docs/contracts/poi-identity-root-status-contract.md
 *   - docs/audits/poi-identity-root-status-dry-run.md
 *
 * No data writes. No IA calls. Pure classification.
 */

import { TERRITORIAL_CANON } from "./territorial-canon.ts";
import { inspectWgs84Coord } from "./coord-validity.ts";

/** Hard sandbox uid (sandbox-agent@vandits.test). Never auto-enrich. */
export const SANDBOX_OWNER_UID = "f04b3b95-7308-4b74-b3c7-7e819767c5fb";

export type IdentityRoot = "A" | "B" | "C" | "D";

export type SkipReason =
  | "root_a_missing_identity"
  | "root_c_incoherent_identity"
  | "root_b_unresolved"
  | "fixture"
  | "under_review"
  | "geo_hard_error"
  | "canon_gap"
  | "already_enriched"
  | "in_progress"
  | "unresolved_flag"
  | "invalid_coordinates"
  | "deleted"
  | "not_approved";

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
  /** True only when root='D' AND none of the §2.3 skip reasons apply. */
  eligibleForAutoEnrich: boolean;
  /** Present iff `eligibleForAutoEnrich === false`. */
  skipReason?: SkipReason;
  /** Human-readable detail for logs / audit. */
  detail?: string;
}

function isCanonCountry(iso2: string | null | undefined): boolean {
  if (!iso2) return false;
  return Object.prototype.hasOwnProperty.call(
    TERRITORIAL_CANON,
    iso2.toUpperCase(),
  );
}

function hasDescripcion(enriched: Record<string, unknown> | null | undefined): boolean {
  if (!enriched || typeof enriched !== "object") return false;
  const d = (enriched as { descripcion?: unknown }).descripcion;
  return typeof d === "string" && d.trim().length > 0;
}

function isFixture(loc: LocationRow): boolean {
  if (loc.owner_user_id === SANDBOX_OWNER_UID) return true;
  const meta = loc.metadata ?? {};
  if ((meta as { synthetic?: unknown }).synthetic === true) return true;
  if (String((meta as { synthetic?: unknown }).synthetic) === "true") return true;
  const id = String(loc.id ?? "");
  if (id.includes("e2e")) return true;
  const name = String(loc.name ?? "");
  if (/^beta-chain-/i.test(name)) return true;
  return false;
}

/**
 * Classify a location row into A/B/C/D and decide auto-enrich eligibility.
 *
 * The classifier is conservative: any uncertainty falls into B/C (skip),
 * never into D. See dry-run §4 for the canonical heuristic.
 */
export function classifyPoiIdentityRootStatus(loc: LocationRow): ClassificationResult {
  // Hard pre-conditions (not even classifiable as A/B/C/D for auto-enrich purposes).
  if (loc.deleted_at) {
    return { root: "A", eligibleForAutoEnrich: false, skipReason: "deleted" };
  }
  if (loc.is_approved === false) {
    return { root: "A", eligibleForAutoEnrich: false, skipReason: "not_approved" };
  }

  // Fixture / under-review / lifecycle flags (§2.3 #4, #5, #9, #10).
  if (isFixture(loc)) {
    return { root: "D", eligibleForAutoEnrich: false, skipReason: "fixture" };
  }
  if ((loc.metadata as { under_review?: unknown } | null)?.under_review === true) {
    return { root: "D", eligibleForAutoEnrich: false, skipReason: "under_review" };
  }
  if (loc.enrichment_status === "in_progress") {
    return { root: "D", eligibleForAutoEnrich: false, skipReason: "in_progress" };
  }
  if (loc.enrichment_status === "unresolved") {
    return { root: "D", eligibleForAutoEnrich: false, skipReason: "unresolved_flag" };
  }

  // Coordinate gate (§2.2 lat/lng bounds + not-(0,0); maps to A in dry-run §4.1).
  const coord = inspectWgs84Coord(loc.latitude, loc.longitude);
  if (!coord.valid) {
    return {
      root: "A",
      eligibleForAutoEnrich: false,
      skipReason: "invalid_coordinates",
      detail: coord.reason,
    };
  }

  // Identity gate — A: missing usable name (dry-run §4.1).
  const rawName = (loc.name ?? "").trim();
  if (!rawName) {
    return { root: "A", eligibleForAutoEnrich: false, skipReason: "root_a_missing_identity" };
  }

  // C: incoherent identity (dry-run §4.3, geo_health hardError subset).
  const gh = (loc.geo_health ?? "").toLowerCase();
  if (gh === "broken" || gh === "stale_name" || gh === "empty") {
    return { root: "C", eligibleForAutoEnrich: false, skipReason: "root_c_incoherent_identity", detail: gh };
  }
  if (gh === "harderror" || gh === "hard_error") {
    return { root: "C", eligibleForAutoEnrich: false, skipReason: "geo_hard_error" };
  }

  // Canon gap (§2.3 #7) — country outside TERRITORIAL_CANON.
  if (!isCanonCountry(loc.country_code)) {
    return { root: "B", eligibleForAutoEnrich: false, skipReason: "canon_gap", detail: loc.country_code ?? "null" };
  }

  // B unresolved (dry-run §4.2): partial geo OR missing country_id.
  if (gh === "partial") {
    return { root: "B", eligibleForAutoEnrich: false, skipReason: "root_b_unresolved", detail: "geo_partial" };
  }
  if (!loc.country_id) {
    return { root: "B", eligibleForAutoEnrich: false, skipReason: "root_b_unresolved", detail: "country_id_null" };
  }

  // Geo health must be "ok" by this point to reach D.
  if (gh && gh !== "ok") {
    return { root: "B", eligibleForAutoEnrich: false, skipReason: "root_b_unresolved", detail: `geo_health=${gh}` };
  }

  // Already enriched (§2.3 #8) — D but not a candidate.
  if (hasDescripcion(loc.enriched_data ?? null)) {
    return { root: "D", eligibleForAutoEnrich: false, skipReason: "already_enriched" };
  }

  // D: confirmed identity, healthy geo, in canon, pending description.
  return { root: "D", eligibleForAutoEnrich: true };
}
