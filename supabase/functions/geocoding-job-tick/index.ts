// Domain: Geography — Server-side geocoding job runner.
//
// Picks up the oldest queued geocoding_jobs row whose lock has expired and
// processes ONE batch via the existing backfill-admin-fks function. Designed
// to be invoked every minute by pg_cron so the work continues even if the
// user closes the browser or shuts down their machine.
//
// Invoked with no auth (public, but invoked by cron with the anon key).
// Uses the service role internally.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_STALE_MS = 30_000;
const TIME_BUDGET_MS = 110_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Find the oldest active job whose lock is expired or absent.
  const cutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString();
  const { data: candidates, error: pickErr } = await admin
    .from('geocoding_jobs')
    .select('*')
    .in('status', ['running', 'canceling'])
    .or(`last_tick_at.is.null,last_tick_at.lt.${cutoff}`)
    .order('created_at', { ascending: true })
    .limit(1);

  if (pickErr) {
    return new Response(JSON.stringify({ error: pickErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const job = candidates?.[0];
  if (!job) {
    return new Response(JSON.stringify({ ok: true, idle: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2. Optimistic lock: only proceed if updated_at hasn't changed.
  const lockTs = new Date().toISOString();
  const { data: locked, error: lockErr } = await admin
    .from('geocoding_jobs')
    .update({ last_tick_at: lockTs })
    .eq('id', job.id)
    .eq('updated_at', job.updated_at)
    .select('id')
    .maybeSingle();

  if (lockErr || !locked) {
    return new Response(JSON.stringify({ ok: true, contended: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 3. Honor cancel intent immediately.
  if (job.status === 'canceling') {
    await admin.from('geocoding_jobs').update({ status: 'canceled' }).eq('id', job.id);
    return new Response(JSON.stringify({ ok: true, canceled: job.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 4. Process batches for up to TIME_BUDGET_MS.
  const startedAt = Date.now();
  let totalProcessed = job.processed ?? 0;
  let totalUpdated = job.updated ?? 0;
  let totalFailed = job.failed ?? 0;
  let offset = job.offset ?? 0;
  let remaining: number | null = job.remaining;
  let totalInScope: number | null = job.total_in_scope;
  let lastError: string | null = null;
  let done = false;

  const mode = (job.mode as 'fill' | 'reconcile' | 'overwrite') ?? 'fill';
  const useOffset = mode !== 'fill';
  const pageSize: number = job.page_size ?? 25;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    // Re-check cancel intent inside the loop.
    const { data: fresh } = await admin
      .from('geocoding_jobs')
      .select('status')
      .eq('id', job.id)
      .maybeSingle();
    if (fresh?.status === 'canceling') {
      await admin
        .from('geocoding_jobs')
        .update({
          status: 'canceled',
          processed: totalProcessed,
          updated: totalUpdated,
          failed: totalFailed,
          offset,
          remaining,
          total_in_scope: totalInScope,
        })
        .eq('id', job.id);
      return new Response(JSON.stringify({ ok: true, canceled: job.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const invokeBody: Record<string, unknown> = {
      limit: pageSize,
      mode,
      user_id: job.user_id,
    };
    if (useOffset) invokeBody.offset = offset;
    if (job.document_id) invokeBody.document_id = job.document_id;
    if (job.catalog_only) invokeBody.catalog_only = true;

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/backfill-admin-fks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify(invokeBody),
    });

    if (!resp.ok) {
      lastError = `backfill HTTP ${resp.status}`;
      try { lastError += `: ${(await resp.text()).slice(0, 200)}`; } catch { /* noop */ }
      break;
    }

    const d = (await resp.json()) as {
      processed?: number;
      updated?: number;
      failed?: number;
      remaining?: number | null;
      totalInScope?: number | null;
      nextOffset?: number;
    };

    const proc = d.processed ?? 0;
    const upd = d.updated ?? 0;
    const failed = d.failed ?? 0;
    totalProcessed += proc;
    totalUpdated += upd;
    totalFailed += failed;
    if (typeof d.remaining === 'number') remaining = d.remaining;
    if (typeof d.totalInScope === 'number') totalInScope = d.totalInScope;
    if (useOffset) {
      offset = typeof d.nextOffset === 'number' ? d.nextOffset : offset + proc;
    }

    // Refresh lock heartbeat + counters.
    await admin
      .from('geocoding_jobs')
      .update({
        last_tick_at: new Date().toISOString(),
        processed: totalProcessed,
        updated: totalUpdated,
        failed: totalFailed,
        offset,
        remaining,
        total_in_scope: totalInScope,
      })
      .eq('id', job.id);

    // Termination: empty batch in any mode means we're done.
    if (proc === 0) { done = true; break; }
    if (mode === 'fill' && remaining === 0) { done = true; break; }
    if (useOffset && totalInScope !== null && offset >= totalInScope) { done = true; break; }
  }

  if (done) {
    await admin
      .from('geocoding_jobs')
      .update({ status: 'completed', remaining: 0, last_error: null })
      .eq('id', job.id);
  } else if (lastError) {
    await admin
      .from('geocoding_jobs')
      .update({ last_error: lastError })
      .eq('id', job.id);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      job_id: job.id,
      processed: totalProcessed,
      updated: totalUpdated,
      failed: totalFailed,
      remaining,
      done,
      lastError,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
