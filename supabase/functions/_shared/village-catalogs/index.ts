/**
 * Village catalogs dispatcher.
 *
 * Punto de entrada único llamado por search-candidates.
 *
 * Flujo:
 *  1. Determinar qué adapters aplican (country del POI + adapters globales).
 *  2. Filtrar por los habilitados en `data_sources` (kind='search').
 *  3. Por cada adapter:
 *     a. Si hay filas frescas (<TTL) en `village_catalog_entries`, usarlas.
 *     b. Si no, hacer fetch del listado, extraer slugs, upsert.
 *  4. Aplicar fuzzy match por nombre (trigram en JS) sobre las entries.
 *  5. Para los matches sin coords, hacer geocoding lazy con Nominatim.
 *  6. Devolver hasta 3 candidatos por adapter.
 *
 * Ver mem://logic/enrichment/village-catalogs-fallback
 */

import { ADAPTERS, getAdaptersForCountry } from './registry.ts';
import { getFreshEntries, upsertEntries, updateEntryCoords } from './cache.ts';
import { geocodeName } from './geocode.ts';
import { canonicalize, trigramSimilarity, type VillageEntry, type VillageCatalogAdapter } from './types.ts';

const UA = 'Mozilla/5.0 (compatible; VanditsBot/1.0; +https://vandits.lovable.app)';
const LISTING_TIMEOUT_MS = 10_000;
const DEFAULT_TTL_DAYS = 30;
const MIN_SIMILARITY = 0.45;
const MAX_PER_ADAPTER = 3;

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), LISTING_TIMEOUT_MS);
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8,es;q=0.7' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchAdapterEntries(adapter: VillageCatalogAdapter): Promise<VillageEntry[]> {
  const seen = new Set<string>();
  const entries: VillageEntry[] = [];
  const countryCode = adapter.countryCodes[0] === '*' ? null : adapter.countryCodes[0];
  for (const listingUrl of adapter.listingUrls) {
    const html = await fetchHtml(listingUrl);
    if (!html) continue;
    // Regex puede ser global — reseteamos lastIndex
    adapter.linkPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = adapter.linkPattern.exec(html)) !== null) {
      const built = adapter.buildEntry(m, listingUrl);
      if (!built) continue;
      if (seen.has(built.url)) continue;
      seen.add(built.url);
      entries.push({
        catalog_code: adapter.code,
        name: built.name,
        name_canonical: canonicalize(built.name),
        country_code: countryCode,
        latitude: null,
        longitude: null,
        image_url: null,
        source_url: built.url,
        description: null,
      });
    }
  }
  return entries;
}

async function ensureEntries(adapter: VillageCatalogAdapter): Promise<VillageEntry[]> {
  const ttl = adapter.ttlDays ?? DEFAULT_TTL_DAYS;
  const cached = await getFreshEntries(adapter.code, ttl);
  if (cached && cached.length > 0) {
    console.log('[village-catalogs]', adapter.code, 'cache hit', cached.length);
    return cached;
  }
  const fetched = await fetchAdapterEntries(adapter);
  console.log('[village-catalogs]', adapter.code, 'fetched', fetched.length);
  if (fetched.length === 0) return [];
  await upsertEntries(fetched);
  return fetched;
}

export interface VillageHit {
  name: string;
  lat: number;
  lng: number;
  source: string;          // adapter.code
  sourceName: string;      // adapter.name
  url: string;
  country?: string;
  image?: string | null;
  similarity: number;
}

/**
 * Busca candidatos en los catálogos de pueblos.
 * @param term Nombre del POI a buscar
 * @param countryCode Hint ISO α2 del país del POI (opcional)
 * @param enabledSet Set de códigos habilitados en data_sources (null=todos)
 */
export async function searchVillageCatalogs(
  term: string,
  countryCode: string | null,
  enabledSet: Set<string> | null,
): Promise<VillageHit[]> {
  const candidates = countryCode
    ? getAdaptersForCountry(countryCode)
    : ADAPTERS.filter((a) => a.countryCodes.includes('*'));

  const applicable = candidates.filter((a) => enabledSet === null || enabledSet.has(a.code));
  console.log('[village-catalogs] country=', countryCode, 'applicable=', applicable.map((a) => a.code), 'enabledSetSize=', enabledSet?.size);
  if (applicable.length === 0) return [];

  const termCanon = canonicalize(term);

  // Fan-out por adapter
  const results = await Promise.allSettled(
    applicable.map(async (adapter): Promise<VillageHit[]> => {
      const entries = await ensureEntries(adapter);
      if (entries.length === 0) return [];

      // Score por similitud sobre name_canonical
      const scored = entries
        .map((e) => ({ e, s: trigramSimilarity(termCanon, e.name_canonical) }))
        .filter((x) => x.s >= MIN_SIMILARITY)
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_PER_ADAPTER);

      const hits: VillageHit[] = [];
      for (const { e, s } of scored) {
        let lat = e.latitude;
        let lng = e.longitude;
        if (lat == null || lng == null) {
          const geo = await geocodeName(e.name, e.country_code);
          if (!geo) continue;
          lat = geo.lat;
          lng = geo.lng;
          // Persistir el geocode lazy
          updateEntryCoords(adapter.code, e.source_url, lat, lng).catch(() => {});
        }
        hits.push({
          name: e.name,
          lat,
          lng,
          source: adapter.code,
          sourceName: adapter.name,
          url: e.source_url,
          country: e.country_code ?? undefined,
          image: e.image_url,
          similarity: s,
        });
      }
      return hits;
    }),
  );

  const out: VillageHit[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(...r.value);
  }
  return out;
}
