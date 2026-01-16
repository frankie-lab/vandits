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
    
    // Get locations to process (exclude already processed)
    const remainingIds = locationIds.filter(id => !processedIds.includes(id));
    
    for (const locationId of remainingIds) {
      // Check if job was paused/cancelled
      const { data: currentJob } = await supabase
        .from('enrichment_jobs')
        .select('status')
        .eq('id', jobId)
        .single();
      
      if (currentJob?.status === 'paused' || currentJob?.status === 'error') {
        console.log('Job paused or cancelled, stopping processing');
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
          }),
        });
        
        if (!enrichResponse.ok) {
          const errorText = await enrichResponse.text();
          throw new Error(`Enrich failed: ${enrichResponse.status} - ${errorText}`);
        }
        
        const enrichData = await enrichResponse.json();
        
        if (enrichData.success && enrichData.data) {
          // Update location with enriched data
          await supabase
            .from('locations')
            .update({
              enriched_data: enrichData.data,
              updated_at: new Date().toISOString(),
            })
            .eq('id', locationId);
          
          processedIds.push(locationId);
          console.log('Enriched location:', location.name);
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
    const { action, jobId, documentId, locationIds, onlyPending } = await req.json();
    
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
      
      await supabase
        .from('enrichment_jobs')
        .delete()
        .eq('id', jobId);
      
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
