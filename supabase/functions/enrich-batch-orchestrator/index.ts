// P2 Server-Side Orchestrator — Edge Function
// =====================================================================
// Phase A scope (this deploy):
//   - HTTP endpoints (seed, start, pause, resume, restart, status)
//   - Schema is in place via migration; tables/triggers/RPCs exist.
//   - Run loop is DRY-RUN ONLY: claims items, revalidates with the
//     Phase 1 gate (read-only on locations), increments ai_calls_used
//     for accountancy, and marks items as 'noop' (skip_reason='dry_run_fase_a')
//     or 'skip' with the correct reason. NO IA call, NO writes to
//     `locations`, NO snapshot writes.
//   - `start` REJECTS unless body.dryRun === true (server-side gate).
//
// Phase B (NOT in this deploy) will lift the dry-run gate and dispatch
// the real `enrich-location` invocation under the orchestrator flag.
//
// Reference: docs/audits/poi-identity-p2-server-orchestrator-plan.md

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

import {
  classifyPoiIdentityRootStatus,
  type LocationRow,
} from "../_shared/poi-identity-root-status.ts";
import {
  evaluateBudget,
  type RunBudgetSnapshot,
  validateSeedConfig,
} from "./budget.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function requireMaster(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: json({ error: "unauthorized" }, 401), client: null, uid: null, authHeader: null };
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return { error: json({ error: "unauthorized" }, 401), client: null, uid: null, authHeader: null };
  }
  // Service-role client for queries (so we can set the orchestrator flag in Phase B)
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: isMaster, error: roleErr } = await svc.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "master",
  });
  if (roleErr || !isMaster) {
    return { error: json({ error: "forbidden" }, 403), client: null, uid: null, authHeader: null };
  }
  return { error: null, client: svc, uid: userData.user.id, authHeader };
}


// ---------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------

async function handleSeed(req: Request, client: any, uid: string) {
  const body = await req.json().catch(() => ({}));
  const label: string = body.label ?? `run-${new Date().toISOString()}`;
  const source_csv_path: string | null = body.source_csv_path ?? null;
  const location_ids: string[] = Array.isArray(body.location_ids) ? body.location_ids : [];
  const chunk_size: number = Number(body.chunk_size ?? 25);
  const pause_seconds: number = Number(body.pause_seconds ?? 60);
  const max_ai_calls: number = Number(body.max_ai_calls ?? 25);
  const max_runtime_minutes: number = Number(body.max_runtime_minutes ?? 60);
  const max_error_rate_pct: number = Number(body.max_error_rate_pct ?? 5);
  const confirm_full_run: boolean = !!body.confirm_full_run;

  if (location_ids.length === 0) {
    return json({ error: "location_ids_required" }, 400);
  }
  // De-duplicate input IDs server-side.
  const uniqueIds = Array.from(new Set(location_ids));
  const cfgErr = validateSeedConfig({
    scope_count: uniqueIds.length,
    max_ai_calls,
    confirm_full_run,
  });
  if (cfgErr) return json({ error: cfgErr }, 400);

  // Resolve country_code for ordering (read-only; does NOT update locations).
  const { data: locs, error: locErr } = await client
    .from("locations")
    .select("id, country_code")
    .in("id", uniqueIds);
  if (locErr) return json({ error: "locations_lookup_failed", detail: locErr.message }, 500);
  const countryByLoc = new Map<string, string | null>(
    (locs ?? []).map((r: any) => [r.id as string, (r.country_code as string | null) ?? null]),
  );

  // Insert run.
  const { data: run, error: runErr } = await client
    .from("enrichment_batch_runs")
    .insert({
      label,
      source_csv_path,
      scope_count: uniqueIds.length,
      chunk_size,
      pause_seconds,
      max_ai_calls,
      max_runtime_minutes,
      max_error_rate_pct,
      confirm_full_run,
      created_by: uid,
      status: "pending",
    })
    .select()
    .single();
  if (runErr) return json({ error: "run_insert_failed", detail: runErr.message }, 500);

  // Insert items in chunks (avoid 1MB payload limits).
  const items = uniqueIds.map((id) => ({
    run_id: run.id,
    location_id: id,
    country_code: countryByLoc.get(id) ?? null,
  }));
  const BATCH = 500;
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    const { error: insErr } = await client.from("enrichment_batch_items").insert(slice);
    if (insErr) {
      return json(
        { error: "items_insert_failed", detail: insErr.message, partial_at: i },
        500,
      );
    }
  }

  return json({ run_id: run.id, scope_count: uniqueIds.length, status: run.status });
}

