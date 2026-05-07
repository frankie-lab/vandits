// Domain: Geography — One-shot catalog geo backfill (master only).
// Itera backfill-admin-fks con catalog_only=true sobre TODOS los puntos
// is_approved=true que tengan jerarquía geográfica incompleta.
//
// Idempotente: invocar varias veces si el budget se agota.
//
// Input:  { limit_per_chunk?: number = 50, max_iterations?: number = 30 }
// Output: { iterations, total_processed, total_updated, total_failed, remaining, timedOut }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const TIME_BUDGET_MS = 130_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Authorization: only masters can launch this.
  const authHeader = req.headers.get('Authorization') ?? '';
  const accessToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: userData } = await admin.auth.getUser(accessToken);
  const callerId = userData?.user?.id;
  if (!callerId) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', callerId)
    .eq('role', 'master')
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: 'forbidden: master role required' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const limitPerChunk = Math.min(Math.max(Number(body.limit_per_chunk ?? 50), 1), 200);
  const maxIterations = Math.min(Math.max(Number(body.max_iterations ?? 30), 1), 100);

  const startedAt = Date.now();
  let iterations = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let remaining: number | null = null;
  let timedOut = false;

  while (iterations < maxIterations) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    iterations++;

    // Invoke backfill via direct fetch with service-role auth (no caller scoping).
    const res = await fetch(`${SUPABASE_URL}/functions/v1/backfill-admin-fks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        limit: limitPerChunk,
        catalog_only: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error');
      return new Response(
        JSON.stringify({
          error: `backfill chunk failed: ${errText}`,
          iterations,
          total_processed: totalProcessed,
          total_updated: totalUpdated,
          total_failed: totalFailed,
          remaining,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const chunk = await res.json();
    totalProcessed += Number(chunk.processed ?? 0);
    totalUpdated += Number(chunk.updated ?? 0);
    totalFailed += Number(chunk.failed ?? 0);
    remaining = typeof chunk.remaining === 'number' ? chunk.remaining : remaining;

    if ((chunk.processed ?? 0) === 0) break;
    if (typeof chunk.remaining === 'number' && chunk.remaining === 0) break;
  }

  return new Response(
    JSON.stringify({
      iterations,
      total_processed: totalProcessed,
      total_updated: totalUpdated,
      total_failed: totalFailed,
      remaining,
      timedOut,
      durationMs: Date.now() - startedAt,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  );
});
