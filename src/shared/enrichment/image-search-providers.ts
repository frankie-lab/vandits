/**
 * Free, no-API-key image search providers used by the manual photo dialog.
 * All return NormalizedImage[]. Each provider degrades silently on error.
 */
import type { NormalizedImage } from './image-filters';

const SOURCE_LABELS: Record<string, string> = {
  wikimedia_commons: 'Wikimedia Commons',
  wikipedia: 'Wikipedia',
  wikimedia_geosearch: 'Commons (cercano)',
  wikidata: 'Wikidata',
  openverse: 'Openverse',
  osm: 'OpenStreetMap',
};

export const SOURCE_LABEL = (key: string) => SOURCE_LABELS[key] ?? key;

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------- Wikimedia Commons (search by name) ----------------
export async function searchWikimediaCommons(query: string): Promise<NormalizedImage[]> {
  if (!query.trim()) return [];
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
      `&generator=search&gsrnamespace=6&gsrlimit=20` +
      `&gsrsearch=${encodeURIComponent(query)}` +
      `&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=400`;
    const data = await fetchJson(url);
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    const out: NormalizedImage[] = [];
    for (const page of pages as any[]) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata || {};
      out.push({
        id: `commons:${page.pageid}`,
        title: (page.title || '').replace('File:', ''),
        url: info.url,
        thumbUrl: info.thumburl || info.url,
        descriptionUrl: info.descriptionurl,
        author: stripHtml(meta.Artist?.value) || 'Desconocido',
        license: meta.LicenseShortName?.value || 'CC',
        width: info.width,
        height: info.height,
        source: 'wikimedia_commons',
        sourceLabel: SOURCE_LABEL('wikimedia_commons'),
        description: stripHtml(meta.ImageDescription?.value),
      });
    }
    return out;
  } catch (e) {
    console.warn('[image-search] commons error', e);
    return [];
  }
}

// ---------------- Wikimedia Commons GeoSearch (radius around coords) ----------------
export async function searchWikimediaGeoSearch(
  coordinates: { lat: number; lng: number },
  radius = 2000,
): Promise<NormalizedImage[]> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
      `&generator=geosearch&ggsnamespace=6&ggslimit=20` +
      `&ggscoord=${coordinates.lat}|${coordinates.lng}&ggsradius=${radius}` +
      `&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=400`;
    const data = await fetchJson(url);
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    const out: NormalizedImage[] = [];
    for (const page of pages as any[]) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata || {};
      out.push({
        id: `geo:${page.pageid}`,
        title: (page.title || '').replace('File:', ''),
        url: info.url,
        thumbUrl: info.thumburl || info.url,
        descriptionUrl: info.descriptionurl,
        author: stripHtml(meta.Artist?.value) || 'Desconocido',
        license: meta.LicenseShortName?.value || 'CC',
        width: info.width,
        height: info.height,
        source: 'wikimedia_geosearch',
        sourceLabel: SOURCE_LABEL('wikimedia_geosearch'),
        description: stripHtml(meta.ImageDescription?.value),
      });
    }
    return out;
  } catch (e) {
    console.warn('[image-search] geosearch error', e);
    return [];
  }
}

