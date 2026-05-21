import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { inspectWgs84Coord, isValidWgs84Coord } from "../_shared/coord-validity.ts";
import { classifyPoiIdentityRootStatus } from "../_shared/poi-identity-root-status.ts";

// Declare EdgeRuntime for TypeScript
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LocationData {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  country?: string;
  region?: string;
  zone?: string;
  continent?: string;
  place_type?: string;
}

// Función para derivar PlaceType desde datos_clave.tipo (basado en BBDD real)
function getPlaceTypeFromTipo(tipo: string): string {
  const lowerTipo = tipo.toLowerCase();
  
  // Núcleos urbanos
  if (lowerTipo.includes('municipio') || lowerTipo.includes('ciudad') || lowerTipo.includes('villa') || 
      lowerTipo.includes('localidad') || lowerTipo.includes('comuna') || lowerTipo.includes('concejo') ||
      lowerTipo.includes('conjunto histórico') || lowerTipo.includes('despoblado') || lowerTipo.includes('pueblo') ||
      lowerTipo.includes('plaza')) {
    return 'city';
  }
  
  // Playas y costa
  if (lowerTipo.includes('playa') || lowerTipo.includes('cala') || lowerTipo.includes('acantilado') || 
      lowerTipo.includes('costa') || lowerTipo.includes('cabo') || lowerTipo.includes('puerto')) {
    return 'beach';
  }
  
  // Patrimonio histórico
  if (lowerTipo.includes('castillo') || lowerTipo.includes('fortaleza') || lowerTipo.includes('muralla') ||
      lowerTipo.includes('alcázar') || lowerTipo.includes('palacio') || lowerTipo.includes('torre') ||
      lowerTipo.includes('fortificación') || lowerTipo.includes('búnker') || lowerTipo.includes('ruina')) {
    return 'historical_site';
  }
  
  // Arquitectura religiosa
  if (lowerTipo.includes('iglesia') || lowerTipo.includes('catedral') || lowerTipo.includes('monasterio') ||
      lowerTipo.includes('ermita') || lowerTipo.includes('santuario') || lowerTipo.includes('convento') ||
      lowerTipo.includes('abadía') || lowerTipo.includes('basílica') || lowerTipo.includes('capilla')) {
    return 'religious_site';
  }
  
  // Reservas y parques naturales
  if (lowerTipo.includes('parque natural') || lowerTipo.includes('parque nacional') || 
      lowerTipo.includes('reserva') || lowerTipo.includes('biosfera') || lowerTipo.includes('espacio protegido') ||
      lowerTipo.includes('biotopo') || lowerTipo.includes('paraje natural')) {
    return 'natural_reserve';
  }
  
  // Accidentes geográficos
  if (lowerTipo.includes('pico') || lowerTipo.includes('montaña') || lowerTipo.includes('cumbre') ||
      lowerTipo.includes('formación') || lowerTipo.includes('desfiladero') || lowerTipo.includes('congost') ||
      lowerTipo.includes('cueva') || lowerTipo.includes('cañón') || lowerTipo.includes('garganta') || 
      lowerTipo.includes('desierto') || lowerTipo.includes('lago') || lowerTipo.includes('cascada') || 
      lowerTipo.includes('volcán') || lowerTipo.includes('geológic') || lowerTipo.includes('monumento natural') ||
      lowerTipo.includes('flysch') || lowerTipo.includes('salina')) {
    return 'geographic_feature';
  }
  
  // Miradores
  if (lowerTipo.includes('mirador') || lowerTipo.includes('balcón') || lowerTipo.includes('panorám')) {
    return 'viewpoint';
  }
  
  // Museos y cultura
  if (lowerTipo.includes('museo') || lowerTipo.includes('centro de interpretación') || 
      lowerTipo.includes('centro cultural') || lowerTipo.includes('educación ambiental') ||
      lowerTipo.includes('laberinto')) {
    return 'museum';
  }
  
  // Gastronomía
  if (lowerTipo.includes('restaurante') || lowerTipo.includes('bodega') || lowerTipo.includes('mercado') ||
      lowerTipo.includes('mesón') || lowerTipo.includes('taberna')) {
    return 'restaurant';
  }
  
  // Alojamiento
  if (lowerTipo.includes('hotel') || lowerTipo.includes('albergue') || lowerTipo.includes('camping') ||
      lowerTipo.includes('casa rural') || lowerTipo.includes('parador')) {
    return 'hotel';
  }
  
  // Rutas
  if (lowerTipo.includes('sendero') || lowerTipo.includes('ruta') || lowerTipo.includes('camino') ||
      lowerTipo.includes('vía verde')) {
    return 'route';
  }
  
  return 'other';
}

