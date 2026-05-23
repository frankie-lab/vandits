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
    return { error: json({ error: "unauthorized" }, 401), svc: null, userClient: null, uid: null, authHeader: null };
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return { error: json({ error: "unauthorized" }, 401), svc: null, userClient: null, uid: null, authHeader: null };
  }
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: isMaster, error: roleErr } = await svc.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "master",
  });
  if (roleErr || !isMaster) {
    return { error: json({ error: "forbidden" }, 403), svc: null, userClient: null, uid: null, authHeader: null };
  }
  return { error: null, svc, userClient, uid: userData.user.id, authHeader };
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
  rpcClient: any,
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

  // Claim atomically (must run with user auth context so RPC has_role check passes).
  const { data: claimed, error: claimErr } = await rpcClient.rpc("claim_batch_items", {
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

  // Catalog of `success:false` reasons that enrich-location emits as
  // defense-in-depth (gate refusals, not real failures). Mapped to
  // `skip:defense_<reason>` so they do NOT contaminate the error_rate guard
  // and never consume retry budget as a "fail".
  const DEFENSE_SKIP_REASONS = new Set<string>([
    "identity_root_skip",
    "identity_root_revalidation_failed",
    "invalid_coordinates",
    "reverse_geocode_failed",
    "identity_lookup_unavailable",
    "name_coordinate_mismatch",
    "name_found_elsewhere",
    "geo_narrative_mismatch",
    "llm_unverifiable",
  ]);

  let aiCallsThisChunk = 0;
  const aggregate = {
    success: 0,
    fail: 0,
    skip: 0,
    noop: 0,
    by_skip_reason: {} as Record<string, number>,
    by_fail_reason: {} as Record<string, number>,
  };

  // Flush helper: persists ONE item's delta + ai_calls increment immediately.
  // This guarantees `enrichment_batch_runs.ai_calls_used` and `metrics` reflect
  // reality even if the worker dies mid-chunk (prevents wedged runs).
  async function flushOne(
    delta: { success?: number; fail?: number; skip?: number; noop?: number; skip_reason?: string; fail_reason?: string },
    aiCallDelta: number,
  ) {
    aggregate.success += delta.success ?? 0;
    aggregate.fail += delta.fail ?? 0;
    aggregate.skip += delta.skip ?? 0;
    aggregate.noop += delta.noop ?? 0;
    if (delta.skip_reason) {
      aggregate.by_skip_reason[delta.skip_reason] = (aggregate.by_skip_reason[delta.skip_reason] ?? 0) + 1;
    }
    if (delta.fail_reason) {
      aggregate.by_fail_reason[delta.fail_reason] = (aggregate.by_fail_reason[delta.fail_reason] ?? 0) + 1;
    }
    aiCallsThisChunk += aiCallDelta;
    // Re-read run, merge with persisted metrics (other workers may write too),
    // then persist incremental ai_calls_used + new aggregate.
    const fresh = await loadRun(client, runId);
    const prev = (fresh.metrics ?? {}) as any;
    const mergedSkip: Record<string, number> = { ...(prev.by_skip_reason ?? {}) };
    if (delta.skip_reason) mergedSkip[delta.skip_reason] = (mergedSkip[delta.skip_reason] ?? 0) + 1;
    const mergedFail: Record<string, number> = { ...(prev.by_fail_reason ?? {}) };
    if (delta.fail_reason) mergedFail[delta.fail_reason] = (mergedFail[delta.fail_reason] ?? 0) + 1;
    await client
      .from("enrichment_batch_runs")
      .update({
        ai_calls_used: (fresh.ai_calls_used ?? 0) + aiCallDelta,
        metrics: {
          success: (prev.success ?? 0) + (delta.success ?? 0),
          fail: (prev.fail ?? 0) + (delta.fail ?? 0),
          skip: (prev.skip ?? 0) + (delta.skip ?? 0),
          noop: (prev.noop ?? 0) + (delta.noop ?? 0),
          by_skip_reason: mergedSkip,
          by_fail_reason: mergedFail,
        },
      })
      .eq("id", runId);
  }

  for (const item of claimed as Array<{ item_id: string; location_id: string }>) {
    // Re-fetch fresh row (read-only). `locations.custom_data` aliased to
    // `metadata` for the shared classifier.
    const { data: fresh, error: freshErr } = await client
      .from("locations")
      .select(
        "id, name, latitude, longitude, country_code, country_id, region_id, geo_health, enrichment_status, is_approved, deleted_at, owner_user_id, enriched_data, updated_at, metadata:custom_data",
      )
      .eq("id", item.location_id)
      .single();

    if (!fresh) {
      const reason = freshErr ? `location_lookup_error:${freshErr.code ?? freshErr.message}` : "location_not_found";
      await client
        .from("enrichment_batch_items")
        .update({ status: "fail", fail_reason: reason, finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      await flushOne({ fail: 1, fail_reason: reason.split(":")[0] ?? "fail" }, 0);
      continue;
    }

    const verdict = classifyPoiIdentityRootStatus(fresh as LocationRow);
    if (!verdict.eligibleForAutoEnrich) {
      const reason = verdict.skipReason ?? "ineligible";
      await client
        .from("enrichment_batch_items")
        .update({ status: "skip", skip_reason: reason, finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      await flushOne({ skip: 1, skip_reason: reason }, 0);
      continue;
    }

    // ELIGIBLE.
    if (dryRun) {
      await client
        .from("enrichment_batch_items")
        .update({
          status: "noop",
          skip_reason: "dry_run_fase_a",
          finished_at: new Date().toISOString(),
        })
        .eq("id", item.item_id);
      await flushOne({ noop: 1, skip_reason: "dry_run_fase_a" }, 1);

      const after = await loadRun(client, runId);
      if ((after.ai_calls_used ?? 0) >= after.max_ai_calls) {
        await applyPause(client, runId, "max_ai_calls_reached");
        return { continueLoop: false, verdict: "pause:max_ai_calls_reached" };
      }
      continue;
    }

    // ----- Phase B path: snapshot + dispatch enrich-location + PERSIST + VERIFY -----
    if (!authHeader) {
      await client
        .from("enrichment_batch_items")
        .update({ status: "fail", fail_reason: "missing_auth_for_dispatch", finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      await flushOne({ fail: 1, fail_reason: "missing_auth_for_dispatch" }, 0);
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
      await flushOne({ fail: 1, fail_reason: "snapshot_failed" }, 0);
      await applyAbort(client, runId, "snapshot_failure");
      return { continueLoop: false, verdict: "abort:snapshot_failure" };
    }

    // 2) Dispatch enrich-location. enrich-location is a PURE FUNCTION: it
    //    generates enriched data and returns it; it does NOT persist. The
    //    orchestrator MUST perform the write via the allowlisted RPC and
    //    verify persistence before declaring success.
    const baselineUpdatedAt: string | null = (fresh as any).updated_at ?? null;
    let outcome: "success" | "skip" | "fail" = "fail";
    let reasonCode = "unknown";
    let aiCallDelta = 1; // attempted an IA call
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
      const respBody = await resp.json().catch(() => ({} as any));

      if (!resp.ok) {
        outcome = "fail";
        reasonCode = `http_${resp.status}:${respBody?.error ?? respBody?.reason ?? "no_detail"}`;
      } else if (respBody?.success === false) {
        // ALL success:false from enrich-location are defense-in-depth gates.
        outcome = "skip";
        const dr = String(respBody?.reason ?? respBody?.skipReason ?? "unspecified");
        reasonCode = DEFENSE_SKIP_REASONS.has(dr) ? `defense_${dr}` : `defense_other:${dr}`;
      } else if (!respBody?.data || typeof respBody.data !== "object") {
        outcome = "fail";
        reasonCode = "no_data_in_response";
      } else {
        // 3) PERSIST: write enriched_data back via allowlisted RPC.
        const enrichedPayload = respBody.data;
        // Use rpcClient (user auth context) so the SECURITY DEFINER RPC's
        // has_role(auth.uid(), 'master') check resolves against the caller,
        // not against the service role (which has auth.uid()=NULL).
        const { data: persistRows, error: persistErr } = await rpcClient.rpc(
          "apply_orchestrator_enrichment",
          {
            _location_id: item.location_id,
            _enriched_data: enrichedPayload,
            _enrichment_status: "enriched",
          },
        );
        if (persistErr) {
          outcome = "fail";
          reasonCode = `persist_rpc_error:${persistErr.code ?? persistErr.message}`;
        } else {
          const row = Array.isArray(persistRows) ? persistRows[0] : persistRows;
          // 4) VERIFY: descripcion non-empty AND updated_at advanced.
          const descPresent = !!row?.descripcion_present;
          const updatedAdvanced = baselineUpdatedAt
            ? row?.updated_at && Date.parse(row.updated_at) > Date.parse(baselineUpdatedAt)
            : !!row?.updated_at;
          if (descPresent && updatedAdvanced) {
            outcome = "success";
            reasonCode = "ok";
          } else {
            outcome = "fail";
            reasonCode = !descPresent
              ? "success_without_persist:no_descripcion"
              : "success_without_persist:updated_at_not_advanced";
          }
        }
      }
    } catch (e) {
      outcome = "fail";
      reasonCode = `dispatch_exception:${(e as Error).message}`;
    }

    // Apply outcome to item row + flush incrementally.
    if (outcome === "success") {
      await client
        .from("enrichment_batch_items")
        .update({ status: "success", finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      await flushOne({ success: 1 }, aiCallDelta);
    } else if (outcome === "skip") {
      await client
        .from("enrichment_batch_items")
        .update({ status: "skip", skip_reason: reasonCode, finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      await flushOne({ skip: 1, skip_reason: reasonCode }, aiCallDelta);
    } else {
      await client
        .from("enrichment_batch_items")
        .update({ status: "fail", fail_reason: reasonCode, finished_at: new Date().toISOString() })
        .eq("id", item.item_id);
      await flushOne({ fail: 1, fail_reason: reasonCode.split(":")[0] ?? "fail" }, aiCallDelta);
    }

    // Budget check: pause as soon as max_ai_calls is reached.
    const after = await loadRun(client, runId);
    if ((after.ai_calls_used ?? 0) >= after.max_ai_calls) {
      await applyPause(client, runId, "max_ai_calls_reached");
      return { continueLoop: false, verdict: "pause:max_ai_calls_reached" };
    }
    // Mid-chunk error_rate guard (via evaluateBudget over fresh snapshot).
    const v = evaluateBudget(after as RunBudgetSnapshot);
    if (v.action === "abort") {
      await applyAbort(client, runId, v.reason);
      return { continueLoop: false, verdict: `abort:${v.reason}` };
    }
  }

  return { continueLoop: true, verdict: "chunk_done" };
}


// (flushMetricsAndCalls removed in fixes-1: metrics now flush per item via
//  the inner `flushOne` helper inside processChunk. This guarantees
//  `ai_calls_used`/`metrics` reflect reality even if the worker dies
//  mid-chunk and prevents wedged-running rows.)

/**
 * Watchdog: detect in_flight items older than `stale_minutes` (default 5)
 * and reset them to pending. If `max_ai_calls` is already reached, pause
 * the run instead of resetting (no further IA should be consumed). Returns
 * a summary suitable for status dashboards.
 */
async function handleWatchdog(req: Request, client: any, rpcClient: any) {
  const body = await req.json().catch(() => ({}));
  const runId: string = body.run_id;
  const staleMinutes: number = Number(body.stale_minutes ?? 5);
  if (!runId) return json({ error: "run_id_required" }, 400);

  const run = await loadRun(client, runId);

  // If budget is exhausted, do NOT reset orphans for re-processing — just
  // pause and report. Compensation must be a separate explicit action.
  if ((run.ai_calls_used ?? 0) >= (run.max_ai_calls ?? 0) && run.status === "running") {
    await applyPause(client, runId, "max_ai_calls_reached");
    return json({
      run_id: runId,
      action: "paused_max_ai_calls",
      reset_count: 0,
      ai_calls_used: run.ai_calls_used,
      max_ai_calls: run.max_ai_calls,
    });
  }

  const { data: reset, error } = await rpcClient.rpc("restart_stale_batch_items", {
    _run_id: runId,
    _stale_minutes: staleMinutes,
  });
  if (error) return json({ error: "watchdog_reset_failed", detail: error.message }, 500);

  // If the run was running but the worker is clearly dead (orphans found),
  // pause it so a fresh /start has to be issued explicitly.
  const reset_count = (reset as number) ?? 0;
  let nextStatus = run.status;
  if (reset_count > 0 && run.status === "running") {
    await applyPause(client, runId, "worker_died");
    nextStatus = "paused";
  }
  return json({
    run_id: runId,
    action: reset_count > 0 ? "reset_stale" : "noop",
    reset_count,
    prev_status: run.status,
    status: nextStatus,
    ai_calls_used: run.ai_calls_used,
    max_ai_calls: run.max_ai_calls,
  });
}


async function handleStart(req: Request, client: any, rpcClient: any, authHeader: string | null) {
  const body = await req.json().catch(() => ({}));
  const runId: string = body.run_id;
  const dryRun: boolean = body.dryRun === true;
  if (!runId) return json({ error: "run_id_required" }, 400);

  const run = await loadRun(client, runId);
  if (run.status === "completed" || run.status === "aborted") {
    return json({ error: `run_${run.status}` }, 409);
  }

  // Phase B pilot guard: live dispatches require strict scope cap.
  if (!dryRun) {
    if ((run.scope_count ?? 0) > 50) {
      return json({ error: "phase_b_pilot_scope_cap", limit: 50, actual: run.scope_count }, 403);
    }
    if ((run.max_ai_calls ?? 0) > 50) {
      return json({ error: "phase_b_pilot_max_ai_calls_cap", limit: 50, actual: run.max_ai_calls }, 403);
    }
  }

  await client
    .from("enrichment_batch_runs")
    .update({
      status: "running",
      pause_reason: null,
      started_at: run.started_at ?? new Date().toISOString(),
    })
    .eq("id", runId);

  const maxChunksPerInvocation = Number(body.maxChunksPerInvocation ?? 50);
  let processed = 0;
  let lastVerdict = "noop";
  while (processed < maxChunksPerInvocation) {
    const { continueLoop, verdict } = await processChunk(client, rpcClient, runId, dryRun, authHeader);
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

async function handleRestart(req: Request, rpcClient: any) {
  const body = await req.json().catch(() => ({}));
  const runId: string = body.run_id;
  const staleMinutes: number = Number(body.stale_minutes ?? 5);
  if (!runId) return json({ error: "run_id_required" }, 400);
  const { data: reset, error } = await rpcClient.rpc("restart_stale_batch_items", {
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
  const client = auth.svc!;
  const userClient = auth.userClient!;
  const uid = auth.uid!;
  const authHeader = auth.authHeader;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/enrich-batch-orchestrator/, "") || "/";

  try {
    if (req.method === "POST" && path === "/seed") return await handleSeed(req, client, uid);
    if (req.method === "POST" && path === "/start") return await handleStart(req, client, userClient, authHeader);
    if (req.method === "POST" && path === "/pause") return await handlePause(req, client);
    if (req.method === "POST" && path === "/resume") return await handleResume(req, client);
    if (req.method === "POST" && path === "/restart") return await handleRestart(req, userClient);
    if (req.method === "POST" && path === "/watchdog") return await handleWatchdog(req, client, userClient);
    if (req.method === "GET" && path === "/status") return await handleStatus(url, client);

    return json({ error: "not_found", path, method: req.method }, 404);

  } catch (e) {
    return json({ error: "internal_error", detail: (e as Error).message }, 500);
  }
});
