// scripts/p2/dev-run-poi-identity-p2.ts
// Internal, temporary, maintenance-only CLI to drain the historical P2
// queue of D POIs pending auto-enrich.
//
// THIS IS NOT A USER-FACING FEATURE. See
// docs/audits/poi-identity-p2-dev-runner-plan.md § Naturaleza temporal / no UX.
//
// Usage:
//   deno run -A scripts/p2/dev-run-poi-identity-p2.ts <command> [flags]
//
// Commands: status | report | close-current | pause | resume | abort | next-batch
//
// In this delivery only `status` and the tests are authorised to run.

import { loadEnv } from "./lib/env.ts";
import { makeOrchestratorClient } from "./lib/http.ts";
import { formatStatus, getStatusSnapshot } from "./lib/state.ts";
import { writeReport } from "./lib/report.ts";
import { evaluatePilot100, fetchLatestPilot100 } from "./lib/pilot100-gate.ts";
import { guardBatchSize } from "./lib/gates.ts";
import { buildSeedCandidates, fetchCandidatePool } from "./lib/seed.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return { command: command ?? "status", flags };
}

async function cmdStatus(json: boolean) {
  const env = loadEnv();
  const snap = await getStatusSnapshot(env);
  if (json) console.log(JSON.stringify(snap, null, 2));
  else console.log(formatStatus(snap));
}

async function cmdReport(runId: string | undefined) {
  const env = loadEnv();
  let resolvedRunId = runId;
  if (!resolvedRunId) {
    const snap = await getStatusSnapshot(env);
    resolvedRunId = snap.activeRun?.id ?? snap.lastTerminalRun?.id;
  }
  if (!resolvedRunId) throw new Error("no_run_id");
  const out = await writeReport({ env, runId: resolvedRunId });
  console.log(JSON.stringify({ wrote: out.path }, null, 2));
}

async function cmdPause(runId: string, reason: string) {
  const env = loadEnv();
  const client = makeOrchestratorClient(env);
  const out = await client.pause(runId, reason);
  console.log(JSON.stringify(out, null, 2));
}

async function cmdResume(runId: string) {
  const env = loadEnv();
  const client = makeOrchestratorClient(env);
  const out = await client.start(runId);
  console.log(JSON.stringify(out, null, 2));
}

async function cmdAbort(runId: string, reason: string) {
  if (!reason) throw new Error("abort_requires_reason");
  const env = loadEnv();
  // Orchestrator has no /abort endpoint; UPDATE directly with service role.
  const client = createClient(env.supabaseUrl, env.serviceRoleKey);
  const { error } = await client
    .from("enrichment_batch_runs")
    .update({
      status: "aborted",
      abort_reason: reason,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(`abort_failed: ${error.message}`);
  console.log(JSON.stringify({ run_id: runId, status: "aborted", reason }, null, 2));
}

async function cmdCloseCurrent() {
  const env = loadEnv();
  const snap = await getStatusSnapshot(env);
  const active = snap.activeRun;
  if (!active) {
    console.log(JSON.stringify({ action: "noop", reason: "no_active_run" }, null, 2));
    return;
  }
  if (["completed", "aborted", "paused"].includes(active.status)) {
    const out = await writeReport({ env, runId: active.id });
    console.log(JSON.stringify({ action: "report_only", wrote: out.path }, null, 2));
    return;
  }
  if (active.stopCondition !== "none") {
    await cmdAbort(active.id, `auto:${active.stopCondition}`);
    const out = await writeReport({ env, runId: active.id });
    console.log(JSON.stringify({ action: "aborted_due_to_stop", wrote: out.path }, null, 2));
    return;
  }
  if (active.lastUpdateSecAgo >= 0 && active.lastUpdateSecAgo > 300 && active.inFlight > 0) {
    const client = makeOrchestratorClient(env);
    const w = await client.watchdog(active.id, 5);
    console.log(JSON.stringify({ action: "watchdog", result: w }, null, 2));
    return;
  }
  console.log(JSON.stringify({ action: "healthy_running_no_op" }, null, 2));
}

async function cmdNextBatch(sizeStr: string | undefined, confirm: boolean) {
  const env = loadEnv();
  const snap = await getStatusSnapshot(env);
  if (!snap.nextBatchAllowed) {
    throw new Error(`next_batch_blocked: ${snap.nextBatchBlockReason}`);
  }
  const size = Number(sizeStr ?? "100");
  const pilot100 = evaluatePilot100(await fetchLatestPilot100(env));
  const guard = guardBatchSize({ size, confirm, pilot100Pass: pilot100.pass });
  if (!guard.ok) throw new Error(`next_batch_rejected: ${guard.reason}`);

  const pool = await fetchCandidatePool(env, size * 5);
  const { eligibleIds, rejected } = buildSeedCandidates(pool);
  const picked = eligibleIds.slice(0, size);
  if (picked.length === 0) {
    throw new Error("next_batch_no_candidates");
  }

  const orchestrator = makeOrchestratorClient(env);
  const label = `p2-dev-batch${size}-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;
  const seedRes = await orchestrator.seed({
    label,
    location_ids: picked,
    chunk_size: 1,
    max_ai_calls: size,
    max_runtime_minutes: 60,
    max_error_rate_pct: 5,
    confirm_full_run: size > 50,
  });
  const runId = (seedRes as any).run_id;
  if (!runId) throw new Error(`seed_no_run_id: ${JSON.stringify(seedRes)}`);
  const startRes = await orchestrator.start(runId);
  console.log(JSON.stringify({
    label,
    run_id: runId,
    requested_size: size,
    actual_size: picked.length,
    rejected_count: rejected.length,
    start: startRes,
  }, null, 2));
}

async function main() {
  const args = parseArgs(Deno.args);
  try {
    switch (args.command) {
      case "status":
        await cmdStatus(args.flags.json === true);
        break;
      case "report":
        await cmdReport(typeof args.flags["run-id"] === "string" ? (args.flags["run-id"] as string) : undefined);
        break;
      case "close-current":
        await cmdCloseCurrent();
        break;
      case "pause":
        await cmdPause(String(args.flags["run-id"] ?? ""), String(args.flags.reason ?? "manual"));
        break;
      case "resume":
        await cmdResume(String(args.flags["run-id"] ?? ""));
        break;
      case "abort":
        await cmdAbort(String(args.flags["run-id"] ?? ""), String(args.flags.reason ?? ""));
        break;
      case "next-batch":
        await cmdNextBatch(
          typeof args.flags.size === "string" ? (args.flags.size as string) : undefined,
          args.flags.confirm === true,
        );
        break;
      default:
        console.error(`unknown_command: ${args.command}`);
        Deno.exit(2);
    }
  } catch (e) {
    console.error(`ERR: ${(e as Error).message}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
