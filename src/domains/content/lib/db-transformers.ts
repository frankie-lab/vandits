// Domain: Content — DB ↔ GeoLocation transformers and paginated fetch
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, EnrichedLocationData } from '@/types/location';

const PAGE_SIZE = 1000;
const MAX_LOCATIONS = 50000;

export function dbLocationToGeoLocation(loc: any): GeoLocation {
  const baseCustomData = (loc.custom_data as Record<string, string>) || {};
  const mergedCustomData: Record<string, string> = {
    ...baseCustomData,
    ...(loc.user_image_url ? { user_image_url: String(loc.user_image_url) } : {}),
    ...(loc.user_image_visibility ? { user_image_visibility: String(loc.user_image_visibility) } : {}),
  };

  return {
    id: loc.id,
    name: loc.name,
    description: loc.description || undefined,
    coordinates: {
      lat: loc.latitude,
      lng: loc.longitude,
      altitude: loc.altitude || undefined,
    },
    continent: loc.continent || undefined,
    country: loc.country || undefined,
    region: loc.region || undefined,
    zone: loc.zone || undefined,
    placeType: (loc.place_type as GeoLocation['placeType']) || undefined,
    customData: Object.keys(mergedCustomData).length ? mergedCustomData : undefined,
    enrichedData: (loc.enriched_data as unknown as EnrichedLocationData) || undefined,
    enrichmentStatus: loc.enrichment_status || undefined,
    visibility: (loc.visibility as GeoLocation['visibility']) || 'followers',
    documentId: loc.document_id || undefined,
    createdAt: new Date(loc.created_at),
    updatedAt: new Date(loc.updated_at),
  };
}

export async function fetchAllLocationsPaginated(): Promise<any[]> {
  const allLocations: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore && allLocations.length < MAX_LOCATIONS) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .is('deleted_at', null)
      .range(from, to)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      allLocations.push(...data);
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allLocations;
}
