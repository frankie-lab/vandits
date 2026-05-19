/**
 * search-candidates — búsqueda multi-fuente de candidatos POI por nombre.
 *
 * Fuentes consultadas en paralelo (toggles vía tabla `data_sources`):
 *   - search.wikipedia_es / search.wikipedia_en
 *   - search.wikidata
 *   - search.nominatim
 *   - search.geonames        (requiere GEONAMES_USERNAME)
 *   - search.photon          (sin key, gratis)
 *   - search.google_places   (requiere GOOGLE_PLACES_API_KEY)
 *   - search.village.*       (16 catálogos "Pueblos más bonitos", fallback)
 *
 * Ver mem://logic/enrichment/recovery-search-multisource
 * Ver mem://logic/enrichment/village-catalogs-fallback
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { getEnabledSourceCodes } from '../_shared/data-sources.ts';
import { searchVillageCatalogs } from '../_shared/village-catalogs/index.ts';

type SourceCode =
  | 'wikipedia-es'
  | 'wikipedia-en'
  | 'wikidata'
  | 'nominatim'
  | 'geonames'
  | 'photon'
  | 'google-places'
  | 'village-catalog';

interface Candidate {
  name: string;
  lat: number;
  lng: number;
  distanceKm?: number;
  url?: string;
  source: SourceCode;
  locality?: string;
  region?: string;
  country?: string;
  /**
   * Identidad externa estructurada cuando la fuente la expone.
   * Hoy sólo poblado por `google-places` (Places API New) → `places.id`.
   * Otras fuentes lo dejan undefined.
   * Consumido por <UnenrichedRecoveryBlock> para persistir
   * `external_refs.maps.google.placeId` al adoptar el candidato.
   */
  placeId?: string;
  provider?: 'google';
}

interface Body {
  term: string;
  near?: { lat: number; lng: number };
  limit?: number;
  countryCode?: string; // ISO α2 — hint para village catalogs
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------- Wikipedia ----------
async function searchWikipedia(lang: 'es' | 'en', term: string, limit: number): Promise<Candidate[]> {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  const searchUrl =
    `${api}?action=query&list=search&srsearch=${encodeURIComponent(term)}` +
    `&srlimit=${limit}&format=json&origin=*`;
  const data = await fetchJson(searchUrl);
  const items: Array<{ pageid: number; title: string }> = data?.query?.search ?? [];
  if (items.length === 0) return [];
  const pageIds = items.map((i) => i.pageid);
  const titlesById = new Map(items.map((i) => [i.pageid, i.title]));

  const coordsUrl =
    `${api}?action=query&prop=coordinates|info&inprop=url&pageids=${pageIds.join('|')}` +
    `&format=json&origin=*`;
  const cdata = await fetchJson(coordsUrl);
  const pages = cdata?.query?.pages ?? {};
  const out: Candidate[] = [];
  for (const id of pageIds) {
    const page = pages[String(id)];
    if (!page) continue;
    const coord = Array.isArray(page.coordinates) ? page.coordinates[0] : null;
    if (!coord || typeof coord.lat !== 'number' || typeof coord.lon !== 'number') continue;
    out.push({
      name: page.title || titlesById.get(id) || '',
      lat: coord.lat,
      lng: coord.lon,
      url: typeof page.fullurl === 'string' ? page.fullurl : undefined,
      source: lang === 'es' ? 'wikipedia-es' : 'wikipedia-en',
    });
  }
  return out;
}

// ---------- Wikidata ----------
async function searchWikidata(term: string, limit: number): Promise<Candidate[]> {
  const searchUrl =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}` +
    `&language=es&limit=${limit}&format=json&origin=*`;
  const sdata = await fetchJson(searchUrl);
  const entities: Array<{ id: string; label?: string }> = sdata?.search ?? [];
  if (entities.length === 0) return [];
  const ids = entities.map((e) => e.id);
  const entityUrl =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}` +
    `&props=claims|labels|sitelinks/urls&languages=es|en&format=json&origin=*`;
  const edata = await fetchJson(entityUrl);
  const ents = edata?.entities ?? {};
  const out: Candidate[] = [];
  for (const id of ids) {
    const ent = ents[id];
    if (!ent) continue;
    const coordClaim = ent.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (!coordClaim || typeof coordClaim.latitude !== 'number') continue;
    const label =
      ent.labels?.es?.value || ent.labels?.en?.value || entities.find((e) => e.id === id)?.label;
    if (!label) continue;
    const url =
      ent.sitelinks?.eswiki?.url ||
      ent.sitelinks?.enwiki?.url ||
      `https://www.wikidata.org/wiki/${id}`;
    out.push({
      name: label,
      lat: coordClaim.latitude,
      lng: coordClaim.longitude,
      url,
      source: 'wikidata',
    });
  }
  return out;
}

