// supabase/functions/poi-p2-runner-bridge/index.ts
//
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.
//
// Master-only bridge for the P2 auto-enrich runner UI (/admin/dev/poi-p2-runner).
// Wraps `enrich-batch-orchestrator` and exposes a single POST endpoint that
// dispatches actions: status | report | pause | resume | abort | start-next-batch
//
// Authorization:
//   1. requireCapability('run_internal_tooling')  (server-side via has_permission)
//   2. has_role(uid, 'master')                    (defense in depth)
//
// Mutating actions (`pause` / `resume` / `abort` / `start-next-batch`) require
// `ALLOW_P2_REAL_BATCH=1` in the function env. Otherwise they return
// { dryRun: true, reason: "ALLOW_P2_REAL_BATCH_off" } and write a dry-run
// audit row. `status` and `report` are live read-only regardless.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireCapability } from "../_shared/require-capability.ts";
import { guardBatchSize, isTerminal, detectStopConditions } from "../_shared/p2/gates.ts";
import {
  evaluatePilot100,
  type RunForGate,
} from "../_shared/p2/pilot100-evaluator.ts";
import {
  buildSeedCandidates,
  canonCountryCodes,
} from "../_shared/p2/seed-filter.ts";
import { renderReportBody } from "../_shared/p2/report-render.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Action = "status" | "report" | "pause" | "resume" | "abort" | "start-next-batch";
const MUTATING: Action[] = ["pause", "resume", "abort", "start-next-batch"];

interface RequestBody {
  action: Action;
  runId?: string;
  reason?: string;
  size?: number;
  confirmToken?: string;
}

function parseBody(raw: unknown): RequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const action = b.action as Action;
  if (!["status", "report", "pause", "resume", "abort", "start-next-batch"].includes(action)) return null;
  return {
    action,
    runId: typeof b.runId === "string" ? b.runId : undefined,
    reason: typeof b.reason === "string" ? b.reason : undefined,
    size: typeof b.size === "number" ? b.size : undefined,
    confirmToken: typeof b.confirmToken === "string" ? b.confirmToken : undefined,
  };
}

async function isMaster(adminClient: any, uid: string): Promise<boolean> {
  const { data, error } = await adminClient.rpc("has_role", {
    _user_id: uid,
    _role: "master",
  });
  if (error) return false;
  return data === true;
}

async function writeAudit(
  adminClient: any,
  payload: {
    user_id: string;
    action: string;
    run_id?: string | null;
    batch_size?: number | null;
    reason?: string | null;
    result?: unknown;
    report_path?: string | null;
  },
) {
  await adminClient.from("poi_p2_runner_audit").insert({
    user_id: payload.user_id,
    action: payload.action,
    run_id: payload.run_id ?? null,
    batch_size: payload.batch_size ?? null,
    reason: payload.reason ?? null,
    result: (payload.result as any) ?? null,
    report_path: payload.report_path ?? null,
  });
}

