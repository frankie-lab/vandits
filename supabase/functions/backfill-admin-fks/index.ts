// Domain: Geography — Backfill admin FKs (continent_id..sublocality_id, type_id)
// for existing locations that lack the geographic hierarchy.
//
// Strategy:
//   1. Fetch a batch of locations without country_id.
//   2. Reverse-geocode each (lat,lng) via Nominatim (OSM) to extract
//      continent/country/region/zone/admin3/locality/sublocality strings.
//   3. Call resolve-admin-area to upsert admin_areas rows and get UUIDs.
//   4. UPDATE locations with the resolved FKs. Trigger
//      `locations_sync_admin_cache` keeps legacy string columns in sync.
//
// Idempotent. Multi-user. Processes ALL users' locations (master-only).
//
// Input: { limit?: number = 50, dryRun?: boolean = false }
// Output: { processed, updated, failed, remaining, errors }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  normalizeNominatim,
  mergeCanonical,
  isMissingHighLevels,
  type CanonicalGeo,
  type NominatimAddress,
} from '../_shared/geo-normalizer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'VandIts-Backfill/1.0 (https://vandits.lovable.app)';
const RATE_LIMIT_MS = 1100; // Nominatim policy: max 1 req/sec

async function nominatimReverseRaw(lat: number, lng: number, zoom: number): Promise<NominatimAddress | null> {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1&accept-language=es,en`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.address ?? null) as NominatimAddress | null;
  } catch {
    return null;
  }
}

/** Doble llamada (zoom 18 detalle + zoom 10 si faltan niveles altos). */
async function reverseGeocodeCanonical(lat: number, lng: number): Promise<CanonicalGeo | null> {
  const detail = await nominatimReverseRaw(lat, lng, 18);
  if (!detail) return null;
  let canon = normalizeNominatim(detail);
  if (isMissingHighLevels(canon)) {
    await sleep(RATE_LIMIT_MS);
    const coarse = await nominatimReverseRaw(lat, lng, 10);
    if (coarse) canon = mergeCanonical(canon, normalizeNominatim(coarse));
  }
  return canon;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Service-role admin client used for reads/writes; access is scoped per-call
  // by an explicit user_id filter (when caller is authenticated) and/or a
  // document_id scope passed by the caller.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Identify the caller so we can scope the backfill to their own points.
  // pg_cron / service-role calls (no Authorization) keep the previous global
  // behavior to remain backward compatible.
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
  const force = body.force_renormalize === true;
  const documentId = typeof body.document_id === 'string' ? body.document_id : null;
  const catalogOnly = body.catalog_only === true;

  // Wall-clock budget: stop processing before edge function 150s idle timeout.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 120_000;

  // Build the candidate query with optional scoping.
  // "Pendiente" = falta cualquier nivel alto/medio de la jerarquía nueva.
  // admin3_id y sublocality_id son opcionales por naturaleza (no todos los lugares los tienen).
  const PENDING_OR = 'continent_id.is.null,country_id.is.null,region_id.is.null,zone_id.is.null,locality_id.is.null';
  let q = admin
    .from('locations')
    .select('id, latitude, longitude, country_id, continent_id')
    .is('deleted_at', null);
  if (!force) q = q.or(PENDING_OR);
  if (catalogOnly) q = q.eq('is_approved', true);
  if (callerUserId) q = q.eq('owner_user_id', callerUserId);
  if (documentId) q = q.eq('document_id', documentId);
  const offset = Math.max(0, Number(body.offset ?? 0));
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

    // Fast path: ya tiene country_id pero le falta continent_id.
    // Derivar continent desde admin_areas (path[0]) sin Nominatim.
    if (row.country_id && !row.continent_id) {
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
        if (updErr) {
          errors.push({ id: row.id, reason: `continent backfill failed: ${updErr.message}` });
        } else {
          updated++;
        }
        continue;
      }
      // Si no se pudo derivar, caemos al flujo normal de Nominatim.
    }

    const canon = await reverseGeocodeCanonical(row.latitude, row.longitude);
    await sleep(RATE_LIMIT_MS);

    if (!canon || !canon.country) {
      errors.push({ id: row.id, reason: 'reverse-geocode failed' });
      continue;
    }

    const { data: resolved, error: resErr } = await admin.functions.invoke('resolve-admin-area', {
      body: {
        continent: canon.continent,
        country: canon.country,
        region: canon.region,
        zone: canon.zone,
        admin3: canon.admin3,
        locality: canon.locality,
        sublocality: canon.sublocality,
      },
    });

    if (resErr) {
      errors.push({ id: row.id, reason: `resolve failed: ${resErr.message}` });
      continue;
    }

    const ids = (resolved as { ids?: Record<string, string | null> })?.ids ?? {};

    if (dryRun) {
      updated++;
      continue;
    }

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
      })
      .eq('id', row.id);

    if (updErr) {
      errors.push({ id: row.id, reason: `update failed: ${updErr.message}` });
      continue;
    }
    updated++;
  }

  // Compute remaining within the same scope as the fetch.
  let remainingQ = admin
    .from('locations')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  if (!force) remainingQ = remainingQ.or('country_id.is.null,continent_id.is.null');
  if (callerUserId) remainingQ = remainingQ.eq('owner_user_id', callerUserId);
  if (documentId) remainingQ = remainingQ.eq('document_id', documentId);
  const { count: remaining } = await remainingQ;

  return new Response(
    JSON.stringify({
      processed,
      updated,
      failed: errors.length,
      remaining: remaining ?? null,
      timedOut,
      durationMs: Date.now() - startedAt,
      errors: errors.slice(0, 20),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  );
});