// ---------- Nominatim ----------
async function searchNominatim(term: string, limit: number): Promise<Candidate[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(term)}` +
    `&limit=${limit}&addressdetails=1&accept-language=es`;
  const data = await fetchJson(url, { headers: { 'User-Agent': 'vandits-search-candidates/1.0' } });
  if (!Array.isArray(data)) return [];
  return data
    .filter((d: any) => d.lat && d.lon)
    .map((d: any) => ({
      name: d.display_name?.split(',')[0]?.trim() || d.name || term,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      locality: d.address?.city || d.address?.town || d.address?.village,
      region: d.address?.state || d.address?.region,
      country: d.address?.country,
      url: `https://www.openstreetmap.org/${d.osm_type}/${d.osm_id}`,
      source: 'nominatim' as const,
    }));
}

// ---------- GeoNames ----------
async function searchGeoNames(term: string, limit: number): Promise<Candidate[]> {
  const username = Deno.env.get('GEONAMES_USERNAME');
  if (!username) return [];
  const url =
    `http://api.geonames.org/searchJSON?q=${encodeURIComponent(term)}` +
    `&maxRows=${limit}&style=MEDIUM&username=${username}`;
  const data = await fetchJson(url);
  const items: any[] = data?.geonames ?? [];
  return items
    .filter((i) => i.lat && i.lng)
    .map((i) => ({
      name: i.name || i.toponymName || term,
      lat: parseFloat(i.lat),
      lng: parseFloat(i.lng),
      locality: i.adminName2 || undefined,
      region: i.adminName1 || undefined,
      country: i.countryName || undefined,
      url: `https://www.geonames.org/${i.geonameId}`,
      source: 'geonames' as const,
    }));
}

// ---------- Photon (Komoot / OSM-based, gratis) ----------
async function searchPhoton(
  term: string,
  limit: number,
  near?: { lat: number; lng: number },
): Promise<Candidate[]> {
  const base = `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=${limit}&lang=es`;
  const url = near ? `${base}&lat=${near.lat}&lon=${near.lng}` : base;
  const data = await fetchJson(url);
  const features: any[] = data?.features ?? [];
  return features
    .filter((f) => Array.isArray(f?.geometry?.coordinates))
    .map((f) => {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const p = f.properties ?? {};
      return {
        name: p.name || p.street || term,
        lat,
        lng,
        locality: p.city || p.town || p.village,
        region: p.state,
        country: p.country,
        url:
          p.osm_type && p.osm_id
            ? `https://www.openstreetmap.org/${String(p.osm_type).toLowerCase()}/${p.osm_id}`
            : undefined,
        source: 'photon' as const,
      };
    });
}

// ---------- Google Places (Text Search v1) ----------
async function searchGooglePlaces(
  term: string,
  limit: number,
  near?: { lat: number; lng: number },
): Promise<Candidate[]> {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return [];
  try {
    const body: any = { textQuery: term, pageSize: Math.min(limit, 20), languageCode: 'es' };
    if (near) {
      body.locationBias = {
        circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 },
      };
    }
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.displayName,places.location,places.formattedAddress,places.id,places.websiteUri',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const places: any[] = data?.places ?? [];
    return places
      .filter((p) => p?.location?.latitude && p?.location?.longitude)
      .map((p) => ({
        name: p.displayName?.text || term,
        lat: p.location.latitude,
        lng: p.location.longitude,
        country: p.formattedAddress,
        url: p.websiteUri || `https://www.google.com/maps/place/?q=place_id:${p.id}`,
        source: 'google-places' as const,
      }));
  } catch {
    return [];
  }
}

