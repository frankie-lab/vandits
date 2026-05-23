// scripts/p2/lib/state.ts
// Read-only status snapshot for the P2 dev runner.
// Guarantees: no mutations. No /start, /pause, /watchdog, /seed calls.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { DevRunnerEnv } from "./env.ts";
import { canonCountryCodes } from "./seed.ts";
import { detectStopConditions } from "./gates.ts";
import { evaluatePilot100, fetchLatestPilot100 } from "./pilot100-gate.ts";

export interface StatusSnapshot {
  utc: string;
  activeRun: RunSummary | null;
  lastTerminalRun: RunSummary | null;
  dRemaining: number;
  pilot100: { pass: boolean; reason: string; label?: string };
  nextBatchAllowed: boolean;
  nextBatchBlockReason?: string;
}

export interface RunSummary {
  id: string;
  label: string;
  status: string;
  aiCallsUsed: number;
  maxAiCalls: number;
  metrics: {
    success: number;
    fail: number;
    skip: number;
    noop: number;
  };
  inFlight: number;
  pending: number;
  errorRatePct: number;
  lastUpdateSecAgo: number;
  stopCondition: string;
  pauseReason: string | null;
  abortReason: string | null;
}

async function fetchActiveOrLatest(env: DevRunnerEnv): Promise<{ active: any; lastTerminal: any }> {
  const client = createClient(env.supabaseUrl, env.serviceRoleKey);
  const { data: runs, error } = await client
    .from("enrichment_batch_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`runs_lookup_failed: ${error.message}`);
  const list = runs ?? [];
  const active = list.find((r: any) => r.status === "running" || r.status === "pending") ?? null;
  const lastTerminal =
    list.find((r: any) => r.status === "completed" || r.status === "aborted" || r.status === "paused") ?? null;
  return { active, lastTerminal };
}

async function summarise(env: DevRunnerEnv, run: any): Promise<RunSummary> {
  const client = createClient(env.supabaseUrl, env.serviceRoleKey);
  const [{ count: pending }, { count: inFlight }] = await Promise.all([
    client.from("enrichment_batch_items").select("*", { count: "exact", head: true }).eq("run_id", run.id).eq("status", "pending"),
    client.from("enrichment_batch_items").select("*", { count: "exact", head: true }).eq("run_id", run.id).eq("status", "in_flight"),
  ]);
  const m = run.metrics ?? {};
  const success = m.success ?? 0;
  const fail = m.fail ?? 0;
  const skip = m.skip ?? 0;
  const noop = m.noop ?? 0;
  const finalised = success + fail;
  const errorRatePct = finalised ? (fail / finalised) * 100 : 0;
  const stop = detectStopConditions({
    status: run.status,
    metrics: m,
    ai_calls_used: run.ai_calls_used,
    max_ai_calls: run.max_ai_calls,
    max_error_rate_pct: run.max_error_rate_pct,
  });
  return {
    id: run.id,
    label: run.label,
    status: run.status,
    aiCallsUsed: run.ai_calls_used ?? 0,
    maxAiCalls: run.max_ai_calls ?? 0,
    metrics: { success, fail, skip, noop },
    inFlight: inFlight ?? 0,
    pending: pending ?? 0,
    errorRatePct,
    lastUpdateSecAgo: run.updated_at ? Math.floor((Date.now() - Date.parse(run.updated_at)) / 1000) : -1,
    stopCondition: stop.kind,
    pauseReason: run.pause_reason ?? null,
    abortReason: run.abort_reason ?? null,
  };
}

async function countDRemaining(env: DevRunnerEnv): Promise<number> {
  const client = createClient(env.supabaseUrl, env.serviceRoleKey);
  // Heuristic SQL-side count: candidates that COULD be D. The strict
  // classifier is applied later when seeding; this is purely informational.
  const { count, error } = await client
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("is_approved", true)
    .eq("geo_health", "ok")
    .is("deleted_at", null)
    .in("country_code", canonCountryCodes());
  if (error) throw new Error(`d_remaining_count_failed: ${error.message}`);
  return count ?? 0;
}

export async function getStatusSnapshot(env: DevRunnerEnv): Promise<StatusSnapshot> {
  const { active, lastTerminal } = await fetchActiveOrLatest(env);
  const activeRun = active ? await summarise(env, active) : null;
  const lastTerminalRun = lastTerminal ? await summarise(env, lastTerminal) : null;
  const dRemaining = await countDRemaining(env);
  const pilot100Run = await fetchLatestPilot100(env);
  const pilot100Verdict = evaluatePilot100(pilot100Run);

  let nextBatchAllowed = true;
  let nextBatchBlockReason: string | undefined;
  if (activeRun && !["completed", "aborted", "paused"].includes(activeRun.status)) {
    nextBatchAllowed = false;
    nextBatchBlockReason = "active_run_not_terminal";
  }

  return {
    utc: new Date().toISOString(),
    activeRun,
    lastTerminalRun,
    dRemaining,
    pilot100: { pass: pilot100Verdict.pass, reason: pilot100Verdict.reason, label: pilot100Verdict.label },
    nextBatchAllowed,
    nextBatchBlockReason,
  };
}

export function formatStatus(snap: StatusSnapshot): string {
  const lines: string[] = [];
  lines.push(`P2 STATUS @ ${snap.utc}`);
  lines.push("─".repeat(60));
  if (snap.activeRun) {
    const r = snap.activeRun;
    lines.push(`Active run     ${r.id.slice(0, 8)}…  ${r.label}  ${r.status}`);
    lines.push(`  ai_calls     ${r.aiCallsUsed} / ${r.maxAiCalls}`);
    lines.push(`  success      ${r.metrics.success}    skip ${r.metrics.skip}    fail ${r.metrics.fail}    noop ${r.metrics.noop}`);
    lines.push(`  in_flight    ${r.inFlight}     pending ${r.pending}`);
    lines.push(`  error_rate   ${r.errorRatePct.toFixed(1)}%`);
    lines.push(`  last update  ${r.lastUpdateSecAgo}s ago`);
    lines.push(`  stop cond.   ${r.stopCondition}`);
    if (r.pauseReason) lines.push(`  pause reason ${r.pauseReason}`);
    if (r.abortReason) lines.push(`  abort reason ${r.abortReason}`);
  } else {
    lines.push("Active run     none");
  }
  if (snap.lastTerminalRun) {
    const t = snap.lastTerminalRun;
    lines.push(`Last terminal  ${t.id.slice(0, 8)}…  ${t.label}  ${t.status}${t.abortReason ? ` (${t.abortReason})` : ""}`);
  }
  lines.push(`D remaining    ${snap.dRemaining.toLocaleString("en-US")}`);
  lines.push(`Pilot-100 gate ${snap.pilot100.pass ? "PASS" : "PENDING/FAIL"} (${snap.pilot100.reason})`);
  lines.push(`Next batch     ${snap.nextBatchAllowed ? "allowed" : `blocked — ${snap.nextBatchBlockReason}`}`);
  return lines.join("\n");
}
