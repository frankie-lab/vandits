// Domain: Geography — Punto único de entrada para normalizar coordenadas (lat,lng).
//
// Pipeline:
//   1. Validar lat/lng (WGS84).
//   2. Reverse-geocode canónico (Nominatim doble pasada) → CanonicalGeo.
//   3. Resolver admin_areas (cadena 7 niveles + ISO + admin_type_local).
//   4. Calcular geo_confidence y devolver snapshot raw_geocode.
//
// NO escribe en `locations` por sí mismo — devuelve los IDs/strings/metadatos
// listos para que el llamador los aplique en la fila correspondiente. Esto
// permite reutilizarlo desde el cliente (enrich-location), desde batch
// jobs (backfill-admin-fks) y desde imports.
//
// Input:
//   { latitude: number, longitude: number, place_type_code?: string }
// Output:
//   {
//     canonical: CanonicalGeo,
//     ids: { continent_id, country_id, region_id, zone_id,
//            admin3_id, locality_id, sublocality_id },
//     country_code, admin1_iso, postal_code, timezone,
//     geo_source: 'nominatim',
//     geo_confidence: number (0-100),
//     raw_geocode: CanonicalGeo
//   }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  reverseGeocodeCanonical,
  geoConfidenceScore,
  canonicalToResolveBody,
} from '../_shared/reverse-geocode.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface ReqBody {
  latitude?: number;
  longitude?: number;
  place_type_code?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const lat = Number(body.latitude);
  const lng = Number(body.longitude);
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    return json({ error: 'invalid_coordinates' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const canon = await reverseGeocodeCanonical(lat, lng);
  if (!canon) {
    return json({
      error: 'reverse_geocode_failed',
      canonical: null,
      ids: emptyIds(),
      geo_source: 'nominatim',
      geo_confidence: 0,
    }, 502);
  }

  // Resolver FKs admin reutilizando resolve-admin-area (idempotente).
  let ids = emptyIds();
  try {
    const { data, error } = await admin.functions.invoke('resolve-admin-area', {
      body: canonicalToResolveBody(canon),
    });
    if (!error && data?.ids) ids = { ...ids, ...data.ids };
  } catch (err) {
    console.warn('[resolve-coordinates] resolve-admin-area failed:', err);
  }

  // Timezone: si admin_areas.country tiene timezone, úsalo (lo aplicará el trigger).
  // Aquí lo devolvemos como hint para llamadas que no pasen por el trigger.
  let timezone: string | null = null;
  if (ids.country_id) {
    const { data: countryRow } = await admin
      .from('admin_areas')
      .select('timezone')
      .eq('id', ids.country_id)
      .maybeSingle();
    timezone = countryRow?.timezone ?? null;
  }

  // Resolver place_type_code → type_id (opcional).
  let type_id: string | null = null;
  if (body.place_type_code) {
    const { data: typeRow } = await admin
      .from('place_types')
      .select('id')
      .eq('code', body.place_type_code)
      .eq('is_active', true)
      .maybeSingle();
    type_id = typeRow?.id ?? null;
  }

  const confidence = geoConfidenceScore(canon);

  return json({
    canonical: canon,
    ids: { ...ids, type_id },
    country_code: canon.country_code ?? null,
    admin1_iso: canon.region ? null : null, // se resuelve vía admin_areas.iso_code en trigger
    postal_code: canon.postal_code ?? null,
    timezone,
    geo_source: 'nominatim',
    geo_confidence: confidence,
    raw_geocode: canon,
  }, 200);
});

function emptyIds() {
  return {
    continent_id: null as string | null,
    country_id: null as string | null,
    region_id: null as string | null,
    zone_id: null as string | null,
    admin3_id: null as string | null,
    locality_id: null as string | null,
    sublocality_id: null as string | null,
  };
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
