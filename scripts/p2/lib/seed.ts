// scripts/p2/lib/seed.ts
// IO wrapper around the canonical pure seed filter.
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { LocationRow } from "../../../supabase/functions/_shared/poi-identity-root-status.ts";
import type { DevRunnerEnv } from "./env.ts";
import {
  buildSeedCandidates,
  canonCountryCodes,
  NOMINAL_EXCLUSIONS,
  type CandidateBucket,
} from "../../../supabase/functions/_shared/p2/seed-filter.ts";

export { buildSeedCandidates, canonCountryCodes, NOMINAL_EXCLUSIONS, type CandidateBucket };

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