// Process enrichment in background
async function processEnrichmentJob(jobId: string, supabaseUrl: string, supabaseKey: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Starting background enrichment job:', jobId);
  
  try {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('enrichment_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError || !job) {
      console.error('Job not found:', jobError);
      return;
    }
    
    // Update job status to running
    await supabase
      .from('enrichment_jobs')
      .update({ status: 'running' })
      .eq('id', jobId);
    
    const locationIds = job.location_ids as string[];
    const processedIds = job.processed_ids as string[] || [];
    const errorIds = job.error_ids as string[] || [];
    const errorMessages = (job.error_messages as Record<string, unknown>) || {};
    const jobCuratorId: string | null = null;
    
    // Get locations to process (exclude already processed)
    const remainingIds = locationIds.filter(id => !processedIds.includes(id));

    // ============================================================
    // Concurrency-aware processing (waves of CONCURRENCY workers).
    // Each POI still writes its own UPDATE → realtime repaints
    // marker-by-marker as workers finish. Job-progress writes are
    // coalesced once per wave to avoid hammering enrichment_jobs.
    // ============================================================
    // Lowered from 8 → 4 (PR-IMG-2): 8 parallel calls hammered Wikimedia /
    // Commons / Openverse from the same Edge Function IP and got rate-limited
    // (90% of POIs ended up enriched but without image). 4 + jitter respects
    // upstream policies and keeps image-recovery rate high.
    const CONCURRENCY = 4;
    const WAVE_JITTER_MS = () => 100 + Math.floor(Math.random() * 300);

    // Sentinel returned by a worker when the AI Gateway is out of credits (402).
    // The wave loop uses it to pause the whole job instead of marking the POI as error.
    const NO_CREDITS = 'no_credits' as const;
    type WorkerResult = void | typeof NO_CREDITS;

    // --- per-POI worker (all original logic, untouched semantics) ---
    const processSingleLocation = async (locationId: string): Promise<WorkerResult> => {
      // Get location details
      const { data: location, error: locError } = await supabase
        .from('locations')
        .select('*')
        .eq('id', locationId)
        .single();

      if (locError || !location) {
        console.error('Location not found:', locationId);
        errorIds.push(locationId);
        errorMessages[locationId] = { kind: 'unknown', message: 'Ubicación no encontrada' };
        return;
      }

      // ===== SKIP ALREADY-ENRICHED (transversal rule: los verdes no se reenriquecen) =====
      const existingDesc = (location.enriched_data as { descripcion?: string } | null)?.descripcion;
      if (typeof existingDesc === 'string' && existingDesc.trim().length > 0) {
        processedIds.push(locationId);
        console.log('Skip already-enriched:', location.name);
        return;
      }

      // ===== R1 — WGS84 entry gate. Coords inválidas NO enriquecen.
      // Contrato: docs/contracts/enrichment-coord-coherence-contract.md.
      const coordCheck = inspectWgs84Coord(location.latitude, location.longitude);
      if (!coordCheck.valid) {
        errorIds.push(locationId);
        errorMessages[locationId] = {
          kind: 'invalid_coordinates',
          message: `Coordenadas inválidas (${coordCheck.reason}). Requiere geocoding antes de enriquecer.`,
          reason: coordCheck.reason,
        };
        console.warn('Skip invalid coords:', location.name, locationId, coordCheck.reason);
        return;
      }

      // ===== TRUNK LOOKUP (places_trunk) =====
      // R7 (Fase 7): defensa servidor — no consultar tronco con coords inválidas.
      try {
        const trunkCoordsOk = isValidWgs84Coord(location.latitude, location.longitude);
        const { data: trunkRows, error: trunkErr } = trunkCoordsOk
          ? await supabase.rpc('lookup_trunk_place', {
              _latitude: location.latitude,
              _longitude: location.longitude,
              _place_type: location.place_type ?? null,
              _max_distance_meters: 250,
            })
          : { data: null, error: null };
        if (!trunkErr) {
          const trunk = Array.isArray(trunkRows) ? trunkRows[0] : null;
          if (trunk?.is_fresh && trunk?.enriched_data) {
            const derivedPT = trunk.enriched_data?.datos_clave?.tipo
              ? getPlaceTypeFromTipo(trunk.enriched_data.datos_clave.tipo)
              : null;
            const updateData: Record<string, unknown> = {
              enriched_data: trunk.enriched_data,
              enrichment_status: 'enriched',
              updated_at: new Date().toISOString(),
            };
            if (derivedPT && derivedPT !== 'other') updateData.place_type = derivedPT;
            await supabase.from('locations').update(updateData).eq('id', locationId);
            processedIds.push(locationId);
            console.log('Inherited from trunk:', location.name, `(${Math.round(trunk.distance_meters)}m)`);
            return;
          }
        }
      } catch (e) {
        console.warn('Trunk lookup failed (continuing):', e);
      }

      // Check if this location has a catalog twin that's already enriched
      if (!location.is_approved && location.document_id) {
        const { data: catalogTwin } = await supabase
          .from('locations')
          .select('id, enriched_data, enrichment_status')
          .eq('name', location.name)
          .eq('is_approved', true)
          .is('deleted_at', null)
          .neq('id', locationId)
          .limit(1)
          .maybeSingle();

        if (catalogTwin?.enriched_data && catalogTwin.enrichment_status === 'enriched') {
          await supabase
            .from('locations')
            .update({
              enriched_data: catalogTwin.enriched_data,
              enrichment_status: 'enriched',
              updated_at: new Date().toISOString(),
            })
            .eq('id', locationId);
          processedIds.push(locationId);
          console.log('Inherited enrichment from catalog twin:', location.name, '→', catalogTwin.id);
          return;
        }
      }

      try {
        // Call enrich-location with 429 back-off (up to 2 retries).
        let enrichResponse: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          enrichResponse = await fetch(`${supabaseUrl}/functions/v1/enrich-location`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              location: {
                name: location.name,
                description: location.description,
                coordinates: { lat: location.latitude, lng: location.longitude },
                continent: location.continent,
                country: location.country,
                region: location.region,
                zone: location.zone,
                placeType: location.place_type,
              },
              generateImage: true,
              curatorId: jobCuratorId,
            }),
          });
          if (enrichResponse.status !== 429 || attempt === 2) break;
          const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`429 from enrich-location for ${location.name}, backing off ${backoff}ms`);
          await new Promise(r => setTimeout(r, backoff));
        }

        if (!enrichResponse || !enrichResponse.ok) {
          const errorText = enrichResponse ? await enrichResponse.text() : 'no response';
          const status = enrichResponse?.status ?? 0;
          const kind = status === 429 ? 'rate_limit'
            : status === 402 ? 'no_credits'
            : status >= 500 ? 'timeout'
            : 'unknown';
          throw Object.assign(new Error(`Enrich failed: ${status} - ${errorText.slice(0, 200)}`), {
            __structured: { kind, httpStatus: status },
          });
        }

        const enrichData = await enrichResponse.json();

        if (enrichData.success && enrichData.data) {
          const geocodedData = enrichData.data._geocoded;
          delete enrichData.data._geocoded;

          const derivedPlaceType = enrichData.data.datos_clave?.tipo
            ? getPlaceTypeFromTipo(enrichData.data.datos_clave.tipo)
            : null;

          const updateData: Record<string, unknown> = {
            enriched_data: enrichData.data,
            enrichment_status: 'enriched',
            updated_at: new Date().toISOString(),
          };

          if (derivedPlaceType && derivedPlaceType !== 'other') {
            updateData.place_type = derivedPlaceType;
          }

          if (geocodedData) {
            // R3 — persistir geografía estructurada SOLO desde el snapshot canónico
            // devuelto por `resolve-coordinates` (vía `enrich-location._geocoded`).
            // Contrato: docs/contracts/enrichment-coord-coherence-contract.md (Fase 2).
            if (geocodedData.country) updateData.country = geocodedData.country;
            if (geocodedData.region) updateData.region = geocodedData.region;
            if (geocodedData.zone) updateData.zone = geocodedData.zone;
            if (geocodedData.continent) updateData.continent = geocodedData.continent;
            if (geocodedData.country_code) updateData.country_code = geocodedData.country_code;
            if (geocodedData.postal_code) updateData.postal_code = geocodedData.postal_code;
            if (geocodedData.timezone) updateData.timezone = geocodedData.timezone;
            if (geocodedData.geo_source) updateData.geo_source = geocodedData.geo_source;
            if (typeof geocodedData.geo_confidence === 'number') updateData.geo_confidence = geocodedData.geo_confidence;
            if (geocodedData.geo_resolved_at) updateData.geo_resolved_at = geocodedData.geo_resolved_at;
            if (geocodedData.raw_geocode) updateData.raw_geocode = geocodedData.raw_geocode;
            const ids = geocodedData.ids ?? {};
            if (ids.continent_id) updateData.continent_id = ids.continent_id;
            if (ids.country_id) updateData.country_id = ids.country_id;
            if (ids.region_id) updateData.region_id = ids.region_id;
            if (ids.zone_id) updateData.zone_id = ids.zone_id;
            if (ids.admin3_id) updateData.admin3_id = ids.admin3_id;
            if (ids.locality_id) updateData.locality_id = ids.locality_id;
            if (ids.sublocality_id) updateData.sublocality_id = ids.sublocality_id;
          }

          await supabase.from('locations').update(updateData).eq('id', locationId);

          try {
            // R7 (Fase 7): defensa servidor — no contaminar tronco con coords inválidas.
            if (isValidWgs84Coord(location.latitude, location.longitude)) {
              await supabase.rpc('upsert_trunk_place', {
                _name: location.name,
                _latitude: location.latitude,
                _longitude: location.longitude,
                _place_type: (updateData.place_type as string) ?? location.place_type ?? null,
                _enriched_data: enrichData.data,
                _enriched_by: location.owner_user_id ?? null,
              });
            }
          } catch (e) {
            console.warn('Trunk upsert failed (non-fatal):', e);
          }

          processedIds.push(locationId);
          console.log('Enriched location:', location.name, geocodedData ? '(with geocoding)' : '', derivedPlaceType ? `[${derivedPlaceType}]` : '');
        } else if (enrichData.validation_required && enrichData.reason === 'reverse_geocode_failed') {
          // R3 — reverse-geocode falló. NO se llamó al LLM. No reintentar como rate-limit.
          throw Object.assign(new Error(enrichData.message || 'Reverse-geocode falló'), {
            __structured: {
              kind: 'reverse_geocode_failed',
              reason: 'reverse_geocode_failed',
              providedName: enrichData.providedName ?? location.name,
              coords: enrichData.coords ?? { lat: location.latitude, lng: location.longitude },
            },
          });
        } else if (enrichData.validation_required && enrichData.reason === 'identity_lookup_unavailable') {
          // R9 — Fase 3: lookups de identidad nombre↔coords caídos. HARD BLOCK. NO LLM.
          throw Object.assign(new Error(enrichData.message || 'Lookups de identidad no disponibles'), {
            __structured: {
              kind: 'identity_lookup_unavailable',
              reason: 'identity_lookup_unavailable',
              providedName: enrichData.providedName ?? location.name,
              coords: enrichData.coords ?? { lat: location.latitude, lng: location.longitude },
            },
          });
        } else if (enrichData.validation_required && enrichData.reason === 'name_coordinate_mismatch') {
          // R9 — Fase 3: nombre no coincide con coords. NO LLM.
          throw Object.assign(new Error(enrichData.message || 'Nombre↔coords no coinciden'), {
            __structured: {
              kind: 'name_coordinate_mismatch',
              reason: 'name_coordinate_mismatch',
              providedName: enrichData.providedName ?? location.name,
              coords: enrichData.coords ?? { lat: location.latitude, lng: location.longitude },
              nearby: Array.isArray(enrichData.nearby) ? enrichData.nearby : [],
            },
          });
        } else if (enrichData.validation_required && enrichData.reason === 'name_found_elsewhere') {
          // R9 — Fase 3: nombre encontrado en otra ubicación. NO LLM.
          throw Object.assign(new Error(enrichData.message || 'Nombre encontrado en otra ubicación'), {
            __structured: {
              kind: 'name_found_elsewhere',
              reason: 'name_found_elsewhere',
              providedName: enrichData.providedName ?? location.name,
              coords: enrichData.coords ?? { lat: location.latitude, lng: location.longitude },
              candidates: Array.isArray(enrichData.candidates) ? enrichData.candidates : [],
            },
          });
        } else if (enrichData.validation_required && enrichData.reason === 'geo_narrative_mismatch') {
          // R6 — Fase 6: la narrativa IA contradice la geografía canónica.
          // Persistimos `enrichment_status='quarantine'` + `custom_data.enrichment_block`
          // y NO escribimos `enriched_data` final.
          try {
            const { data: existingRow } = await supabase
              .from('locations')
              .select('custom_data')
              .eq('id', locationId)
              .maybeSingle();
            const existingCustom = (existingRow?.custom_data ?? {}) as Record<string, unknown>;
            await supabase
              .from('locations')
              .update({
                enrichment_status: 'quarantine',
                custom_data: {
                  ...existingCustom,
                  enrichment_block: {
                    reason: 'geo_narrative_mismatch',
                    level: enrichData.level ?? null,
                    expected: enrichData.expected ?? null,
                    got: enrichData.got ?? null,
                    source: enrichData.source ?? null,
                    at: new Date().toISOString(),
                  },
                },
              })
              .eq('id', locationId);
          } catch (e) {
            console.warn('[R6] failed to persist quarantine block (non-fatal):', e);
          }
          throw Object.assign(new Error(enrichData.message || 'Narrativa IA incoherente con geografía canónica'), {
            __structured: {
              kind: 'geo_narrative_mismatch',
              reason: 'geo_narrative_mismatch',
              level: enrichData.level ?? null,
              expected: enrichData.expected ?? null,
              got: enrichData.got ?? null,
              source: enrichData.source ?? null,
              providedName: enrichData.providedName ?? location.name,
            },
          });
        } else if (enrichData.validation_required) {
          throw Object.assign(new Error('Validación requerida (nombre/coordenadas)'), {
            __structured: {
              kind: 'no_match',
              candidates: Array.isArray(enrichData.nearbyCandidates) ? enrichData.nearbyCandidates : [],
              providedName: location.name,
            },
          });

        } else if (enrichData.success === false && enrichData.reason === 'name_coordinate_mismatch') {
          throw Object.assign(new Error(enrichData.message || 'Nombre y coordenadas no coinciden'), {
            __structured: {
              kind: 'coherence',
              candidates: Array.isArray(enrichData.nearbyCandidates) ? enrichData.nearbyCandidates : [],
              nameLocation: enrichData.nameLocation ?? null,
              providedName: enrichData.providedName ?? location.name,
            },
          });
        } else if (enrichData.success === false && enrichData.reason === 'llm_unverifiable') {
          throw Object.assign(new Error(enrichData.message || 'No verificable'), {
            __structured: {
              kind: 'llm_unverifiable',
              candidates: Array.isArray(enrichData.nearbyCandidates) ? enrichData.nearbyCandidates : [],
              providedName: enrichData.providedName ?? location.name,
            },
          });
        } else {
          throw Object.assign(new Error(enrichData.error || enrichData.message || 'Sin coincidencia'), {
            __structured: { kind: 'no_match' },
          });
        }
      } catch (enrichError) {
        console.error('Error enriching location:', location.name, enrichError);
        const structured = (enrichError as { __structured?: Record<string, unknown> })?.__structured;
        // 402 / no credits → DO NOT mark as error. Signal pause to the wave loop
        // so the POI stays pending and can be retried after user tops up.
        if (structured && structured.kind === 'no_credits') {
          return NO_CREDITS;
        }
        errorIds.push(locationId);
        const message = enrichError instanceof Error ? enrichError.message : 'Error desconocido';
        if (structured) {
          errorMessages[locationId] = { ...structured, message };
        } else {
          errorMessages[locationId] = { kind: 'network', message };
        }
      }
    };

    // --- wave loop ---
    for (let i = 0; i < remainingIds.length; i += CONCURRENCY) {
      // Check pause/cancel before launching the next wave
      const { data: currentJob } = await supabase
        .from('enrichment_jobs')
        .select('status')
        .eq('id', jobId)
        .single();

      if (!currentJob || currentJob.status === 'paused' || currentJob.status === 'error') {
        console.log('Job paused, cancelled or deleted, stopping processing');
        return;
      }

      const wave = remainingIds.slice(i, i + CONCURRENCY);

      // Surface a representative current location (first of the wave)
      const { data: firstLoc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', wave[0])
        .maybeSingle();
      await supabase
        .from('enrichment_jobs')
        .update({
          current_location_id: wave[0],
          current_location_name: firstLoc?.name ?? null,
        })
        .eq('id', jobId);

      // Stagger workers within a wave to spread external HTTP load.
      const waveResults = await Promise.allSettled(
        wave.map(async (id) => {
          await new Promise((r) => setTimeout(r, WAVE_JITTER_MS()));
          return processSingleLocation(id);
        }),
      );
      const hitNoCredits = waveResults.some(
        (r) => r.status === 'fulfilled' && r.value === NO_CREDITS,
      );

      // Single coalesced progress write per wave
      await supabase
        .from('enrichment_jobs')
        .update({
          processed_count: processedIds.length,
          error_count: errorIds.length,
          processed_ids: processedIds,
          error_ids: errorIds,
          error_messages: errorMessages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (hitNoCredits) {
        console.warn('AI Gateway out of credits (402) — pausing job', jobId);
        await supabase
          .from('enrichment_jobs')
          .update({
            status: 'paused',
            current_location_id: null,
            current_location_name: null,
            error_messages: { ...errorMessages, __pause_reason: 'no_credits' },
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        return;
      }
    }
    
    // Mark job as completed
    await supabase
      .from('enrichment_jobs')
      .update({
        status: 'completed',
        current_location_id: null,
        current_location_name: null,
      })
      .eq('id', jobId);
    
    console.log('Enrichment job completed:', jobId);
    
  } catch (error) {
    console.error('Enrichment job error:', error);
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase
      .from('enrichment_jobs')
      .update({
        status: 'error',
        error_messages: { _job_error: error instanceof Error ? error.message : 'Error desconocido' },
      })
      .eq('id', jobId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require valid JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Size cap: 256KB (batch may include arrays of ids)
    const rawText = await req.text();
    if (rawText.length > 256 * 1024) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let body: any;
    try { body = JSON.parse(rawText); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { action, jobId, documentId, locationIds, onlyPending, curatorId } = body ?? {};

    // Validate action and id arrays
    const validActions = new Set(['start', 'status', 'cancel', 'resume', 'pause', 'getActive']);
    if (action && !validActions.has(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (jobId && (typeof jobId !== 'string' || !uuidRe.test(jobId))) {
      return new Response(JSON.stringify({ error: 'Invalid jobId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (documentId && (typeof documentId !== 'string' || !uuidRe.test(documentId))) {
      return new Response(JSON.stringify({ error: 'Invalid documentId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (Array.isArray(locationIds)) {
      if (locationIds.length > 5000) {
        return new Response(JSON.stringify({ error: 'Too many locationIds' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (locationIds.some((x: unknown) => typeof x !== 'string' || !uuidRe.test(x as string))) {
        return new Response(JSON.stringify({ error: 'Invalid locationIds' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // GET STATUS
    if (action === 'status') {
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: 'Job ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const { data: job, error } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (error) {
        return new Response(
          JSON.stringify({ error: 'Job not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, job }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // START JOB
    if (action === 'start') {
      if (!documentId || !locationIds || locationIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Document ID and location IDs required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check for existing running job for this document
      const { data: existingJobs } = await supabase
        .from('enrichment_jobs')
        .select('id, status')
        .eq('document_id', documentId)
        .in('status', ['pending', 'running']);
      
      if (existingJobs && existingJobs.length > 0) {
        return new Response(
          JSON.stringify({ error: 'Ya hay un proceso en curso para este documento', existingJobId: existingJobs[0].id }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Create new job
      const { data: newJob, error: createError } = await supabase
        .from('enrichment_jobs')
        .insert({
          document_id: documentId,
          status: 'pending',
          total_count: locationIds.length,
          location_ids: locationIds,
        })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating job:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create job' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Created enrichment job:', newJob.id);
      
      // Start background processing
      EdgeRuntime.waitUntil(processEnrichmentJob(newJob.id, supabaseUrl, supabaseKey));
      
      return new Response(
        JSON.stringify({ success: true, jobId: newJob.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // PAUSE JOB
    if (action === 'pause') {
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: 'Job ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      await supabase
        .from('enrichment_jobs')
        .update({ status: 'paused' })
        .eq('id', jobId);
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // RESUME JOB
    if (action === 'resume') {
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: 'Job ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Get job and resume
      const { data: job } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (!job) {
        return new Response(
          JSON.stringify({ error: 'Job not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      await supabase
        .from('enrichment_jobs')
        .update({ status: 'running' })
        .eq('id', jobId);
      
      // Resume background processing
      EdgeRuntime.waitUntil(processEnrichmentJob(jobId, supabaseUrl, supabaseKey));
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // CANCEL JOB
    if (action === 'cancel') {
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: 'Job ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Set status to 'error' first so the background loop detects it and stops
      await supabase
        .from('enrichment_jobs')
        .update({ status: 'error' })
        .eq('id', jobId);
      
      // Then delete after a short delay to allow the loop to see the status change
      setTimeout(async () => {
        await supabase
          .from('enrichment_jobs')
          .delete()
          .eq('id', jobId);
      }, 3000);
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // GET ACTIVE JOB FOR DOCUMENT
    if (action === 'getActive') {
      if (!documentId) {
        return new Response(
          JSON.stringify({ error: 'Document ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const { data: activeJob } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .eq('document_id', documentId)
        .in('status', ['pending', 'running', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      // Auto-resume orphaned jobs (running but updated > 30 seconds ago)
      if (activeJob && activeJob.status === 'running') {
        const updatedAt = new Date(activeJob.updated_at).getTime();
        const now = Date.now();
        const isOrphaned = now - updatedAt > 30000; // 30 seconds without update
        
        if (isOrphaned && activeJob.processed_count < activeJob.total_count) {
          console.log('Detected orphaned job, auto-resuming:', activeJob.id);
          EdgeRuntime.waitUntil(processEnrichmentJob(activeJob.id, supabaseUrl, supabaseKey));
        }
      }
      
      // Also check for pending jobs that never started
      if (activeJob && activeJob.status === 'pending') {
        const createdAt = new Date(activeJob.created_at).getTime();
        const now = Date.now();
        const isStuck = now - createdAt > 10000; // 10 seconds without starting
        
        if (isStuck) {
          console.log('Detected stuck pending job, starting:', activeJob.id);
          EdgeRuntime.waitUntil(processEnrichmentJob(activeJob.id, supabaseUrl, supabaseKey));
        }
      }
      
      return new Response(
        JSON.stringify({ success: true, job: activeJob || null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Batch enrich error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
