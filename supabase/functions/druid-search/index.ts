import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DruidConfig {
  id: string;
  name: string;
  search_center_lat: number;
  search_center_lng: number;
  search_radius_km: number;
  overpass_query: string | null;
  search_keywords: string[] | null;
  category_filter: string | null;
  max_results: number;
  refresh_interval_hours: number;
  auto_enrich: boolean;
  // Enrichment settings
  enrichment_include_image?: boolean;
  enrichment_expected_nature?: string;
  enrichment_search_radius_meters?: number;
  enrichment_include_contact?: boolean;
  enrichment_include_web?: boolean;
  enrichment_include_tags?: boolean;
  enrichment_include_interest_index?: boolean;
  enrichment_show_sources?: boolean;
  enrichment_correct_coordinates?: boolean;
  enrichment_tone?: string;
  enrichment_min_length?: number;
  enrichment_custom_prompt?: string;
  enrichment_focus_keywords?: string[];
  enrichment_exclude_keywords?: string[];
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Build Overpass query based on druid configuration
function buildOverpassQuery(druid: DruidConfig): string {
  const { search_center_lat, search_center_lng, search_radius_km, overpass_query, category_filter } = druid;
  const radiusMeters = search_radius_km * 1000;
  
  // If custom query is provided, use it with bounding area
  if (overpass_query && overpass_query.trim()) {
    // Parse simple tag queries like "amenity=monastery" or "[historic=ruins]"
    let tagFilter = overpass_query.trim();
    
    // Normalize format - ensure it's in bracket notation
    if (!tagFilter.startsWith('[')) {
      // Convert "key=value" to "[key=value]"
      tagFilter = `[${tagFilter}]`;
    }
    
    return `
      [out:json][timeout:60];
      (
        node${tagFilter}(around:${radiusMeters},${search_center_lat},${search_center_lng});
        way${tagFilter}(around:${radiusMeters},${search_center_lat},${search_center_lng});
        relation${tagFilter}(around:${radiusMeters},${search_center_lat},${search_center_lng});
      );
      out center body qt ${druid.max_results};
    `;
  }
  
  // Default query based on category filter or general POIs
  let tagFilters: string[] = [];
  
  if (category_filter) {
    const categoryMap: Record<string, string[]> = {
      'historic': ['[historic]', '[heritage]'],
      'natural': ['[natural]', '[geological]'],
      'religious': ['[amenity=place_of_worship]', '[building=church]', '[building=monastery]'],
      'cultural': ['[tourism=museum]', '[amenity=theatre]', '[amenity=arts_centre]'],
      'viewpoint': ['[tourism=viewpoint]', '[natural=peak]'],
      'ruins': ['[historic=ruins]', '[historic=archaeological_site]'],
      'castle': ['[historic=castle]', '[historic=fort]'],
      'monastery': ['[amenity=monastery]', '[building=monastery]'],
    };
    
    tagFilters = categoryMap[category_filter.toLowerCase()] || [`[${category_filter}]`];
  } else {
    // Default: interesting POIs
    tagFilters = [
      '[historic]',
      '[tourism~"attraction|museum|viewpoint"]',
      '[natural~"peak|cave_entrance|waterfall"]',
    ];
  }
  
  const queries = tagFilters.flatMap(tag => [
    `node${tag}(around:${radiusMeters},${search_center_lat},${search_center_lng})`,
    `way${tag}(around:${radiusMeters},${search_center_lat},${search_center_lng})`,
  ]).join(';\n        ');
  
  return `
    [out:json][timeout:60];
    (
      ${queries};
    );
    out center body qt ${druid.max_results};
  `;
}

// Execute Overpass API query
async function executeOverpassQuery(query: string): Promise<OverpassElement[]> {
  console.log('Executing Overpass query...');
  
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Overpass API error:', response.status, errorText);
    throw new Error(`Overpass API error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`Overpass returned ${data.elements?.length || 0} elements`);
  
  return data.elements || [];
}

// Extract name from OSM tags
function extractName(tags: Record<string, string> | undefined): string {
  if (!tags) return 'Sin nombre';
  
  // Priority order for name extraction
  return tags['name:es'] || 
         tags['name'] || 
         tags['alt_name'] || 
         tags['official_name'] ||
         tags['historic'] ||
         tags['natural'] ||
         tags['tourism'] ||
         'Sin nombre';
}

// Get coordinates from element
function getCoordinates(element: OverpassElement): { lat: number; lng: number } | null {
  if (element.lat !== undefined && element.lon !== undefined) {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.center) {
    return { lat: element.center.lat, lng: element.center.lon };
  }
  return null;
}

// Filter by keywords if specified
function matchesKeywords(element: OverpassElement, keywords: string[] | null): boolean {
  if (!keywords || keywords.length === 0) return true;
  
  const tags = element.tags || {};
  const allTagValues = Object.values(tags).join(' ').toLowerCase();
  const name = extractName(tags).toLowerCase();
  const searchText = `${name} ${allTagValues}`;
  
  // At least one keyword must match
  return keywords.some(keyword => 
    searchText.includes(keyword.toLowerCase())
  );
}

// Map OSM category to place type
function getPlaceTypeFromOSM(tags: Record<string, string> | undefined): string {
  if (!tags) return 'other';
  
  if (tags.historic) {
    const historic = tags.historic;
    if (historic === 'castle' || historic === 'fort') return 'castle';
    if (historic === 'ruins' || historic === 'archaeological_site') return 'ruins';
    if (historic === 'monastery') return 'religious';
    if (historic === 'memorial' || historic === 'monument') return 'monument';
    return 'historic';
  }
  
  if (tags.natural) {
    const natural = tags.natural;
    if (natural === 'peak') return 'mountain';
    if (natural === 'cave_entrance') return 'cave';
    if (natural === 'waterfall') return 'waterfall';
    if (natural === 'beach') return 'beach';
    return 'natural';
  }
  
  if (tags.tourism) {
    const tourism = tags.tourism;
    if (tourism === 'viewpoint') return 'viewpoint';
    if (tourism === 'museum') return 'museum';
    return 'attraction';
  }
  
  if (tags.amenity === 'place_of_worship' || tags.building === 'church' || tags.building === 'monastery') {
    return 'religious';
  }
  
  return 'other';
}

// Declare EdgeRuntime for TypeScript
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

// Enrich a single druid location
async function enrichDruidLocation(
  locationId: string,
  location: { name: string; latitude: number; longitude: number; place_type?: string },
  druidConfig: DruidConfig,
  supabaseUrl: string,
  supabaseKey: string
): Promise<boolean> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    console.log(`Enriching druid location: ${location.name}`);
    
    const enrichResponse = await fetch(`${supabaseUrl}/functions/v1/enrich-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        location: {
          name: location.name,
          coordinates: {
            lat: location.latitude,
            lng: location.longitude,
          },
          placeType: location.place_type,
        },
        generateImage: druidConfig.enrichment_include_image ?? true,
        // Use druid enrichment settings
        enrichmentSettings: {
          expectedNature: druidConfig.enrichment_expected_nature,
          searchRadius: druidConfig.enrichment_search_radius_meters,
          includeContact: druidConfig.enrichment_include_contact,
          includeWeb: druidConfig.enrichment_include_web,
          includeTags: druidConfig.enrichment_include_tags,
          includeInterestIndex: druidConfig.enrichment_include_interest_index,
          showSources: druidConfig.enrichment_show_sources,
          correctCoordinates: druidConfig.enrichment_correct_coordinates,
          tone: druidConfig.enrichment_tone,
          minLength: druidConfig.enrichment_min_length,
          customPrompt: druidConfig.enrichment_custom_prompt,
          focusKeywords: druidConfig.enrichment_focus_keywords,
          excludeKeywords: druidConfig.enrichment_exclude_keywords,
        },
      }),
    });
    
    if (!enrichResponse.ok) {
      const errorText = await enrichResponse.text();
      console.error(`Enrich failed for ${location.name}:`, errorText);
      return false;
    }
    
    const enrichData = await enrichResponse.json();
    
    if (enrichData.success && enrichData.data) {
      // Update druid_location with enriched data
      await supabase
        .from('druid_locations')
        .update({
          enriched_data: enrichData.data,
          enrichment_status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', locationId);
      
      console.log(`Successfully enriched: ${location.name}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error enriching ${location.name}:`, error);
    return false;
  }
}

// Background enrichment for druid locations
async function enrichDruidLocationsBackground(
  druidId: string,
  druidConfig: DruidConfig,
  supabaseUrl: string,
  supabaseKey: string
) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log(`Starting background enrichment for druid: ${druidConfig.name}`);
  
  try {
    // Get pending locations for this druid
    const { data: pendingLocations, error } = await supabase
      .from('druid_locations')
      .select('id, name, latitude, longitude, place_type')
      .eq('druid_id', druidId)
      .eq('enrichment_status', 'pending')
      .limit(50); // Process in batches
    
    if (error || !pendingLocations || pendingLocations.length === 0) {
      console.log('No pending locations to enrich');
      return;
    }
    
    console.log(`Found ${pendingLocations.length} locations to enrich`);
    
    let enrichedCount = 0;
    
    for (const loc of pendingLocations) {
      const success = await enrichDruidLocation(
        loc.id,
        loc,
        druidConfig,
        supabaseUrl,
        supabaseKey
      );
      
      if (success) enrichedCount++;
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log(`Enrichment complete: ${enrichedCount}/${pendingLocations.length} successful`);
  } catch (error) {
    console.error('Background enrichment error:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request - can specify a specific druid_id, override center, force_refresh, and auto_enrich_now
    const { 
      druid_id, 
      force_refresh, 
      override_center_lat, 
      override_center_lng,
      auto_enrich_now 
    } = await req.json().catch(() => ({}));

    console.log('Druid search request:', { druid_id, force_refresh });

    // Get druids to process
    let druidsQuery = supabase
      .from('druids')
      .select('*')
      .eq('is_active', true);

    if (druid_id) {
      druidsQuery = druidsQuery.eq('id', druid_id);
    } else if (!force_refresh) {
      // Only get druids that need refresh
      druidsQuery = druidsQuery.or(
        `last_refresh_at.is.null,last_refresh_at.lt.${new Date(Date.now() - 60 * 60 * 1000).toISOString()}`
      );
    }

    const { data: druids, error: druidsError } = await druidsQuery;

    if (druidsError) {
      console.error('Error fetching druids:', druidsError);
      throw druidsError;
    }

    if (!druids || druids.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No druids to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${druids.length} druids`);

    const results: { druidId: string; druidName: string; locationsFound: number; locationsInserted: number; errors: string[] }[] = [];

    for (const druid of druids as DruidConfig[]) {
      console.log(`\n--- Processing druid: ${druid.name} ---`);
      const druidResult = { druidId: druid.id, druidName: druid.name, locationsFound: 0, locationsInserted: 0, errors: [] as string[] };

      try {
        // Use override center if provided, otherwise use druid's configured center
        const searchLat = override_center_lat ?? druid.search_center_lat;
        const searchLng = override_center_lng ?? druid.search_center_lng;
        
        // Check if search center is configured
        if (!searchLat || !searchLng) {
          druidResult.errors.push('Search center not configured');
          results.push(druidResult);
          continue;
        }

        // Create modified druid config with override center
        const effectiveDruid = {
          ...druid,
          search_center_lat: searchLat,
          search_center_lng: searchLng,
        };

        // Build and execute Overpass query
        const query = buildOverpassQuery(effectiveDruid);
        console.log('Overpass query:', query.substring(0, 200) + '...');

        const elements = await executeOverpassQuery(query);
        druidResult.locationsFound = elements.length;

        // Calculate expiration time
        const expiresAt = new Date(Date.now() + druid.refresh_interval_hours * 60 * 60 * 1000);

        // Process each element
        const locationsToUpsert: any[] = [];

        for (const element of elements) {
          // Filter by keywords
          if (!matchesKeywords(element, druid.search_keywords)) {
            continue;
          }

          const coords = getCoordinates(element);
          if (!coords) continue;

          const name = extractName(element.tags);
          if (name === 'Sin nombre') continue; // Skip unnamed elements

          const osmId = `${element.type}/${element.id}`;

          // If auto_enrich_now is true, set status to pending for immediate enrichment
          const enrichmentStatus = (druid.auto_enrich || auto_enrich_now) ? 'pending' : 'skipped';

          locationsToUpsert.push({
            druid_id: druid.id,
            name,
            latitude: coords.lat,
            longitude: coords.lng,
            osm_id: osmId,
            osm_type: element.type,
            osm_data: element.tags || {},
            place_type: getPlaceTypeFromOSM(element.tags),
            expires_at: expiresAt.toISOString(),
            enrichment_status: enrichmentStatus,
          });
        }

        console.log(`Preparing to upsert ${locationsToUpsert.length} locations`);

        if (locationsToUpsert.length > 0) {
          // Upsert in batches of 100
          for (let i = 0; i < locationsToUpsert.length; i += 100) {
            const batch = locationsToUpsert.slice(i, i + 100);
            
            const { error: upsertError } = await supabase
              .from('druid_locations')
              .upsert(batch, { 
                onConflict: 'druid_id,osm_id',
                ignoreDuplicates: false 
              });

            if (upsertError) {
              console.error('Upsert error:', upsertError);
              druidResult.errors.push(`Upsert batch error: ${upsertError.message}`);
            } else {
              druidResult.locationsInserted += batch.length;
            }
          }

          // If auto_enrich_now is true, start background enrichment
          if (auto_enrich_now && druidResult.locationsInserted > 0) {
            console.log(`Starting background enrichment for ${druidResult.locationsInserted} locations`);
            EdgeRuntime.waitUntil(
              enrichDruidLocationsBackground(druid.id, druid, supabaseUrl, supabaseKey)
            );
          }
        }

        // Update druid's last_refresh_at
        await supabase
          .from('druids')
          .update({ last_refresh_at: new Date().toISOString() })
          .eq('id', druid.id);

        console.log(`Druid ${druid.name}: Found ${druidResult.locationsFound}, inserted ${druidResult.locationsInserted}`);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`Error processing druid ${druid.name}:`, errorMessage);
        druidResult.errors.push(errorMessage);
      }

      results.push(druidResult);
    }

    // Clean up expired locations
    const { error: cleanupError } = await supabase
      .from('druid_locations')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }

    const totalInserted = results.reduce((sum, r) => sum + r.locationsInserted, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        totalLocationsFound: results.reduce((sum, r) => sum + r.locationsFound, 0),
        totalLocationsInserted: totalInserted,
        totalErrors,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Druid search error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
