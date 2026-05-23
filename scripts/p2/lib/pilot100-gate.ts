// scripts/p2/lib/pilot100-gate.ts
// Pilot-100 PASS gate. Used by `next-batch --size 250`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { DevRunnerEnv } from "./env.ts";

export interface Pilot100GateResult {
  pass: boolean;
  reason: string;
  runId?: string;
  label?: string;
}

export interface RunForGate {
  id: string;
  label: string;
  status: string;
  metrics: {
    success?: number;
    fail?: number;
    skip?: number;
  } | null;
}

export function evaluatePilot100(run: RunForGate | null): Pilot100GateResult {
  if (!run) return { pass: false, reason: "no_pilot100_run_found" };
  if (!(run.status === "completed" || run.status === "paused")) {
    return { pass: false, reason: `pilot100_not_terminal:${run.status}`, runId: run.id, label: run.label };
  }
  const success = run.metrics?.success ?? 0;
  const fail = run.metrics?.fail ?? 0;
  const skip = run.metrics?.skip ?? 0;
  if (fail > 0) return { pass: false, reason: `pilot100_has_failures:${fail}`, runId: run.id, label: run.label };
  const finalised = success + fail + skip;
  if (finalised === 0) return { pass: false, reason: "pilot100_no_metrics", runId: run.id, label: run.label };
  const ratio = success / finalised;
  if (ratio < 0.4) return { pass: false, reason: `pilot100_success_ratio_low:${ratio.toFixed(2)}`, runId: run.id, label: run.label };
  return { pass: true, reason: "ok", runId: run.id, label: run.label };
}

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