// ---------------- Wikipedia main page image ----------------
export async function searchWikipediaPageImage(query: string): Promise<NormalizedImage[]> {
  if (!query.trim()) return [];
  const langs = ['es', 'en'];
  for (const lang of langs) {
    try {
      const url =
        `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
        `&prop=pageimages|info&piprop=thumbnail|original&pithumbsize=800` +
        `&titles=${encodeURIComponent(query)}&inprop=url`;
      const data = await fetchJson(url);
      const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
      const out: NormalizedImage[] = [];
      for (const page of pages as any[]) {
        const thumb = page.original || page.thumbnail;
        if (!thumb?.source) continue;
        out.push({
          id: `wp:${lang}:${page.pageid}`,
          title: page.title,
          url: thumb.source,
          thumbUrl: page.thumbnail?.source || thumb.source,
          descriptionUrl: page.fullurl,
          author: 'Wikipedia',
          license: 'CC BY-SA',
          width: thumb.width,
          height: thumb.height,
          source: 'wikipedia',
          sourceLabel: SOURCE_LABEL('wikipedia'),
        });
      }
      if (out.length) return out;
    } catch (e) {
      console.warn('[image-search] wikipedia error', e);
    }
  }
  return [];
}

// ---------------- Wikidata (entity around coords with image P18) ----------------
export async function searchWikidataNearby(
  coordinates: { lat: number; lng: number },
  radiusKm = 1,
): Promise<NormalizedImage[]> {
  try {
    const sparql = `
      SELECT ?item ?itemLabel ?image WHERE {
        SERVICE wikibase:around {
          ?item wdt:P625 ?loc .
          bd:serviceParam wikibase:center "Point(${coordinates.lng} ${coordinates.lat})"^^geo:wktLiteral .
          bd:serviceParam wikibase:radius "${radiusKm}" .
        }
        ?item wdt:P18 ?image .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
      } LIMIT 10`;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
    const data = await fetchJson(url, { headers: { Accept: 'application/sparql-results+json' } }, 6000);
    const bindings = data?.results?.bindings ?? [];
    const out: NormalizedImage[] = [];
    for (const b of bindings) {
      const imageUrl = b.image?.value;
      if (!imageUrl) continue;
      const filename = decodeURIComponent(imageUrl.split('/').pop() || '');
      const directUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1200`;
      const thumbUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=400`;
      out.push({
        id: `wd:${b.item?.value}`,
        title: b.itemLabel?.value || filename,
        url: directUrl,
        thumbUrl,
        descriptionUrl: b.item?.value,
        author: 'Wikidata',
        license: 'CC',
        source: 'wikidata',
        sourceLabel: SOURCE_LABEL('wikidata'),
      });
    }
    return out;
  } catch (e) {
    console.warn('[image-search] wikidata error', e);
    return [];
  }
}

// ---------------- Openverse (CC images) ----------------
export async function searchOpenverse(query: string): Promise<NormalizedImage[]> {
  if (!query.trim()) return [];
  try {
    const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(query)}&page_size=20&license_type=all-cc`;
    const data = await fetchJson(url, undefined, 7000);
    const results: any[] = data?.results ?? [];
    return results.map(r => ({
      id: `ov:${r.id}`,
      title: r.title || 'Sin título',
      url: r.url,
      thumbUrl: r.thumbnail || r.url,
      descriptionUrl: r.foreign_landing_url,
      author: r.creator || 'Desconocido',
      license: r.license ? `${r.license} ${r.license_version || ''}`.trim() : 'CC',
      width: r.width,
      height: r.height,
      source: 'openverse',
      sourceLabel: SOURCE_LABEL('openverse'),
      description: r.tags?.map((t: any) => t.name).join(' '),
    }));
  } catch (e) {
    console.warn('[image-search] openverse error', e);
    return [];
  }
}

// ---------------- OpenStreetMap (Overpass) image= tag ----------------
export async function searchOsmImageTag(
  coordinates: { lat: number; lng: number },
  radius = 500,
): Promise<NormalizedImage[]> {
  try {
    const q = `[out:json][timeout:10];nwr(around:${radius},${coordinates.lat},${coordinates.lng})[image];out tags 15;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: q,
      headers: { 'Content-Type': 'text/plain' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const elements: any[] = data?.elements ?? [];
    return elements
      .map((el, i) => {
        const tags = el.tags || {};
        const url: string | undefined = tags.image;
        if (!url || !/^https?:\/\//i.test(url)) return null;
        return {
          id: `osm:${el.type}:${el.id}:${i}`,
          title: tags.name || tags['name:es'] || tags['name:en'] || 'POI OSM',
          url,
          thumbUrl: url,
          descriptionUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
          author: tags.operator || 'OSM contributors',
          license: 'ODbL',
          source: 'osm',
          sourceLabel: SOURCE_LABEL('osm'),
          description: Object.values(tags).filter((v: any) => typeof v === 'string').join(' '),
        } as NormalizedImage;
      })
      .filter(Boolean) as NormalizedImage[];
  } catch (e) {
    console.warn('[image-search] osm error', e);
    return [];
  }
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

// ---------------- Orchestrator ----------------
export async function searchAllSources(
  query: string,
  coordinates: { lat: number; lng: number } | undefined,
  activeSources: string[],
): Promise<NormalizedImage[]> {
  const tasks: Promise<NormalizedImage[]>[] = [];
  if (activeSources.includes('wikimedia_commons')) tasks.push(searchWikimediaCommons(query));
  if (activeSources.includes('wikipedia')) tasks.push(searchWikipediaPageImage(query));
  if (coordinates) {
    if (activeSources.includes('wikimedia_geosearch')) tasks.push(searchWikimediaGeoSearch(coordinates));
    if (activeSources.includes('wikidata')) tasks.push(searchWikidataNearby(coordinates));
    if (activeSources.includes('osm')) tasks.push(searchOsmImageTag(coordinates));
  }
  if (activeSources.includes('openverse')) tasks.push(searchOpenverse(query));

  const results = await Promise.allSettled(tasks);
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}
