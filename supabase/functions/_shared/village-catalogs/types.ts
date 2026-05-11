/**
 * Village catalog adapters — shared types.
 * Cada catálogo de "Pueblos más bonitos" implementa esta interfaz.
 * Ver mem://logic/enrichment/village-catalogs-fallback
 */

export interface VillageEntry {
  catalog_code: string;
  name: string;
  name_canonical: string;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  source_url: string;
  description: string | null;
  raw?: Record<string, unknown>;
}

export interface VillageCatalogAdapter {
  /** code matching data_sources.code, e.g. 'search.village.es' */
  code: string;
  /** Human-readable name */
  name: string;
  /** ISO α2 country codes this catalog covers ('*' for global) */
  countryCodes: string[];
  /** Listing pages to fetch (paginated or sectioned URLs) */
  listingUrls: string[];
  /** Regex used to extract entry hrefs from the listing HTML */
  linkPattern: RegExp;
  /** Map a captured slug/path to absolute URL + display name */
  buildEntry(match: RegExpExecArray, listingUrl: string): { url: string; name: string } | null;
  /** Cache TTL in days (default 30) */
  ttlDays?: number;
}

/** Normaliza un nombre: minúsculas, sin acentos, sin puntuación */
export function canonicalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"`’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similitud trigram simple [0..1] (sin pg_trgm) */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const padded = `  ${s}  `;
    const out = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}
