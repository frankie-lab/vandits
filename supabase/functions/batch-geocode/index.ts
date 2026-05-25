import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  normalizeNominatim,
  mergeCanonical,
  isMissingHighLevels,
  type CanonicalGeo,
  type NominatimAddress,
} from '../_shared/geo-normalizer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DatosGeograficos {
  continente?: string;
  pais?: string;
  admin_nivel_1?: string;
  admin_nivel_2?: string;
  admin_nivel_3?: string;
  localidad?: string;
  sublocalidad?: string;
  direccion_postal?: string;
  calle?: string;
  coordenadas?: string;
  fuente_geocoding?: 'nominatim' | 'ai' | 'manual';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nominatimReverse(lat: number, lng: number, zoom: number): Promise<NominatimAddress | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1`,
      { headers: { 'Accept-Language': 'es,en', 'User-Agent': 'GeoDataManager/1.0' } },
    );
    if (!response.ok) {
      console.error('Nominatim error', zoom, response.status);
      return null;
    }
    const data = await response.json();
    return (data.address || {}) as NominatimAddress;
  } catch (err) {
    console.error('Nominatim fetch failed', zoom, err);
    return null;
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<{
  canonical?: CanonicalGeo;
  datos_geograficos?: DatosGeograficos;
}> {
  const detail = await nominatimReverse(lat, lng, 18);
  if (!detail) return {};

  let canonical = normalizeNominatim(detail);

  if (isMissingHighLevels(canonical)) {
    await delay(1100);
    const coarse = await nominatimReverse(lat, lng, 10);
    if (coarse) canonical = mergeCanonical(canonical, normalizeNominatim(coarse));
  }

  if (!canonical.country) return {};

  const datos_geograficos: DatosGeograficos = {
    continente: canonical.continent,
    pais: canonical.country,
    admin_nivel_1: canonical.region,
    admin_nivel_2: canonical.zone,
    admin_nivel_3: canonical.admin3,
    localidad: canonical.locality,
    sublocalidad: canonical.sublocality,
    calle: canonical.street,
    direccion_postal: canonical.postal_address,
    coordenadas: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    fuente_geocoding: 'nominatim',
  };

  return { canonical, datos_geograficos };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require valid JWT (rejects anon publishable key)
    const { requireAuth } = await import('../_shared/auth.ts');
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;


    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { document_id, location_ids, force_renormalize } = body ?? {};
    const force = force_renormalize === true;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (document_id !== undefined && document_id !== null && (typeof document_id !== 'string' || !uuidRe.test(document_id))) {
      return new Response(JSON.stringify({ error: 'Invalid document_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (location_ids !== undefined && location_ids !== null) {
      if (!Array.isArray(location_ids) || location_ids.length > 1000 || !location_ids.every((x: unknown) => typeof x === 'string' && uuidRe.test(x))) {
        return new Response(JSON.stringify({ error: 'Invalid location_ids' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let query = supabase
      .from('locations')
      .select('id, name, latitude, longitude, country, region, zone, continent, enriched_data');

    if (!force) {
      query = query.is('country', null);
    }

    if (document_id) query = query.eq('document_id', document_id);
    if (location_ids && location_ids.length > 0) query = query.in('id', location_ids);

    const { data: locations, error: fetchError } = await query.limit(500);

    if (fetchError) {
      console.error('Error fetching locations:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Error al obtener ubicaciones' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!locations || locations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No hay ubicaciones para geocodificar', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Found ${locations.length} locations to geocode (force=${force})`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      console.log(`Geocoding ${i + 1}/${locations.length}: ${loc.name}`);

      try {
        const result = await reverseGeocode(loc.latitude, loc.longitude);

        if (result.canonical?.country) {
          const can = result.canonical;
          let updatedEnrichedData = loc.enriched_data || {};
          if (result.datos_geograficos) {
            updatedEnrichedData = { ...updatedEnrichedData, datos_geograficos: result.datos_geograficos };
          }

          const { error: updateError } = await supabase
            .from('locations')
            .update({
              country: can.country,
              region: can.region ?? null,
              zone: can.zone ?? null,
              continent: can.continent ?? null,
              enriched_data: updatedEnrichedData,
            })
            .eq('id', loc.id);

          if (updateError) {
            console.error('Update error for', loc.name, ':', updateError);
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          console.log(`No geocoding result for ${loc.name}`);
          errorCount++;
        }

        if (i < locations.length - 1) await delay(1100);
      } catch (err) {
        console.error(`Error geocoding ${loc.name}:`, err);
        errorCount++;
      }
    }

    console.log(`Batch geocoding complete: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Geocodificación completada: ${successCount} éxitos, ${errorCount} errores`,
        total: locations.length,
        success_count: successCount,
        error_count: errorCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Batch geocode error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
