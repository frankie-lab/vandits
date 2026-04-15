/**
 * migrate-v2 — Edge function to migrate legacy locations → places + waypoints + user_places.
 * 
 * Runs as a batch process, idempotent (skips already-migrated records).
 * Must be called by a master user.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MigrationStats {
  placesCreated: number;
  placesSkipped: number;
  waypointsCreated: number;
  waypointsSkipped: number;
  userPlacesCreated: number;
  userPlacesSkipped: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is master
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check master role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'master')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: master role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const batchSize = body.batchSize || 500;

    const stats: MigrationStats = {
      placesCreated: 0,
      placesSkipped: 0,
      waypointsCreated: 0,
      waypointsSkipped: 0,
      userPlacesCreated: 0,
      userPlacesSkipped: 0,
      errors: [],
    };

    // 1. Fetch all non-deleted locations with their documents
    let allLocations: any[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('locations')
        .select('*, documents!inner(id, user_id, status)')
        .is('deleted_at', null)
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: true });

      if (error) {
        stats.errors.push(`Fetch error at offset ${offset}: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      allLocations = allLocations.concat(data);
      if (data.length < batchSize) break;
      offset += batchSize;
    }

    console.log(`[migrate-v2] Found ${allLocations.length} locations to process`);

    // 2. Get existing places to avoid duplicates (by name+coords)
    const { data: existingPlaces } = await supabase
      .from('places')
      .select('id, name, latitude, longitude');

    const placeIndex = new Map<string, string>();
    for (const p of existingPlaces || []) {
      const key = `${p.name}|${p.latitude.toFixed(6)}|${p.longitude.toFixed(6)}`;
      placeIndex.set(key, p.id);
    }

    // 3. Get existing waypoints to avoid duplicates
    const { data: existingWaypoints } = await supabase
      .from('waypoints')
      .select('id, document_id, raw_name, latitude, longitude');

    const waypointIndex = new Set<string>();
    for (const w of existingWaypoints || []) {
      waypointIndex.add(`${w.document_id}|${w.raw_name}|${w.latitude.toFixed(6)}|${w.longitude.toFixed(6)}`);
    }

    // 4. Get existing user_places
    const { data: existingUserPlaces } = await supabase
      .from('user_places')
      .select('user_id, place_id');

    const userPlaceIndex = new Set<string>();
    for (const up of existingUserPlaces || []) {
      userPlaceIndex.add(`${up.user_id}|${up.place_id}`);
    }

    // 5. Process locations in batches
    const placesToInsert: any[] = [];
    const waypointsToInsert: any[] = [];
    const userPlacesToInsert: any[] = [];
    // Map: location.id → place.id (for user_places)
    const locationToPlace = new Map<string, string>();

    for (const loc of allLocations) {
      const doc = loc.documents;
      const userId = doc?.user_id;

      // Determine place key
      const placeKey = `${loc.name}|${loc.latitude.toFixed(6)}|${loc.longitude.toFixed(6)}`;

      // Create or find place
      let placeId = placeIndex.get(placeKey);
      if (!placeId) {
        placeId = crypto.randomUUID();
        placeIndex.set(placeKey, placeId);
        placesToInsert.push({
          id: placeId,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          altitude: loc.altitude,
          enriched_data: loc.enriched_data,
          place_type: loc.place_type,
          classification: loc.enriched_data?.clasificacion || null,
          continent: loc.continent,
          country: loc.country,
          region: loc.region,
          zone: loc.zone,
          created_by: userId,
        });
        stats.placesCreated++;
      } else {
        stats.placesSkipped++;
      }

      locationToPlace.set(loc.id, placeId);

      // Create waypoint (linking location to its document)
      const wpKey = `${doc.id}|${loc.name}|${loc.latitude.toFixed(6)}|${loc.longitude.toFixed(6)}`;
      if (!waypointIndex.has(wpKey)) {
        waypointIndex.add(wpKey);
        const isApproved = loc.is_approved === true;
        waypointsToInsert.push({
          document_id: doc.id,
          place_id: placeId,
          raw_name: loc.name,
          normalized_name: loc.name.trim().toLowerCase(),
          latitude: loc.latitude,
          longitude: loc.longitude,
          resolution_status: isApproved ? 'resolved' : 'pending',
          resolution_method: isApproved ? 'auto' : null,
          enrichment_status: loc.enrichment_status || 'pending',
        });
        stats.waypointsCreated++;
      } else {
        stats.waypointsSkipped++;
      }

      // Create user_place if user exists
      if (userId) {
        const upKey = `${userId}|${placeId}`;
        if (!userPlaceIndex.has(upKey)) {
          userPlaceIndex.add(upKey);
          const customData = (loc.custom_data as Record<string, string>) || {};
          const isVisited = customData.visited === 'true';
          const rating = customData.user_rating ? parseInt(customData.user_rating) : null;
          const isFavorite = customData.is_favorite === 'true';

          userPlacesToInsert.push({
            user_id: userId,
            place_id: placeId,
            visit_status: isVisited ? 'visited' : 'not_visited',
            is_saved: true,
            is_favorite: isFavorite,
            rating: rating,
            visibility: loc.visibility || 'followers',
            is_archived: false,
            origin: 'import',
            source_document_id: doc.id,
            visited_at: isVisited && customData.visited_verified_at
              ? customData.visited_verified_at
              : null,
          });
          stats.userPlacesCreated++;
        } else {
          stats.userPlacesSkipped++;
        }
      }
    }

    // 6. Batch insert (unless dry run)
    if (!dryRun) {
      // Insert places in chunks
      for (let i = 0; i < placesToInsert.length; i += batchSize) {
        const chunk = placesToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from('places').insert(chunk);
        if (error) {
          stats.errors.push(`Places insert error at ${i}: ${error.message}`);
        }
      }

      // Insert waypoints in chunks
      for (let i = 0; i < waypointsToInsert.length; i += batchSize) {
        const chunk = waypointsToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from('waypoints').insert(chunk);
        if (error) {
          stats.errors.push(`Waypoints insert error at ${i}: ${error.message}`);
        }
      }

      // Insert user_places in chunks
      for (let i = 0; i < userPlacesToInsert.length; i += batchSize) {
        const chunk = userPlacesToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from('user_places').insert(chunk);
        if (error) {
          stats.errors.push(`User_places insert error at ${i}: ${error.message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      totalLocations: allLocations.length,
      stats,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[migrate-v2] Error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
