// Domain: Content — DB ↔ GeoLocation transformers and paginated fetch
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation, EnrichedLocationData } from '@/types/location';

const PAGE_SIZE = 1000;
const MAX_LOCATIONS = 50000;
const MAX_PAGES = 50;

export function dbLocationToGeoLocation(loc: any): GeoLocation {
  const baseCustomData = (loc.custom_data as Record<string, string>) || {};
  const mergedCustomData: Record<string, string> = {
    ...baseCustomData,
    ...(loc.user_image_url ? { user_image_url: String(loc.user_image_url) } : {}),
    ...(loc.user_image_visibility ? { user_image_visibility: String(loc.user_image_visibility) } : {}),
  };

  return {
    id: loc.id,
    name: (loc.name ?? '').trim(),
    description: loc.description || undefined,
    coordinates: {
      lat: loc.latitude,
      lng: loc.longitude,
      altitude: loc.altitude || undefined,
    },
    continent: loc.continent_resolved || loc.continent || undefined,
    country: loc.country_resolved || loc.country || undefined,
    region: loc.region_resolved || loc.region || undefined,
    zone: loc.zone_resolved || loc.zone || undefined,
    comarca: loc.admin_level_3 || undefined,
    localidad: loc.locality || undefined,
    sublocalidad: loc.sublocality || undefined,
    placeType: (loc.place_type as GeoLocation['placeType']) || undefined,
    customData: Object.keys(mergedCustomData).length ? mergedCustomData : undefined,
    enrichedData: (loc.enriched_data as unknown as EnrichedLocationData) || undefined,
    enrichmentStatus: loc.enrichment_status || undefined,
    geoHealth: (loc.geo_health as GeoLocation['geoHealth']) || undefined,
    visibility: (loc.visibility as GeoLocation['visibility']) || 'followers',
    documentId: loc.document_id || undefined,
    ownerUserId: loc.owner_user_id ?? null,
    isApproved: loc.is_approved ?? false,
    createdAt: new Date(loc.created_at),
    updatedAt: new Date(loc.updated_at),
  };
}

async function fetchPageWithRetry(from: number, to: number): Promise<any[] | null> {
  const MAX_ATTEMPTS = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from('v_locations_resolved' as any)
      .select('*')
      .is('deleted_at', null)
      .range(from, to);

    if (!error) return (data as any[]) ?? [];

    lastError = error;
    // Retry only on statement_timeout (57014). Other errors fail fast.
    if ((error as any).code !== '57014') throw error;

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  throw lastError;
}

export interface FetchAllLocationsOpts {
  /** Called after each page fetch with the cumulative count and known total (if any). */
  onPage?: (loadedSoFar: number, total: number | null) => void;
  /** When true, performs a HEAD count query up-front so progress is determinate. */
  withCount?: boolean;
}

async function fetchExactCount(): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('v_locations_resolved' as any)
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (error) return null;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

export async function fetchAllLocationsPaginated(
  opts: FetchAllLocationsOpts = {},
): Promise<any[]> {
  const { onPage, withCount } = opts;
  const allLocations: any[] = [];
  let page = 0;
  let hasMore = true;

  // [TEMP DEBUG] tracker IDs (Alpha doc) — quitar tras diagnosticar
  const TRACK_IDS = new Set<string>([
    '0f99a8d9-61b5-4376-a463-9aecd9ab7fe5',
    '2e002681-bac2-4c8c-a555-114f69b0da98',
    '7801ba70-d410-4ecc-9617-ceb8f29a7c1a',
    '951370e0-134e-4c2b-b5ae-4f3c9fd0fd83',
    'adf6945d-6f42-475a-a005-7c518904bd95',
    'c6c2c58d-601e-4fab-9005-dabc8e466a60',
    'd397b327-2b0b-4d58-9829-204865e773de',
    'fd4ef112-ca9f-47e8-937f-ad9e73dee00d',
  ]);
  const trackHits: Array<{ page: number; id: string }> = [];

  const total = withCount ? await fetchExactCount() : null;
  if (onPage) onPage(0, total);

  while (hasMore && allLocations.length < MAX_LOCATIONS) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const data = await fetchPageWithRetry(from, to);
    const returned = data?.length ?? 0;
    // [TEMP DEBUG] paginator log
    console.log(`[paginator] page=${page} from=${from} to=${to} returned=${returned}`);
    if (data) {
      for (const r of data) {
        if (r?.id && TRACK_IDS.has(r.id)) trackHits.push({ page, id: r.id });
      }
    }

    if (data && data.length > 0) {
      allLocations.push(...data);
      hasMore = data.length === PAGE_SIZE;
      page++;
      if (onPage) onPage(allLocations.length, total);
    } else {
      hasMore = false;
    }
  }

  // [TEMP DEBUG] resumen tracker Alpha
  console.log('[paginator] DONE total=', allLocations.length, 'tracker hits=', trackHits.length, trackHits);

  return allLocations;
}