// ---------- Dedup ----------
function dedup(candidates: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const sourceRank: Record<SourceCode, number> = {
    'google-places': 0,
    'wikipedia-es': 1,
    wikidata: 2,
    'wikipedia-en': 3,
    photon: 4,
    nominatim: 5,
    geonames: 6,
    'village-catalog': 7, // último: solo si nadie más lo trajo
  };
  for (const c of candidates) {
    const dupIdx = out.findIndex(
      (x) => haversineKm({ lat: x.lat, lng: x.lng }, { lat: c.lat, lng: c.lng }) < 0.15,
    );
    if (dupIdx === -1) {
      out.push(c);
    } else if (sourceRank[c.source] < sourceRank[out[dupIdx].source]) {
      out[dupIdx] = c;
    }
  }
  return out;
}

// ---------- Enabled sources ----------
const CODE_MAP: Record<string, SourceCode> = {
  'search.wikipedia_es': 'wikipedia-es',
  'search.wikipedia_en': 'wikipedia-en',
  'search.wikidata': 'wikidata',
  'search.nominatim': 'nominatim',
  'search.geonames': 'geonames',
  'search.photon': 'photon',
  'search.google_places': 'google-places',
};

async function getEnabledSearchSources(): Promise<Set<SourceCode>> {
  // Default: todas ON salvo google_places (gated by key)
  const fallback = new Set<SourceCode>([
    'wikipedia-es', 'wikipedia-en', 'wikidata', 'nominatim', 'geonames', 'photon', 'google-places',
  ]);
  const codes = await getEnabledSourceCodes('search');
  if (codes === null) return fallback;
  const enabled = new Set<SourceCode>();
  for (const code of codes) {
    if (CODE_MAP[code]) enabled.add(CODE_MAP[code]);
  }
  return enabled;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const term = (body?.term ?? '').trim();
    const limit = Math.min(Math.max(body?.limit ?? 6, 1), 10);
    if (!term) {
      return new Response(JSON.stringify({ candidates: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const enabled = await getEnabledSearchSources();
    // Para village-catalogs necesitamos el Set crudo de codes habilitados.
    const allEnabledCodes = await getEnabledSourceCodes('search');

    const tasks: Array<Promise<Candidate[]>> = [];
    if (enabled.has('wikipedia-es')) tasks.push(searchWikipedia('es', term, limit));
    if (enabled.has('wikipedia-en')) tasks.push(searchWikipedia('en', term, limit));
    if (enabled.has('wikidata')) tasks.push(searchWikidata(term, limit));
    if (enabled.has('nominatim')) tasks.push(searchNominatim(term, limit));
    if (enabled.has('geonames')) tasks.push(searchGeoNames(term, limit));
    if (enabled.has('photon')) tasks.push(searchPhoton(term, limit, body.near));
    if (enabled.has('google-places')) tasks.push(searchGooglePlaces(term, limit, body.near));

    // Village catalogs (fallback) — gating individual por adapter
    tasks.push(
      (async (): Promise<Candidate[]> => {
        try {
          const hits = await searchVillageCatalogs(
            term,
            body.countryCode ?? null,
            allEnabledCodes, // null = todos habilitados
          );
          return hits.map((h) => ({
            name: h.name,
            lat: h.lat,
            lng: h.lng,
            url: h.url,
            country: h.country,
            source: 'village-catalog' as const,
            locality: h.sourceName,
          }));
        } catch (e) {
          console.warn('[search-candidates] village-catalogs failed:', e);
          return [];
        }
      })(),
    );

    const results = await Promise.all(tasks);
    let candidates = dedup(results.flat());

    if (body.near) {
      for (const c of candidates) {
        c.distanceKm = Math.round(haversineKm(body.near, { lat: c.lat, lng: c.lng }) * 10) / 10;
      }
      candidates.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    }

    candidates = candidates.slice(0, Math.min(limit * 2, 12));

    return new Response(JSON.stringify({ candidates, enabledSources: Array.from(enabled) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ candidates: [], error: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
  }
});
