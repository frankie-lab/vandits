// image-recovery-job-tick
//
// Picks the oldest queued `image_recovery_jobs` row (status='running' or
// 'canceling') with an expired lock and processes a few batches of
// `recover-missing-images` until the function nears its time budget. Designed
// to be invoked every minute by pg_cron so the work survives F5/cierre de
// pestaña/cambio de dispositivo, mirroring `geocoding-job-tick`.
//
// Invoked with no auth (public, but invoked by cron with the anon key).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Tick budget: aim well under the edge-function timeout. Each batch usually
// takes 5–15s. We allow up to ~40s of work per tick.
const TICK_BUDGET_MS = 40_000;
const LOCK_TIMEOUT_MS = 90_000; // a tick is considered stale after 90s

interface BatchResp {
  scanned: number;
  updated: number;
  skippedAlreadyAttempted: number;
  failedTransient: number;
  nextCursor: string | null;
  dryRun: boolean;
  items: Array<{
    id: string;
    name: string | null;
    result: "found" | "none" | "skipped" | "transient";
    source: string | null;
    durationMs: number;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const startedAt = Date.now();

  // 1. Pick a job: prefer the longest-idle running/canceling one whose lock expired.
  const lockCutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
  const { data: jobRows, error: pickErr } = await admin
    .from("image_recovery_jobs")
    .select("*")
    .in("status", ["running", "canceling"])
    .or(`last_tick_at.is.null,last_tick_at.lt.${lockCutoff}`)
    .order("last_tick_at", { ascending: true, nullsFirst: true })
    .limit(1);

  if (pickErr) {
    return new Response(JSON.stringify({ error: pickErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const job = jobRows?.[0];
  if (!job) {
    return new Response(JSON.stringify({ ok: true, picked: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Take the lock. We re-read the row with the stale-lock condition to
  //    avoid two ticks fighting over the same job. Using `.maybeSingle()`
  //    instead of `.single()` so an empty result is not treated as an error.
  const { data: claim, error: claimErr } = await admin
    .from("image_recovery_jobs")
    .select("id,last_tick_at")
    .eq("id", job.id)
    .or(`last_tick_at.is.null,last_tick_at.lt.${lockCutoff}`)
    .maybeSingle();
  if (claimErr) {
    return new Response(JSON.stringify({ error: `claim: ${claimErr.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!claim) {
    return new Response(JSON.stringify({ ok: true, picked: job.id, locked: false, reason: "already-locked" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { error: lockErr } = await admin
    .from("image_recovery_jobs")
    .update({ last_tick_at: new Date().toISOString() })
    .eq("id", job.id);
  if (lockErr) {
    return new Response(JSON.stringify({ error: `lock: ${lockErr.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Cancel handling.
  if (job.status === "canceling") {
    await admin
      .from("image_recovery_jobs")
      .update({ status: "canceled" })
      .eq("id", job.id);
    return new Response(JSON.stringify({ ok: true, picked: job.id, status: "canceled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scope = (job.scope ?? {}) as Record<string, any>;
  const scopeKind: "all" | "user" | "ids" =
    Array.isArray(scope.locationIds) && scope.locationIds.length > 0
      ? "ids"
      : (scope.userId ? "user" : "all");

  // 4. Process batches until time budget or terminal condition.
  let cursor: string | null = job.cursor ?? null;
  let scanned = job.scanned ?? 0;
  let updated = job.updated ?? 0;
  let skipped = job.skipped ?? 0;
  let failed = job.failed ?? 0;
  let waves = job.waves ?? 0;
  let recent = Array.isArray(job.recent_items) ? job.recent_items : [];
  let lastError: string | null = null;
  let terminal: "done" | null = null;

  while (Date.now() - startedAt < TICK_BUDGET_MS) {
    // Re-check cancel mid-tick.
    const { data: fresh } = await admin
      .from("image_recovery_jobs")
      .select("status")
      .eq("id", job.id)
      .single();
    if (fresh?.status === "canceling") {
      await admin
        .from("image_recovery_jobs")
        .update({
          status: "canceled",
          cursor, scanned, updated, skipped, failed, waves,
          recent_items: recent,
        })
        .eq("id", job.id);
      return new Response(JSON.stringify({ ok: true, picked: job.id, status: "canceled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let resp: Response;
    try {
      resp = await fetch(`${SUPABASE_URL}/functions/v1/recover-missing-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          scope: scopeKind,
          mode: job.mode ?? "missing",
          userId: scopeKind === "user" ? scope.userId : undefined,
          locationIds: scopeKind === "ids" ? scope.locationIds : undefined,
          batchSize: job.page_size ?? 50,
          dryRun: !!job.dry_run,
          force: !!job.force,
          retryStaleDays: job.retry_stale_days ?? 30,
          cursor: cursor ?? undefined,
          continent: scope.continent || undefined,
          country: scope.country || undefined,
          region: scope.region || undefined,
          zone: scope.zone || undefined,
          createdBefore: scope.createdBefore || undefined,
          createdAfter: scope.createdAfter || undefined,
        }),
      });
    } catch (e) {
      lastError = `fetch failed: ${(e as Error).message}`;
      break;
    }

    if (!resp.ok) {
      lastError = `recover-missing-images ${resp.status}: ${(await resp.text()).slice(0, 240)}`;
      break;
    }

    const data = (await resp.json()) as BatchResp;
    waves += 1;
    scanned += data.scanned;
    updated += data.updated;
    skipped += data.skippedAlreadyAttempted;
    failed += data.failedTransient;
    recent = [...data.items, ...recent].slice(0, 30);
    cursor = data.nextCursor;

    // Persist incremental progress so the UI sees movement during the tick.
    await admin
      .from("image_recovery_jobs")
      .update({
        cursor, scanned, updated, skipped, failed, waves,
        recent_items: recent,
        last_tick_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    // Tope total cliente
    if (job.max_total != null && job.max_total > 0 && scanned >= job.max_total) {
      terminal = "done";
      break;
    }
    if (!data.nextCursor) {
      terminal = "done";
      break;
    }
  }

  if (terminal === "done") {
    await admin
      .from("image_recovery_jobs")
      .update({
        status: "done",
        cursor, scanned, updated, skipped, failed, waves,
        recent_items: recent,
        remaining: 0,
      })
      .eq("id", job.id);
  } else if (lastError) {
    await admin
      .from("image_recovery_jobs")
      .update({
        last_error: lastError,
        cursor, scanned, updated, skipped, failed, waves,
        recent_items: recent,
      })
      .eq("id", job.id);
  }

  return new Response(JSON.stringify({
    ok: true,
    picked: job.id,
    terminal,
    error: lastError,
    scanned, updated, failed, waves,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