// ───────────────────── status (live read-only) ─────────────────────
async function handleStatus(adminClient: any) {
  const { data: runs, error } = await adminClient
    .from("enrichment_batch_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`runs_lookup_failed: ${error.message}`);
  const list = runs ?? [];
  const active = list.find((r: any) => r.status === "running" || r.status === "pending") ?? null;
  const lastTerminal = list.find((r: any) => isTerminal(r.status)) ?? null;

  async function summarise(run: any) {
    const [pendingRes, inFlightRes] = await Promise.all([
      adminClient.from("enrichment_batch_items").select("*", { count: "exact", head: true })
        .eq("run_id", run.id).eq("status", "pending"),
      adminClient.from("enrichment_batch_items").select("*", { count: "exact", head: true })
        .eq("run_id", run.id).eq("status", "in_flight"),
    ]);
    const m = run.metrics ?? {};
    const success = m.success ?? 0, fail = m.fail ?? 0, skip = m.skip ?? 0, noop = m.noop ?? 0;
    const finalised = success + fail;
    const stop = detectStopConditions({
      status: run.status, metrics: m,
      ai_calls_used: run.ai_calls_used, max_ai_calls: run.max_ai_calls,
      max_error_rate_pct: run.max_error_rate_pct,
    });
    return {
      id: run.id, label: run.label, status: run.status,
      aiCallsUsed: run.ai_calls_used ?? 0, maxAiCalls: run.max_ai_calls ?? 0,
      metrics: { success, fail, skip, noop },
      pending: pendingRes.count ?? 0,
      inFlight: inFlightRes.count ?? 0,
      errorRatePct: finalised ? (fail / finalised) * 100 : 0,
      lastUpdateSecAgo: run.updated_at ? Math.floor((Date.now() - Date.parse(run.updated_at)) / 1000) : -1,
      stopCondition: stop.kind,
      pauseReason: run.pause_reason ?? null,
      abortReason: run.abort_reason ?? null,
      startedAt: run.started_at ?? null,
      updatedAt: run.updated_at ?? null,
    };
  }

  const activeRun = active ? await summarise(active) : null;
  const lastTerminalRun = lastTerminal ? await summarise(lastTerminal) : null;

  const { count: dRemaining } = await adminClient
    .from("locations").select("id", { count: "exact", head: true })
    .eq("is_approved", true).eq("geo_health", "ok").is("deleted_at", null)
    .in("country_code", canonCountryCodes());

  const { data: pilot100Row } = await adminClient
    .from("enrichment_batch_runs")
    .select("id, label, status, metrics")
    .ilike("label", "pilot100-%")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const pilot100 = evaluatePilot100((pilot100Row ?? null) as RunForGate | null);

  let nextBatchAllowed = true;
  let nextBatchBlockReason: string | undefined;
  if (activeRun && !isTerminal(activeRun.status)) {
    nextBatchAllowed = false;
    nextBatchBlockReason = "active_run_not_terminal";
  }

  return {
    utc: new Date().toISOString(),
    activeRun,
    lastTerminalRun,
    dRemaining: dRemaining ?? 0,
    pilot100: { pass: pilot100.pass, reason: pilot100.reason, label: pilot100.label },
    nextBatchAllowed,
    nextBatchBlockReason,
    allowRealBatch: Deno.env.get("ALLOW_P2_REAL_BATCH") === "1",
  };
}

// ───────────────────── report (live read-only) ─────────────────────
async function handleReport(adminClient: any, runId: string) {
  const { data: run, error } = await adminClient
    .from("enrichment_batch_runs").select("*").eq("id", runId).single();
  if (error || !run) throw new Error(`run_not_found: ${error?.message}`);
  const { data: items } = await adminClient
    .from("enrichment_batch_items")
    .select("location_id, status, skip_reason, fail_reason").eq("run_id", runId);
  const { data: snapshots } = await adminClient
    .from("enrichment_batch_snapshots").select("location_id").eq("run_id", runId);

  const successIds = (items ?? []).filter((it: any) => it.status === "success")
    .slice(0, 5).map((it: any) => it.location_id);
  let persistenceSample: any[] = [];
  if (successIds.length > 0) {
    const { data: locs } = await adminClient
      .from("locations").select("id, enriched_data, updated_at").in("id", successIds);
    persistenceSample = (locs ?? []).map((l: any) => ({
      id: l.id,
      descLength: typeof l.enriched_data?.descripcion === "string"
        ? l.enriched_data.descripcion.length : 0,
      updated_at: l.updated_at,
    }));
  }

  const body = renderReportBody(run, items ?? [], snapshots ?? [], persistenceSample);
  return { runId, label: run.label, status: run.status, markdown: body };
}

// ───────────────────── start-next-batch validation ─────────────────────
async function validateStartNextBatch(adminClient: any, body: RequestBody) {
  const size = body.size ?? 250;

  // 1. Pilot-100 gate
  const { data: pilot100Row } = await adminClient
    .from("enrichment_batch_runs")
    .select("id, label, status, metrics")
    .ilike("label", "pilot100-%")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const pilot100 = evaluatePilot100((pilot100Row ?? null) as RunForGate | null);

  // 2. Confirm-token rule (>100 requires "CONFIRM P2 BATCH")
  const confirmed = body.confirmToken === "CONFIRM P2 BATCH";

  const guard = guardBatchSize({ size, confirm: confirmed, pilot100Pass: pilot100.pass });
  if (!guard.ok) {
    return { ok: false as const, error: guard.reason, pilot100 };
  }

  // 3. No active non-terminal run
  const { data: active } = await adminClient
    .from("enrichment_batch_runs")
    .select("id, status")
    .or("status.eq.running,status.eq.pending")
    .limit(1).maybeSingle();
  if (active) {
    return { ok: false as const, error: "ACTIVE_RUN_NOT_TERMINAL", pilot100 };
  }

  return { ok: true as const, size, pilot100 };
}

// ───────────────────── main handler ─────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const gate = await requireCapability(req, "run_internal_tooling");
  if (gate instanceof Response) return gate;
  const { userId, adminClient } = gate;

  if (!(await isMaster(adminClient, userId))) {
    return json(403, { error: "forbidden", reason: "master_role_required" });
  }

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const body = parseBody(rawBody);
  if (!body) return json(400, { error: "invalid_action" });

  const allowReal = Deno.env.get("ALLOW_P2_REAL_BATCH") === "1";

  try {
    switch (body.action) {
      case "status": {
        const out = await handleStatus(adminClient);
        return json(200, out);
      }

      case "report": {
        if (!body.runId) return json(400, { error: "missing_runId" });
        const out = await handleReport(adminClient, body.runId);
        await writeAudit(adminClient, {
          user_id: userId, action: "report", run_id: body.runId,
          result: { label: out.label, status: out.status },
        });
        return json(200, out);
      }

      case "pause":
      case "resume":
      case "abort": {
        if (!body.runId) return json(400, { error: "missing_runId" });
        if (body.action === "abort" && !body.reason?.trim()) {
          return json(400, { error: "missing_reason" });
        }
        if (!allowReal) {
          await writeAudit(adminClient, {
            user_id: userId, action: body.action, run_id: body.runId,
            reason: body.reason ?? null,
            result: { dryRun: true, reason: "ALLOW_P2_REAL_BATCH_off" },
          });
          return json(200, { dryRun: true, action: body.action, reason: "ALLOW_P2_REAL_BATCH_off" });
        }
        // Real path — currently NOT activated in this delivery.
        return json(501, { error: "real_path_not_wired_yet", action: body.action });
      }

      case "start-next-batch": {
        const verdict = await validateStartNextBatch(adminClient, body);
        if (!verdict.ok) {
          await writeAudit(adminClient, {
            user_id: userId, action: "start-next-batch",
            batch_size: body.size ?? null,
            result: { blocked: true, reason: verdict.error, pilot100: verdict.pilot100 },
          });
          return json(400, { error: verdict.error, pilot100: verdict.pilot100 });
        }
        if (!allowReal) {
          await writeAudit(adminClient, {
            user_id: userId, action: "start-next-batch",
            batch_size: verdict.size,
            result: { dryRun: true, reason: "ALLOW_P2_REAL_BATCH_off", pilot100: verdict.pilot100 },
          });
          return json(200, {
            dryRun: true,
            size: verdict.size,
            reason: "ALLOW_P2_REAL_BATCH_off",
            pilot100: verdict.pilot100,
          });
        }
        return json(501, { error: "real_path_not_wired_yet" });
      }
    }
  } catch (e) {
    console.error("[poi-p2-runner-bridge] error", e);
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});

// Pure validation helper exported for Deno tests.
export const __test__ = {
  parseBody,
  validateStartNextBatch,
  buildSeedCandidates,
};
