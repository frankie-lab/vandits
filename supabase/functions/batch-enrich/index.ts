import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const errorMessages = job.error_messages as Record<string, string> || {};
    const jobCuratorId = job.curator_id as string | null;
    
    // Get locations to process (exclude already processed)
    const remainingIds = locationIds.filter(id => !processedIds.includes(id));
    
    for (const locationId of remainingIds) {
      // Check if job was paused/cancelled
      const { data: currentJob } = await supabase
        .from('enrichment_jobs')
        .select('status')
        .eq('id', jobId)
        .single();
      
      if (!currentJob || currentJob.status === 'paused' || currentJob.status === 'error') {
        console.log('Job paused, cancelled or deleted, stopping processing');
        return;
      }
      
      // Get location details
      const { data: location, error: locError } = await supabase
        .from('locations')
        .select('*')
        .eq('id', locationId)
        .single();
      
      if (locError || !location) {
        console.error('Location not found:', locationId);
        errorIds.push(locationId);
        errorMessages[locationId] = 'Ubicación no encontrada';
        continue;
      }
      
      // Check if this location has a catalog twin that's already enriched
      // (workspace copies should inherit from catalog, not enrich independently)
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
          // Inherit enrichment from catalog point
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
          
          // Update job progress
          await supabase
            .from('enrichment_jobs')
            .update({
              processed_count: processedIds.length,
              processed_ids: processedIds,
              updated_at: new Date().toISOString(),
            })
            .eq('id', jobId);
          continue;
        }
      }

      // Update current location
      await supabase
        .from('enrichment_jobs')
        .update({
          current_location_id: locationId,
          current_location_name: location.name,
        })
        .eq('id', jobId);
      
      try {
        // Call the enrich-location function
        const enrichResponse = await fetch(`${supabaseUrl}/functions/v1/enrich-location`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            location: {
              name: location.name,
              description: location.description,
              coordinates: {
                lat: location.latitude,
                lng: location.longitude,
              },
              continent: location.continent,
              country: location.country,
              region: location.region,
              zone: location.zone,
              placeType: location.place_type,
            },
            generateImage: true,
            curatorId: jobCuratorId, // Pass curator ID for curator-specific enrichment preferences
          }),
        });
        
        if (!enrichResponse.ok) {
          const errorText = await enrichResponse.text();
          throw new Error(`Enrich failed: ${enrichResponse.status} - ${errorText}`);
        }
        
        const enrichData = await enrichResponse.json();
        
        if (enrichData.success && enrichData.data) {
          // Extract geocoded data if present
          const geocodedData = enrichData.data._geocoded;
          delete enrichData.data._geocoded; // Remove from enriched_data
          
          // Derive place_type from datos_clave.tipo (más preciso)
          const derivedPlaceType = enrichData.data.datos_clave?.tipo 
            ? getPlaceTypeFromTipo(enrichData.data.datos_clave.tipo)
            : null;
          
          // Prepare update object with enriched data
          const updateData: Record<string, unknown> = {
            enriched_data: enrichData.data,
            enrichment_status: 'enriched',
            updated_at: new Date().toISOString(),
          };
          
          // Add derived place_type if valid
          if (derivedPlaceType && derivedPlaceType !== 'other') {
            updateData.place_type = derivedPlaceType;
            console.log('Derived place_type:', derivedPlaceType, 'from tipo:', enrichData.data.datos_clave?.tipo);
          }
          
          // Add geocoded geographic data if it was resolved
          if (geocodedData) {
            if (geocodedData.country) updateData.country = geocodedData.country;
            if (geocodedData.region) updateData.region = geocodedData.region;
            if (geocodedData.zone) updateData.zone = geocodedData.zone;
            if (geocodedData.continent) updateData.continent = geocodedData.continent;
            console.log('Saving geocoded data:', geocodedData);
          }
          
          // Update location with enriched data and geocoding
          await supabase
            .from('locations')
            .update(updateData)
            .eq('id', locationId);
          
          processedIds.push(locationId);
          console.log('Enriched location:', location.name, geocodedData ? '(with geocoding)' : '', derivedPlaceType ? `[${derivedPlaceType}]` : '');
        } else if (enrichData.validation_required) {
          // Legacy fallback: if enrich-location still returns validation_required,
          // retry with skipValidation=true to force enrichment
          console.log('Retrying with skipValidation for:', location.name);
          const retryResponse = await fetch(enrichUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              location: {
                name: location.name,
                coordinates: { lat: location.latitude, lng: location.longitude },
                country: location.country,
                region: location.region,
                zone: location.zone,
                continent: location.continent,
              },
              generateImage: true,
              curatorId: jobCuratorId,
              skipValidation: true,
            }),
          });
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            if (retryData.success && retryData.data) {
              const geocodedData = retryData.data._geocoded;
              delete retryData.data._geocoded;
              const derivedPlaceType2 = retryData.data.datos_clave?.tipo ? getPlaceTypeFromTipo(retryData.data.datos_clave.tipo) : null;
              const updateData2: Record<string, unknown> = {
                enriched_data: retryData.data,
                enrichment_status: 'enriched',
                updated_at: new Date().toISOString(),
              };
              if (derivedPlaceType2 && derivedPlaceType2 !== 'other') updateData2.place_type = derivedPlaceType2;
              if (geocodedData) {
                if (geocodedData.country) updateData2.country = geocodedData.country;
                if (geocodedData.region) updateData2.region = geocodedData.region;
                if (geocodedData.zone) updateData2.zone = geocodedData.zone;
                if (geocodedData.continent) updateData2.continent = geocodedData.continent;
              }
              await supabase.from('locations').update(updateData2).eq('id', locationId);
              processedIds.push(locationId);
              console.log('Enriched location (retry):', location.name);
            } else {
              await supabase.from('locations').update({ enrichment_status: 'unresolved', updated_at: new Date().toISOString() }).eq('id', locationId);
              processedIds.push(locationId);
              console.log('Location marked as unresolved after retry:', location.name);
            }
          } else {
            throw new Error('Retry enrichment failed: ' + retryResponse.status);
          }
        } else {
          throw new Error(enrichData.error || 'Unknown enrichment error');
        }
      } catch (enrichError) {
        console.error('Error enriching location:', location.name, enrichError);
        errorIds.push(locationId);
        errorMessages[locationId] = enrichError instanceof Error ? enrichError.message : 'Error desconocido';
      }
      
      // Update job progress
      await supabase
        .from('enrichment_jobs')
        .update({
          processed_count: processedIds.length,
          error_count: errorIds.length,
          processed_ids: processedIds,
          error_ids: errorIds,
          error_messages: errorMessages,
        })
        .eq('id', jobId);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
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
          curator_id: curatorId || null, // Store curator ID for curator-specific enrichment
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
