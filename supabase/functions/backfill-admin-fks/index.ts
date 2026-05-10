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

type Mode = 'fill' | 'reconcile' | 'overwrite' | 'repair';

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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // "Service role" detection: explicit env match OR a bearer that does not
  // resolve to an end-user via auth.getUser (covers cases where the env var
  // is missing/rotated and the cron tick still passes the service key).
  let isServiceRole = !!accessToken && accessToken === serviceRoleKey;
  if (accessToken && !isServiceRole) {
    const { data: userData } = await admin.auth.getUser(accessToken);
    callerUserId = userData?.user?.id ?? null;
    if (!callerUserId) isServiceRole = true;
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  // When invoked with the service role key (e.g. by geocoding-job-tick),
  // trust an explicit user_id in the body to scope the work.
  if (isServiceRole && typeof body.user_id === 'string') {
    callerUserId = body.user_id;
  }
  // Hard cap = 500: a PostgREST `?id=in.(...)` URL with 500 UUIDs (~18 KB)
  // stays well under the runtime URL limit (~16 KB margin). Above that we
  // would explode the request URL (the bug that froze prior selection jobs).
  const limit = Math.min(Math.max(Number(body.limit ?? 500), 1), 500);
  const dryRun = !!body.dryRun;
  const documentId = typeof body.document_id === 'string' ? body.document_id : null;
  const catalogOnly = body.catalog_only === true;
  const offset = Math.max(0, Number(body.offset ?? 0));
  // Optional explicit POI selection: if provided, completely replaces the
  // dynamic selection (mode/catalog/document filters still apply for safety).
  const locationIds: string[] | null = Array.isArray(body.location_ids)
    ? (body.location_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    : null;
  // Optional admin-area scope: any of the four FK levels.
  const adminScope: {
    continent_id?: string;
    country_id?: string;
    region_id?: string;
    zone_id?: string;
  } = (body.admin_scope && typeof body.admin_scope === 'object') ? body.admin_scope : {};

  // NEW: health-based scope. When provided, the selection of points to process
  // comes from the unified geo-health view (admin_user_geo_scope_ids RPC).
  // This is the SAME SOURCE OF TRUTH as the panel's counters and tabs, so
  // total_in_scope / remaining can never diverge from the UI.
  const healthFilter: string[] | null = Array.isArray(body.health_filter)
    ? (body.health_filter as unknown[]).filter((x): x is string => typeof x === 'string')
    : null;
  const geoNode: {
    continent?: string | null;
    country?: string | null;
    region?: string | null;
    zone?: string | null;
    admin_level_3?: string | null;
    locality?: string | null;
    sublocality?: string | null;
  } = (body.geo_node && typeof body.geo_node === 'object') ? body.geo_node : {};

  const applyAdminScope = <T extends { eq: (col: string, val: unknown) => T }>(q: T): T => {
    let out = q;
    if (adminScope.continent_id) out = out.eq('continent_id', adminScope.continent_id);
    if (adminScope.country_id)   out = out.eq('country_id', adminScope.country_id);
    if (adminScope.region_id)    out = out.eq('region_id', adminScope.region_id);
    if (adminScope.zone_id)      out = out.eq('zone_id', adminScope.zone_id);
    return out;
  };

  // SAFETY: el backfill SIEMPRE debe correr con scope de usuario.
  // Nunca se permite ejecutar a nivel global (ni siquiera para masters/service role).
  if (!callerUserId) {
    return new Response(
      JSON.stringify({
        error: 'missing_user_scope',
        message:
          'backfill-admin-fks requires a user scope. Provide a user JWT or user_id in body when using service role.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Mode resolution: explicit `mode`, fallback to legacy `force_renormalize`.
  let mode: Mode = (body.mode as Mode) ?? 'fill';
  if (body.force_renormalize === true && mode === 'fill') mode = 'overwrite';
  if (!['fill', 'reconcile', 'overwrite', 'repair'].includes(mode)) mode = 'fill';
  const jobId = typeof body.job_id === 'string' ? body.job_id : null;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 120_000;
  let canceled = false;

  const shouldCancel = async () => {
    if (!jobId) return false;
    const { data: jobRow } = await admin
      .from('geocoding_jobs')
      .select('status')
      .eq('id', jobId)
      .maybeSingle();
    return jobRow?.status === 'canceling';
  };

  // Selection: in 'fill' we restrict to points missing high levels.
  // In 'reconcile' / 'overwrite' we walk the full scope.
  // In 'repair' we only touch rows with a broken admin chain.
  const PENDING_OR =
    'continent_id.is.null,country_id.is.null,region_id.is.null,zone_id.is.null,locality_id.is.null';

  // 'repair' mode: ask the DB which rows have broken chains for this user.
  let repairIds: string[] | null = null;
  if (mode === 'repair') {
    const { data: brokenRows, error: brokenErr } = await admin.rpc(
      'locations_with_broken_geo_chain',
      { _user_id: callerUserId, _limit: limit, _offset: offset },
    );
    if (brokenErr) {
      return new Response(JSON.stringify({ error: brokenErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    repairIds = (brokenRows ?? []).map((r: { id: string }) => r.id);
  }

  // Health-filter scope: ask the unified RPC for a page of matching IDs.
  // These IDs are then processed exactly like an explicit `location_ids` set.
  // CRITICAL: si llega `location_ids`, esa selección manda. No mezclamos con
  // health_filter porque los .in() en cadena se sobrescriben en PostgREST y
  // además el recount usaría el universo del filtro, pisando total_in_scope.
  let healthScopeIds: string[] | null = null;
  if (healthFilter && healthFilter.length > 0 && !(locationIds && locationIds.length > 0)) {
    const { data: scopeRows, error: scopeErr } = await admin.rpc('admin_user_geo_scope_ids', {
      _user_id: callerUserId,
      _health_filter: healthFilter,
      _continent: geoNode.continent ?? null,
      _country: geoNode.country ?? null,
      _region: geoNode.region ?? null,
      _zone: geoNode.zone ?? null,
      _admin_level_3: geoNode.admin_level_3 ?? null,
      _locality: geoNode.locality ?? null,
      _sublocality: geoNode.sublocality ?? null,
      _limit: limit,
      _offset: 0,
    });
    if (scopeErr) {
      return new Response(JSON.stringify({ error: scopeErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    healthScopeIds = (scopeRows ?? []).map((r: { id: string }) => r.id);
    if (healthScopeIds.length === 0) {
      return new Response(JSON.stringify({
        processed: 0, updated: 0, failed: 0,
        remaining: 0, totalInScope: 0, nextOffset: offset,
        mode, timedOut: false, durationMs: 0, errors: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }
  }

  let q = admin
    .from('locations')
    .select('id, latitude, longitude, country_id, continent_id, region_id, zone_id, admin3_id, locality_id, sublocality_id')
    .is('deleted_at', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (mode === 'fill' && !healthScopeIds) q = q.or(PENDING_OR);
  if (catalogOnly) q = q.eq('is_approved', true);
  if (callerUserId) q = q.eq('owner_user_id', callerUserId);
  if (documentId) q = q.eq('document_id', documentId);
  // Slice explicit `location_ids` server-side BEFORE the PostgREST request
  // so the URL never carries more than `limit` UUIDs. Without this, a 3000-
  // point selection serializes ~114 KB into the URL and the runtime answers
  // "Invalid URL" → the job never advances. The slice also paginates: each
  // tick consumes the next `limit` IDs via `offset`.
  const idsSlice = (locationIds && locationIds.length > 0)
    ? locationIds.slice(offset, offset + limit)
    : null;
  if (idsSlice) q = q.in('id', idsSlice);
  if (healthScopeIds) q = q.in('id', healthScopeIds);
  if (repairIds) {
    if (repairIds.length === 0) {
      return new Response(JSON.stringify({
        processed: 0, updated: 0, failed: 0,
        remaining: 0, totalInScope: 0, nextOffset: offset,
        mode, timedOut: false, durationMs: 0, errors: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }
    q = q.in('id', repairIds);
  }
  q = applyAdminScope(q);
  // 'repair' / health-scope / explicit-IDs already paginate by themselves
  // (RPC page, unhealthy view, or server-side slice). Only the dynamic
  // `fill` / `reconcile` / `overwrite` selection needs `.range()`.
  if (mode !== 'repair' && !healthScopeIds && !idsSlice) {
    q = q.order('created_at', { ascending: true }).range(offset, offset + limit - 1);
  } else {
    q = q.order('created_at', { ascending: true });
  }

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
    if (await shouldCancel()) {
      canceled = true;
      break;
    }
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    processed++;
    if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') {
      errors.push({ id: row.id, reason: 'missing coordinates' });
      continue;
    }

    // (Fast-path eliminado: en cualquier modo se recorre la ruta canónica
    // completa via reverse-geocode + resolve-admin-area. Lógica única.)

    const canon = await reverseGeocodeCanonical(row.latitude, row.longitude);
    await sleep(RATE_LIMIT_MS);

    if (await shouldCancel()) {
      canceled = true;
      break;
    }

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

    if (await shouldCancel()) {
      canceled = true;
      break;
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

  // Remaining counter:
  // - 'fill': pending = points still missing high-level FKs.
  // - 'repair': pending = points whose admin chain is still broken.
  // - 'reconcile' / 'overwrite': total in scope − offset − processed.
  let remaining: number | null = null;
  let totalInScope: number | null = null;
  if (healthScopeIds) {
    // Recount via the same RPC after this batch — points that were fixed have
    // dropped out of the unhealthy set automatically.
    const { data: stillIds, error: stillErr } = await admin.rpc('admin_user_geo_scope_ids', {
      _user_id: callerUserId,
      _health_filter: healthFilter,
      _continent: geoNode.continent ?? null,
      _country: geoNode.country ?? null,
      _region: geoNode.region ?? null,
      _zone: geoNode.zone ?? null,
      _admin_level_3: geoNode.admin_level_3 ?? null,
      _locality: geoNode.locality ?? null,
      _sublocality: geoNode.sublocality ?? null,
      _limit: 100000,
      _offset: 0,
    });
    if (stillErr) {
      remaining = 0;
    } else {
      remaining = (stillIds ?? []).length;
    }
    totalInScope = remaining;
  } else if (mode === 'fill') {
    let remainingQ = admin
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .or(PENDING_OR);
    if (catalogOnly) remainingQ = remainingQ.eq('is_approved', true);
    if (callerUserId) remainingQ = remainingQ.eq('owner_user_id', callerUserId);
    if (documentId) remainingQ = remainingQ.eq('document_id', documentId);
    if (locationIds && locationIds.length > 0) remainingQ = remainingQ.in('id', locationIds);
    remainingQ = applyAdminScope(remainingQ);
    const { count } = await remainingQ;
    remaining = count ?? null;
  } else if (mode === 'repair') {
    const { data: cnt } = await admin.rpc('count_locations_with_broken_geo_chain', {
      _user_id: callerUserId,
    });
    remaining = typeof cnt === 'number' ? cnt : Number(cnt ?? 0);
    totalInScope = remaining;
  } else {
    let scopeQ = admin
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);
    if (catalogOnly) scopeQ = scopeQ.eq('is_approved', true);
    if (callerUserId) scopeQ = scopeQ.eq('owner_user_id', callerUserId);
    if (documentId) scopeQ = scopeQ.eq('document_id', documentId);
    if (locationIds && locationIds.length > 0) scopeQ = scopeQ.in('id', locationIds);
    scopeQ = applyAdminScope(scopeQ);
    const { count } = await scopeQ;
    totalInScope = count ?? 0;
    remaining = Math.max(0, totalInScope - (offset + processed));
  }
  const nextOffset = offset + processed;

  return new Response(
    JSON.stringify({
      processed,
      updated,
      failed: errors.length,
      canceled,
      remaining,
      totalInScope,
      nextOffset,
      mode,
      timedOut,
      durationMs: Date.now() - startedAt,
      errors: errors.slice(0, 20),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  );
});
