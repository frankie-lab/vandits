// scripts/p2/lib/seed.ts
// Build a strict D-only candidate list for the next batch.
//
// Re-uses the canonical classifier `classifyPoiIdentityRootStatus` from the
// shared edge-function helpers — same SoT used by `batch-enrich` and
// `enrich-location`. No fork, no parallel rules.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  classifyPoiIdentityRootStatus,
  SANDBOX_OWNER_UID,
  type LocationRow,
} from "../../../supabase/functions/_shared/poi-identity-root-status.ts";
import { TERRITORIAL_CANON } from "../../../supabase/functions/_shared/territorial-canon.ts";
import type { DevRunnerEnv } from "./env.ts";

/** Historical exclusion list — POIs already enriched / known-bad in prior pilots. */
export const NOMINAL_EXCLUSIONS = [
  "Tolar Grande",
  "Eisriesenwelt",
  "Burg Hochosterwitz",
  "Mattsee",
];

export interface CandidateBucket {
  eligibleIds: string[];
  rejected: { id: string; reason: string }[];
}

/**
 * Pure filter: takes rows (already fetched) and returns ids that pass the
 * D-only gate. Exposed for tests.
 */
export function buildSeedCandidates(rows: LocationRow[]): CandidateBucket {
  const eligibleIds: string[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    if (row.owner_user_id === SANDBOX_OWNER_UID) {
      rejected.push({ id, reason: "sandbox_fixture" });
      continue;
    }
    if (NOMINAL_EXCLUSIONS.includes(String(row.name ?? ""))) {
      rejected.push({ id, reason: "nominal_exclusion" });
      continue;
    }
    const verdict = classifyPoiIdentityRootStatus(row);
    if (verdict.root !== "D" || !verdict.eligibleForAutoEnrich) {
      rejected.push({
        id,
        reason: verdict.skipReason ?? `root_${verdict.root.toLowerCase()}`,
      });
      continue;
    }
    eligibleIds.push(id);
  }
  return { eligibleIds, rejected };
}

/** Build the canonical country-code allowlist (TERRITORIAL_CANON keys). */
export function canonCountryCodes(): string[] {
  return Object.keys(TERRITORIAL_CANON);
}

/**
 * Fetch a pool of pending D candidates from `locations`. Read-only.
 * `limit` is the SQL-side cap; the canonical filter is then re-applied
 * client-side via `buildSeedCandidates` for defense-in-depth.
 */
export async function fetchCandidatePool(
  env: DevRunnerEnv,
  limit: number,
): Promise<LocationRow[]> {
  const client: SupabaseClient = createClient(env.supabaseUrl, env.serviceRoleKey);
  const { data, error } = await client
    .from("locations")
    .select(
      "id, name, latitude, longitude, country_code, country_id, region_id, geo_health, enrichment_status, is_approved, deleted_at, owner_user_id, enriched_data, metadata",
    )
    .eq("is_approved", true)
    .eq("geo_health", "ok")
    .is("deleted_at", null)
    .in("country_code", canonCountryCodes())
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`pool_fetch_failed: ${error.message}`);
  return (data ?? []) as LocationRow[];
}
