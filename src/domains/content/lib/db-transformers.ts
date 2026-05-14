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
      .order('id', { ascending: true })
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

  // [TEMP DEBUG] tracker IDs — quitar tras diagnosticar
  // Alpha (Explorador Alpha)
  const ALPHA_IDS = [
    '0f99a8d9-61b5-4376-a463-9aecd9ab7fe5',
    '2e002681-bac2-4c8c-a555-114f69b0da98',
    '7801ba70-d410-4ecc-9617-ceb8f29a7c1a',
    '951370e0-134e-4c2b-b5ae-4f3c9fd0fd83',
    'adf6945d-6f42-475a-a005-7c518904bd95',
    'c6c2c58d-601e-4fab-9005-dabc8e466a60',
    'd397b327-2b0b-4d58-9829-204865e773de',
    'fd4ef112-ca9f-47e8-937f-ad9e73dee00d',
  ];
  // Beta (Aventurera Beta)
  const BETA_IDS = [
    '1555901f-dd34-4096-a515-ea34c703edfb',
    '22222222-2222-2222-2222-222222222201',
    '22222222-2222-2222-2222-222222222202',
    '2990233a-715b-4eb7-83b3-207fa368a89c',
    '2bb2d2e6-b40f-4499-af05-bd8523edc054',
    '2ddd752a-23da-4dcb-a07c-06935140781c',
    '435a2dcf-4609-40ec-92ca-b5caeeaf914c',
    'a2b185ee-ce9d-4b27-86b9-c7b77b7c2c8b',
    'ef42e9d1-8424-45f0-a9b3-7148966bed11',
    'f441d89a-bc07-42c5-a9b5-750e32051162',
  ];
  const ALPHA_SET = new Set(ALPHA_IDS);
  const BETA_SET = new Set(BETA_IDS);
  const alphaHits = new Set<string>();
  const betaHits = new Set<string>();

  const total = withCount ? await fetchExactCount() : null;
  if (onPage) onPage(0, total);

  let lastFrom = 0;
  let lastTo = 0;
  let capReached = false;

  while (hasMore && allLocations.length < MAX_LOCATIONS && page < MAX_PAGES) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    lastFrom = from;
    lastTo = to;

    const data = await fetchPageWithRetry(from, to);
    const returned = data?.length ?? 0;
    // [TEMP DEBUG] paginator log
    console.log(`[paginator] page=${page} from=${from} to=${to} returned=${returned}`);
    if (data) {
      for (const r of data) {
        if (!r?.id) continue;
        if (ALPHA_SET.has(r.id)) alphaHits.add(r.id);
        if (BETA_SET.has(r.id)) betaHits.add(r.id);
      }
    }

    if (returned === 0) {
      // Verdadero fin del dataset (con security_invoker, páginas parciales son legítimas).
      hasMore = false;
    } else {
      allLocations.push(...(data as any[]));
      page++;
      if (onPage) onPage(allLocations.length, total);
    }
  }

  if (page >= MAX_PAGES || allLocations.length >= MAX_LOCATIONS) {
    capReached = true;
    console.warn('[paginator] CAP reached', {
      pages: page,
      total: allLocations.length,
      lastFrom,
      lastTo,
      MAX_PAGES,
      MAX_LOCATIONS,
    });
  }

  // [TEMP DEBUG] resumen tracker
  console.log('[paginator] DONE', {
    total: allLocations.length,
    pages: page,
    capReached,
    alphaHits: `${alphaHits.size}/${ALPHA_IDS.length}`,
    alphaMissing: ALPHA_IDS.filter((id) => !alphaHits.has(id)),
    betaHits: `${betaHits.size}/${BETA_IDS.length}`,
    betaMissing: BETA_IDS.filter((id) => !betaHits.has(id)),
  });

  return allLocations;
}
