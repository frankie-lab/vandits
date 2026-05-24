// scripts/p2/lib/pilot100-gate.ts
// IO wrapper around the canonical pure evaluator.
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { DevRunnerEnv } from "./env.ts";
import {
  evaluatePilot100,
  type Pilot100GateResult,
  type RunForGate,
} from "../../../supabase/functions/_shared/p2/pilot100-evaluator.ts";

export { evaluatePilot100, type Pilot100GateResult, type RunForGate };

export async function fetchLatestPilot100(env: DevRunnerEnv): Promise<RunForGate | null> {
  const client = createClient(env.supabaseUrl, env.serviceRoleKey);
  const { data, error } = await client
    .from("enrichment_batch_runs")
    .select("id, label, status, metrics")
    .ilike("label", "pilot100-%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`pilot100_lookup_failed: ${error.message}`);
  return (data ?? null) as RunForGate | null;
}
