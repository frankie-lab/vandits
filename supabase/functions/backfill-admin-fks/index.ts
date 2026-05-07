// Domain: Geography — Backfill admin FKs (continent_id..sublocality_id, type_id)
// for existing locations.
//
// Modes (param `mode`):
//   - 'fill'      → solo puntos sin jerarquía completa (default histórico).
//   - 'reconcile' → recorre TODOS los puntos del scope; reverse-geocodifica y
//                   sobrescribe los FKs SOLO si difieren de lo actual.
//   - 'overwrite' → recorre TODOS los puntos del scope y sobrescribe siempre.
//
// `force_renormalize: true` se mantiene como alias de mode='overwrite' para
// compatibilidad con clientes antiguos.
//
// Idempotente. Multi-user. No toca name/description/enriched_data/photos.
//
// Input:  { limit?, dryRun?, mode?, document_id?, catalog_only?, offset?, force_renormalize? }
// Output: { processed, updated, failed, remaining, mode, errors }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  reverseGeocodeCanonical,
  geoConfidenceScore,
  canonicalToResolveBody,
  NOMINATIM_RATE_LIMIT_MS as RATE_LIMIT_MS,
} from '../_shared/reverse-geocode.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Mode = 'fill' | 'reconcile' | 'overwrite';

const FK_KEYS = [
  'continent_id',
  'country_id',
  'region_id',
  'zone_id',
  'admin3_id',
  'locality_id',
  'sublocality_id',
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let callerUserId: string | null = null;
  const authHeader = req.headers.get('Authorization') ?? '';
  const accessToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (accessToken) {
    const { data: userData } = await admin.auth.getUser(accessToken);
    callerUserId = userData?.user?.id ?? null;
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 200);
  const dryRun = !!body.dryRun;
  const documentId = typeof body.document_id === 'string' ? body.document_id : null;
  const catalogOnly = body.catalog_only === true;
  const offset = Math.max(0, Number(body.offset ?? 0));

  // Mode resolution: explicit `mode`, fallback to legacy `force_renormalize`.
  let mode: Mode = (body.mode as Mode) ?? 'fill';
  if (body.force_renormalize === true && mode === 'fill') mode = 'overwrite';
  if (!['fill', 'reconcile', 'overwrite'].includes(mode)) mode = 'fill';

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 120_000;

  // Selection: in 'fill' we restrict to points missing high levels.
  // In 'reconcile' / 'overwrite' we walk the full scope.
  const PENDING_OR =
    'continent_id.is.null,country_id.is.null,region_id.is.null,zone_id.is.null,locality_id.is.null';

  let q = admin
    .from('locations')
    .select('id, latitude, longitude, country_id, continent_id, region_id, zone_id, admin3_id, locality_id, sublocality_id')
    .is('deleted_at', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (mode === 'fill') q = q.or(PENDING_OR);
  if (catalogOnly) q = q.eq('is_approved', true);
  if (callerUserId) q = q.eq('owner_user_id', callerUserId);
  if (documentId) q = q.eq('document_id', documentId);
  q = q.order('created_at', { ascending: true }).range(offset, offset + limit - 1);

  const { data: rows, error: fetchErr } = await q;

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const errors: Array<{ id: string; reason: string }> = [];
  let updated = 0;
  let processed = 0;
  let timedOut = false;

  for (const row of rows ?? []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    processed++;
    if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') {
      errors.push({ id: row.id, reason: 'missing coordinates' });
      continue;
    }

    // Fast path (fill only): country_id known, derive continent from path.
    if (mode === 'fill' && row.country_id && !row.continent_id) {
      const { data: countryRow } = await admin
        .from('admin_areas')
        .select('path')
        .eq('id', row.country_id)
        .maybeSingle();
      const continentId = Array.isArray(countryRow?.path) && countryRow.path.length > 0
        ? countryRow.path[0]
        : null;
      if (continentId && continentId !== row.country_id) {
        if (dryRun) { updated++; continue; }
        const { error: updErr } = await admin
          .from('locations')
          .update({ continent_id: continentId })
          .eq('id', row.id);
        if (updErr) errors.push({ id: row.id, reason: `continent backfill failed: ${updErr.message}` });
        else updated++;
        continue;
      }
    }

    const canon = await reverseGeocodeCanonical(row.latitude, row.longitude);
    await sleep(RATE_LIMIT_MS);

    if (!canon || !canon.country) {
      errors.push({ id: row.id, reason: 'reverse-geocode failed' });
      continue;
    }

    const { data: resolved, error: resErr } = await admin.functions.invoke('resolve-admin-area', {
      body: canonicalToResolveBody(canon),
    });

    if (resErr) {
      errors.push({ id: row.id, reason: `resolve failed: ${resErr.message}` });
      continue;
    }

    const ids = (resolved as { ids?: Record<string, string | null> })?.ids ?? {};

    // Reconcile: skip if every FK already matches the resolved value.
    if (mode === 'reconcile') {
      const same = FK_KEYS.every((k) => (ids[k] ?? null) === (row[k as keyof typeof row] ?? null));
      if (same) continue;
    }

    if (dryRun) { updated++; continue; }

    const confidence = geoConfidenceScore(canon);

    // Trace previous IDs in raw_geocode for traceability.
    const prevIds: Record<string, string | null> = {};
    for (const k of FK_KEYS) prevIds[k] = (row[k as keyof typeof row] as string | null) ?? null;

    const { error: updErr } = await admin
      .from('locations')
      .update({
        continent_id: ids.continent_id ?? null,
        country_id: ids.country_id ?? null,
        region_id: ids.region_id ?? null,
        zone_id: ids.zone_id ?? null,
        admin3_id: ids.admin3_id ?? null,
        locality_id: ids.locality_id ?? null,
        sublocality_id: ids.sublocality_id ?? null,
        country_code: canon.country_code ?? null,
        postal_code: canon.postal_code ?? null,
        geo_source: 'nominatim',
        geo_confidence: confidence,
        geo_resolved_at: new Date().toISOString(),
        raw_geocode: {
          ...(canon as unknown as Record<string, unknown>),
          previous: { ids: prevIds, replaced_at: new Date().toISOString(), mode },
        },
      })
      .eq('id', row.id);

    if (updErr) {
      errors.push({ id: row.id, reason: `update failed: ${updErr.message}` });
      continue;
    }
    updated++;
  }

  // Remaining counter (for 'fill' uses pending criteria; for reconcile/overwrite returns null
  // because every row is candidate and the count matches the table size, which is misleading).
  let remaining: number | null = null;
  if (mode === 'fill') {
    let remainingQ = admin
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .or(PENDING_OR);
    if (catalogOnly) remainingQ = remainingQ.eq('is_approved', true);
    if (callerUserId) remainingQ = remainingQ.eq('owner_user_id', callerUserId);
    if (documentId) remainingQ = remainingQ.eq('document_id', documentId);
    const { count } = await remainingQ;
    remaining = count ?? null;
  }

  return new Response(
    JSON.stringify({
      processed,
      updated,
      failed: errors.length,
      remaining,
      mode,
      timedOut,
      durationMs: Date.now() - startedAt,
      errors: errors.slice(0, 20),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  );
});