async function loadRun(client: any, runId: string) {
  const { data, error } = await client
    .from("enrichment_batch_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (error) throw new Error(`run_not_found: ${error.message}`);
  return data;
}

async function applyPause(client: any, runId: string, reason: string) {
  await client
    .from("enrichment_batch_runs")
    .update({
      status: "paused",
      pause_reason: reason,
      finished_at: null,
    })
    .eq("id", runId);
}

async function applyAbort(client: any, runId: string, reason: string) {
  await client
    .from("enrichment_batch_runs")
    .update({
      status: "aborted",
      abort_reason: reason,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

async function applyComplete(client: any, runId: string) {
  await client
    .from("enrichment_batch_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

/**
 * Process ONE chunk.
 * Phase B (pilot): dispatches enrich-location for eligible POIs after taking a
 * snapshot. enrich-location re-validates Phase 1 gates server-side (defense in
 * depth) and only writes allowlist fields (enriched_data, enrichment_status,
 * updated_at). Snapshots are written PRE-dispatch into
 * `enrichment_batch_snapshots`.
 */
async function processChunk(
  client: any,
  runId: string,
  dryRun: boolean,
  authHeader: string | null,
): Promise<{ continueLoop: boolean; verdict: string }> {
  // Re-load run for fresh budget snapshot.
  const run = await loadRun(client, runId);
  const budget = evaluateBudget(run as RunBudgetSnapshot);
  if (budget.action === "pause") {
    await applyPause(client, runId, budget.reason);
    return { continueLoop: false, verdict: `pause:${budget.reason}` };
  }
  if (budget.action === "abort") {
    await applyAbort(client, runId, budget.reason);
    return { continueLoop: false, verdict: `abort:${budget.reason}` };
  }

  // Claim atomically.
  const { data: claimed, error: claimErr } = await client.rpc("claim_batch_items", {
    _run_id: runId,
    _chunk_size: run.chunk_size,
  });
  if (claimErr) {
    return { continueLoop: false, verdict: `claim_error:${claimErr.message}` };
  }
  if (!claimed || claimed.length === 0) {
    await applyComplete(client, runId);
    return { continueLoop: false, verdict: "completed" };
  }

  let aiCallsThisChunk = 0;
  const metricsDelta = {
    success: 0,
    fail: 0,
    skip: 0,
    noop: 0,
    by_skip_reason: {} as Record<string, number>,
    by_fail_reason: {} as Record<string, number>,
  };

  for (const item of claimed as Array<{ item_id: string; location_id: string }>) {
    // Re-fetch fresh row (read-only).
    const { data: fresh } = await client
      .from("locations")
      .select(
        "id, name, latitude, longitude, country_code, country_id, region_id, geo_health, enrichment_status, is_approved, deleted_at, owner_user_id, enriched_data, metadata",
      )
      .eq("id", item.location_id)
      .single();

    if (!fresh) {
      await client
        .from("enrichment_batch_items")
        .update({ status: "fail", fail_reason: "location_not_found", finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      metricsDelta.fail += 1;
      metricsDelta.by_fail_reason["location_not_found"] =
        (metricsDelta.by_fail_reason["location_not_found"] ?? 0) + 1;
      continue;
    }

    const verdict = classifyPoiIdentityRootStatus(fresh as LocationRow);
    if (!verdict.eligibleForAutoEnrich) {
      const reason = verdict.skipReason ?? "ineligible";
      await client
        .from("enrichment_batch_items")
        .update({ status: "skip", skip_reason: reason, finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      metricsDelta.skip += 1;
      metricsDelta.by_skip_reason[reason] = (metricsDelta.by_skip_reason[reason] ?? 0) + 1;
      continue;
    }

    // ELIGIBLE.
    if (dryRun) {
      aiCallsThisChunk += 1; // count toward budget for parity with Phase B
      await client
        .from("enrichment_batch_items")
        .update({
          status: "noop",
          skip_reason: "dry_run_fase_a",
          finished_at: new Date().toISOString(),
        })
        .eq("id", item.item_id);
      metricsDelta.noop += 1;

      const projected = (run.ai_calls_used ?? 0) + aiCallsThisChunk;
      if (projected >= run.max_ai_calls) {
        await flushMetricsAndCalls(client, runId, run, metricsDelta, aiCallsThisChunk);
        await applyPause(client, runId, "max_ai_calls_reached");
        return { continueLoop: false, verdict: "pause:max_ai_calls_reached" };
      }
      continue;
    }

    // ----- Phase B path: snapshot + dispatch enrich-location -----
    if (!authHeader) {
      await client
        .from("enrichment_batch_items")
        .update({ status: "fail", fail_reason: "missing_auth_for_dispatch", finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      metricsDelta.fail += 1;
      metricsDelta.by_fail_reason["missing_auth_for_dispatch"] =
        (metricsDelta.by_fail_reason["missing_auth_for_dispatch"] ?? 0) + 1;
      continue;
    }

    // 1) Pre-dispatch snapshot (rollback unit).
    const { error: snapErr } = await client
      .from("enrichment_batch_snapshots")
      .insert({
        run_id: runId,
        location_id: item.location_id,
        previous_enriched_data: (fresh as any).enriched_data ?? null,
        previous_enrichment_status: (fresh as any).enrichment_status ?? null,
      });
    if (snapErr) {
      await client
        .from("enrichment_batch_items")
        .update({ status: "fail", fail_reason: `snapshot_failed:${snapErr.message}`, finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      metricsDelta.fail += 1;
      metricsDelta.by_fail_reason["snapshot_failed"] =
        (metricsDelta.by_fail_reason["snapshot_failed"] ?? 0) + 1;
      // STOP CONDITION: snapshot failure aborts the run per Phase B contract.
      await flushMetricsAndCalls(client, runId, run, metricsDelta, aiCallsThisChunk);
      await applyAbort(client, runId, "snapshot_failure");
      return { continueLoop: false, verdict: "abort:snapshot_failure" };
    }

    // 2) Dispatch enrich-location with locationId (it revalidates Phase 1).
    aiCallsThisChunk += 1;
    let dispatchOk = false;
    let dispatchReason: string = "unknown";
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/enrich-location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          locationId: item.location_id,
          location: {
            id: (fresh as any).id,
            name: (fresh as any).name,
            latitude: (fresh as any).latitude,
            longitude: (fresh as any).longitude,
            country_code: (fresh as any).country_code,
          },
          generateImage: true,
          skipValidation: false,
        }),
      });
      const body = await resp.json().catch(() => ({} as any));
      if (resp.ok && body?.success !== false && body?.reason !== "identity_root_skip") {
        dispatchOk = true;
        dispatchReason = "ok";
      } else if (body?.reason === "identity_root_skip") {
        dispatchOk = false;
        dispatchReason = `revalidation_skip:${body?.skipReason ?? "unknown"}`;
      } else {
        dispatchOk = false;
        dispatchReason = `http_${resp.status}:${body?.error ?? body?.reason ?? "no_detail"}`;
      }
    } catch (e) {
      dispatchOk = false;
      dispatchReason = `dispatch_exception:${(e as Error).message}`;
    }

    if (dispatchOk) {
      await client
        .from("enrichment_batch_items")
        .update({ status: "success", finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      metricsDelta.success += 1;
    } else if (dispatchReason.startsWith("revalidation_skip:")) {
      const sr = dispatchReason.replace("revalidation_skip:", "");
      await client
        .from("enrichment_batch_items")
        .update({ status: "skip", skip_reason: sr, finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      metricsDelta.skip += 1;
      metricsDelta.by_skip_reason[sr] = (metricsDelta.by_skip_reason[sr] ?? 0) + 1;
    } else {
      await client
        .from("enrichment_batch_items")
        .update({ status: "fail", fail_reason: dispatchReason, finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      metricsDelta.fail += 1;
      const bucket = dispatchReason.split(":")[0] ?? "unknown";
      metricsDelta.by_fail_reason[bucket] = (metricsDelta.by_fail_reason[bucket] ?? 0) + 1;
    }

    // Budget check mid-chunk after each AI call.
    const projected = (run.ai_calls_used ?? 0) + aiCallsThisChunk;
    if (projected >= run.max_ai_calls) {
      await flushMetricsAndCalls(client, runId, run, metricsDelta, aiCallsThisChunk);
      await applyPause(client, runId, "max_ai_calls_reached");
      return { continueLoop: false, verdict: "pause:max_ai_calls_reached" };
    }
  }

  await flushMetricsAndCalls(client, runId, run, metricsDelta, aiCallsThisChunk);
  return { continueLoop: true, verdict: "chunk_done" };
}


async function flushMetricsAndCalls(
  client: any,
  runId: string,
  run: any,
  delta: { success: number; fail: number; skip: number; noop: number; by_skip_reason: Record<string, number> },
  aiCallsThisChunk: number,
) {
  const prev = run.metrics ?? {};
  const prevBy = (prev.by_skip_reason ?? {}) as Record<string, number>;
  const prevByFail = (prev.by_fail_reason ?? {}) as Record<string, number>;
  const mergedBy: Record<string, number> = { ...prevBy };
  for (const [k, v] of Object.entries(delta.by_skip_reason)) {
    mergedBy[k] = (mergedBy[k] ?? 0) + v;
  }
  const mergedByFail: Record<string, number> = { ...prevByFail };
  for (const [k, v] of Object.entries(delta.by_fail_reason ?? {})) {
    mergedByFail[k] = (mergedByFail[k] ?? 0) + v;
  }
  const nextMetrics = {
    success: (prev.success ?? 0) + delta.success,
    fail: (prev.fail ?? 0) + delta.fail,
    skip: (prev.skip ?? 0) + delta.skip,
    noop: (prev.noop ?? 0) + delta.noop,
    by_skip_reason: mergedBy,
    by_fail_reason: mergedByFail,
  };

  await client
    .from("enrichment_batch_runs")
    .update({
      ai_calls_used: (run.ai_calls_used ?? 0) + aiCallsThisChunk,
      metrics: nextMetrics,
    })
    .eq("id", runId);
}

async function handleStart(req: Request, client: any) {
  const body = await req.json().catch(() => ({}));
  const runId: string = body.run_id;
  const dryRun: boolean = !!body.dryRun;
  if (!runId) return json({ error: "run_id_required" }, 400);

  // Phase A gate: server REFUSES to dispatch IA. dryRun MUST be true.
  if (!dryRun) {
    return json({ error: "phase_a_dry_run_only", hint: "Pass { dryRun: true } in Phase A" }, 403);
  }

  const run = await loadRun(client, runId);
  if (run.status === "completed" || run.status === "aborted") {
    return json({ error: `run_${run.status}` }, 409);
  }

  await client
    .from("enrichment_batch_runs")
    .update({
      status: "running",
      pause_reason: null,
      started_at: run.started_at ?? new Date().toISOString(),
    })
    .eq("id", runId);

  // Process chunks sequentially in-loop. With dryRun the work is light so we
  // can finish small pilots within the request lifetime. For larger scopes we
  // bail after maxChunksPerInvocation and rely on a follow-up /start call.
  const maxChunksPerInvocation = Number(body.maxChunksPerInvocation ?? 50);
  let processed = 0;
  let lastVerdict = "noop";
  while (processed < maxChunksPerInvocation) {
    const { continueLoop, verdict } = await processChunk(client, runId, dryRun);
    lastVerdict = verdict;
    processed += 1;
    if (!continueLoop) break;
  }

  const after = await loadRun(client, runId);
  return json({
    run_id: runId,
    chunks_processed: processed,
    last_verdict: lastVerdict,
    status: after.status,
    pause_reason: after.pause_reason,
    abort_reason: after.abort_reason,
    ai_calls_used: after.ai_calls_used,
    metrics: after.metrics,
  });
}

async function handlePause(req: Request, client: any) {
  const body = await req.json().catch(() => ({}));
  const runId: string = body.run_id;
  if (!runId) return json({ error: "run_id_required" }, 400);
  await applyPause(client, runId, body.reason ?? "manual");
  return json({ run_id: runId, status: "paused", reason: body.reason ?? "manual" });
}

async function handleResume(req: Request, client: any) {
  const body = await req.json().catch(() => ({}));
  const runId: string = body.run_id;
  if (!runId) return json({ error: "run_id_required" }, 400);
  const run = await loadRun(client, runId);
  if (run.status !== "paused") {
    return json({ error: `cannot_resume_status_${run.status}` }, 409);
  }
  // Resume == clear pause and re-enter start with dryRun flag preserved.
  await client
    .from("enrichment_batch_runs")
    .update({ status: "running", pause_reason: null })
    .eq("id", runId);
  return json({ run_id: runId, status: "running" });
}

async function handleRestart(req: Request, client: any) {
  const body = await req.json().catch(() => ({}));
  const runId: string = body.run_id;
  const staleMinutes: number = Number(body.stale_minutes ?? 5);
  if (!runId) return json({ error: "run_id_required" }, 400);
  const { data: reset, error } = await client.rpc("restart_stale_batch_items", {
    _run_id: runId,
    _stale_minutes: staleMinutes,
  });
  if (error) return json({ error: "restart_failed", detail: error.message }, 500);
  return json({ run_id: runId, reset_count: reset });
}

async function handleStatus(url: URL, client: any) {
  const runId = url.searchParams.get("run_id");
  if (!runId) return json({ error: "run_id_required" }, 400);
  const run = await loadRun(client, runId);
  const { count: pending } = await client
    .from("enrichment_batch_items")
    .select("*", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("status", "pending");
  const { count: inFlight } = await client
    .from("enrichment_batch_items")
    .select("*", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("status", "in_flight");
  const elapsedMin = run.started_at
    ? (Date.now() - Date.parse(run.started_at)) / 60_000
    : 0;
  return json({
    run_id: runId,
    label: run.label,
    status: run.status,
    pause_reason: run.pause_reason,
    abort_reason: run.abort_reason,
    scope_count: run.scope_count,
    max_ai_calls: run.max_ai_calls,
    ai_calls_used: run.ai_calls_used,
    max_runtime_minutes: run.max_runtime_minutes,
    elapsed_minutes: Number(elapsedMin.toFixed(2)),
    pending,
    in_flight: inFlight,
    metrics: run.metrics,
    next_action:
      run.status === "running"
        ? "auto-resume"
        : run.status === "paused"
          ? "awaiting-approval"
          : "terminal",
  });
}

// ---------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireMaster(req);
  if (auth.error) return auth.error;
  const client = auth.client!;
  const uid = auth.uid!;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/enrich-batch-orchestrator/, "") || "/";

  try {
    if (req.method === "POST" && path === "/seed") return await handleSeed(req, client, uid);
    if (req.method === "POST" && path === "/start") return await handleStart(req, client);
    if (req.method === "POST" && path === "/pause") return await handlePause(req, client);
    if (req.method === "POST" && path === "/resume") return await handleResume(req, client);
    if (req.method === "POST" && path === "/restart") return await handleRestart(req, client);
    if (req.method === "GET" && path === "/status") return await handleStatus(url, client);
    return json({ error: "not_found", path, method: req.method }, 404);
  } catch (e) {
    return json({ error: "internal_error", detail: (e as Error).message }, 500);
  }
});
