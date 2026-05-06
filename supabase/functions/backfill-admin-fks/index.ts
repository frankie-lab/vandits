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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'VandIts-Backfill/1.0 (https://vandits.lovable.app)';
const RATE_LIMIT_MS = 1100; // Nominatim policy: max 1 req/sec

// OSM admin_level → our level mapping (heuristic, varies per country).
// We pick the most common conventions.
function mapNominatimAddress(addr: Record<string, string>): {
  continent?: string;
  country?: string;
  region?: string;
  zone?: string;
  admin3?: string;
  locality?: string;
  sublocality?: string;
} {
  const out: Record<string, string | undefined> = {};
  out.country = addr.country;
  // region = state / province / region
  out.region = addr.state ?? addr.region ?? addr.province;
  // zone = county / state_district / province sub
  out.zone = addr.county ?? addr.state_district;
  // admin3 = municipality / city_district
  out.admin3 = addr.municipality ?? addr.city_district;
  // locality = city / town / village
  out.locality = addr.city ?? addr.town ?? addr.village ?? addr.hamlet;
  // sublocality = suburb / neighbourhood / quarter
  out.sublocality = addr.suburb ?? addr.neighbourhood ?? addr.quarter;
  return out;
}

// Continent inference from country code (ISO-3166-1 alpha-2).
const CONTINENT_BY_CC: Record<string, string> = {};
const EU = 'AD,AL,AT,BA,BE,BG,BY,CH,CY,CZ,DE,DK,EE,ES,FI,FO,FR,GB,GE,GG,GI,GR,HR,HU,IE,IM,IS,IT,JE,LI,LT,LU,LV,MC,MD,ME,MK,MT,NL,NO,PL,PT,RO,RS,RU,SE,SI,SJ,SK,SM,TR,UA,VA,XK';
const AS = 'AE,AF,AM,AZ,BD,BH,BN,BT,CC,CN,CX,HK,ID,IL,IN,IO,IQ,IR,JO,JP,KG,KH,KP,KR,KW,KZ,LA,LB,LK,MM,MN,MO,MV,MY,NP,OM,PH,PK,PS,QA,SA,SG,SY,TH,TJ,TL,TM,TR,TW,UZ,VN,YE';
const AF = 'AO,BF,BI,BJ,BW,CD,CF,CG,CI,CM,CV,DJ,DZ,EG,EH,ER,ET,GA,GH,GM,GN,GQ,GW,KE,KM,LR,LS,LY,MA,MG,ML,MR,MU,MW,MZ,NA,NE,NG,RE,RW,SC,SD,SH,SL,SN,SO,SS,ST,SZ,TD,TG,TN,TZ,UG,YT,ZA,ZM,ZW';
const NA = 'AG,AI,AW,BB,BL,BM,BQ,BS,BZ,CA,CR,CU,CW,DM,DO,GD,GL,GP,GT,HN,HT,JM,KN,KY,LC,MF,MQ,MS,MX,NI,PA,PM,PR,SV,SX,TC,TT,US,VC,VG,VI';
const SA = 'AR,BO,BR,CL,CO,EC,FK,GF,GY,PE,PY,SR,UY,VE';
const OC = 'AS,AU,CK,FJ,FM,GU,KI,MH,MP,NC,NF,NR,NU,NZ,PF,PG,PN,PW,SB,TK,TO,TV,VU,WF,WS';
const AN = 'AQ,BV,GS,HM,TF';
for (const cc of EU.split(',')) CONTINENT_BY_CC[cc] = 'Europe';
for (const cc of AS.split(',')) CONTINENT_BY_CC[cc] = 'Asia';
for (const cc of AF.split(',')) CONTINENT_BY_CC[cc] = 'Africa';
for (const cc of NA.split(',')) CONTINENT_BY_CC[cc] = 'North America';
for (const cc of SA.split(',')) CONTINENT_BY_CC[cc] = 'South America';
for (const cc of OC.split(',')) CONTINENT_BY_CC[cc] = 'Oceania';
for (const cc of AN.split(',')) CONTINENT_BY_CC[cc] = 'Antarctica';

async function reverseGeocode(lat: number, lng: number): Promise<Record<string, string> | null> {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1&accept-language=en`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.address ?? null;
  } catch {
    return null;
  }
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
  const documentId = typeof body.document_id === 'string' ? body.document_id : null;

  // Wall-clock budget: stop processing before edge function 150s idle timeout.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 120_000;

  // Build the candidate query with optional scoping.
  // "Pendiente" = falta country_id O falta continent_id (legacy de antes del trigger).
  let q = admin
    .from('locations')
    .select('id, latitude, longitude, country_id, continent_id')
    .or('country_id.is.null,continent_id.is.null')
    .is('deleted_at', null);
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

    const addr = await reverseGeocode(row.latitude, row.longitude);
    await sleep(RATE_LIMIT_MS);

    if (!addr) {
      errors.push({ id: row.id, reason: 'reverse-geocode failed' });
      continue;
    }

    const mapped = mapNominatimAddress(addr);
    const cc = (addr.country_code ?? '').toUpperCase();
    const continent = cc ? CONTINENT_BY_CC[cc] : undefined;

    // Resolve UUIDs via existing edge function (idempotent)
    const { data: resolved, error: resErr } = await admin.functions.invoke('resolve-admin-area', {
      body: {
        continent,
        country: mapped.country,
        region: mapped.region,
        zone: mapped.zone,
        admin3: mapped.admin3,
        locality: mapped.locality,
        sublocality: mapped.sublocality,
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
    .or('country_id.is.null,continent_id.is.null')
    .is('deleted_at', null);
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
