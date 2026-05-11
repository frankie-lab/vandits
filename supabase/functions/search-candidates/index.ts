/**
 * search-candidates — búsqueda multi-fuente de candidatos POI por nombre.
 *
 * Fuentes consultadas en paralelo:
 *   1. Wikipedia ES        (es.wikipedia.org)
 *   2. Wikipedia EN        (en.wikipedia.org)
 *   3. Wikidata            (wbsearchentities + claim P625)
 *   4. Nominatim / OSM     (nominatim.openstreetmap.org)
 *   5. GeoNames            (api.geonames.org, requiere GEONAMES_USERNAME)
 *
 * Devuelve lista unificada de candidatos con name/lat/lng/distance/source/url.
 * Deduplica por proximidad (<150m) y, si se pasa `near`, ordena por distancia.
 *
 * Ver mem://logic/enrichment/per-poi-recovery-block
 */

import { corsHeaders } from '@supabase/supabase-js/cors';

interface Candidate {
  name: string;
  lat: number;
  lng: number;
  distanceKm?: number;
  url?: string;
  source: 'wikipedia-es' | 'wikipedia-en' | 'wikidata' | 'nominatim' | 'geonames';
  locality?: string;
  region?: string;
  country?: string;
}

interface Body {
  term: string;
  near?: { lat: number; lng: number };
  limit?: number;
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

// ---------- Wikipedia (es/en) ----------
async function searchWikipedia(
  lang: 'es' | 'en',
  term: string,
  limit: number,
): Promise<Candidate[]> {
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
  const entities: Array<{ id: string; label?: string; description?: string }> =
    sdata?.search ?? [];
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
  const data = await fetchJson(url, {
    headers: { 'User-Agent': 'vandits-search-candidates/1.0' },
  });
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

// ---------- Dedup ----------
function dedup(candidates: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const sourceRank: Record<Candidate['source'], number> = {
    'wikipedia-es': 1,
    wikidata: 2,
    'wikipedia-en': 3,
    nominatim: 4,
    geonames: 5,
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

    const [wpEs, wpEn, wd, nm, gn] = await Promise.all([
      searchWikipedia('es', term, limit),
      searchWikipedia('en', term, limit),
      searchWikidata(term, limit),
      searchNominatim(term, limit),
      searchGeoNames(term, limit),
    ]);

    let candidates = dedup([...wpEs, ...wd, ...wpEn, ...nm, ...gn]);

    if (body.near) {
      for (const c of candidates) {
        c.distanceKm = Math.round(haversineKm(body.near, { lat: c.lat, lng: c.lng }) * 10) / 10;
      }
      candidates.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    }

    candidates = candidates.slice(0, Math.min(limit * 2, 12));

    return new Response(JSON.stringify({ candidates }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ candidates: [], error: String(err) }), {
      status: 200, // soft-fail: UI just shows empty
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
