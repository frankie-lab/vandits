/**
 * Centralized filter for "place photos" — used by both the manual photo dialog
 * and the AI enrichment edge function. Discards results that look like flags,
 * coats of arms, logos, maps, portraits, books, etc., and prefers horizontal
 * landscape framing typical of geographic photographs.
 */

export interface NormalizedImage {
  id: string;
  title: string;
  url: string;
  thumbUrl: string;
  descriptionUrl?: string;
  author?: string;
  license?: string;
  width?: number;
  height?: number;
  source: string; // 'wikimedia_commons' | 'wikipedia' | 'wikimedia_geosearch' | 'wikidata' | 'openverse' | 'osm'
  sourceLabel?: string;
  description?: string;
}

const NEGATIVE_KEYWORDS = [
  'flag', 'bandera',
  'coat of arms', 'escudo',
  'logo', 'icon', 'icono',
  ' map', 'mapa', 'plano ', 'cartograf',
  'diagram', 'chart', 'gr\u00e1fico', 'graphic',
  'portrait', 'retrato',
  'bust ', 'busto',
  'book cover', 'libro', 'album cover', '\u00e1lbum', 'poster', 'cartel',
  'signature', 'firma',
  'document', 'documento', 'manuscript', 'manuscrito',
  'painting of ', 'pintura de ', 'retrato de ',
  'stamp', 'sello postal',
  'banknote', 'billete',
  'page from', 'p\u00e1gina de',
  'wikipedia logo', 'commons-logo',
  'svg',
];

const POSITIVE_GEO_KEYWORDS = [
  'mountain', 'monta\u00f1a', 'mont ', 'pico ', 'peak', 'summit',
  'lake', 'lago', 'laguna',
  'river', 'r\u00edo', 'arroyo', 'stream', 'creek',
  'coast', 'costa', 'beach', 'playa', 'shore', 'orilla',
  'valley', 'valle',
  'forest', 'bosque', 'selva', 'jungle',
  'desert', 'desierto',
  'island', 'isla',
  'cascada', 'falls', 'waterfall', 'cascade',
  'tower', 'torre', 'lighthouse', 'faro',
  'monument', 'monumento', 'memorial',
  'castle', 'castillo', 'fortress', 'fortaleza',
  'church', 'iglesia', 'cathedral', 'catedral', 'temple', 'templo', 'mosque', 'mezquita',
  'building', 'edificio', 'palace', 'palacio',
  'bridge', 'puente',
  'square', 'plaza', 'street view', 'calle',
  'park', 'parque', 'garden', 'jard\u00edn',
  'view of', 'vista de', 'panorama', 'panor\u00e1mica',
  'landscape', 'paisaje',
  'aerial', 'a\u00e9rea',
  'ruins', 'ruinas', 'arch', 'arco', 'gate', 'puerta',
];

function normalize(text: string | undefined): string {
  return (text || '').toLowerCase();
}

export function isPlacePhoto(img: Pick<NormalizedImage, 'title' | 'description' | 'width' | 'height' | 'url'>): boolean {
  const haystack = `${normalize(img.title)} ${normalize(img.description)} ${normalize(img.url)}`;

  // SVG / vector graphics out
  if (haystack.includes('.svg')) return false;

  // Negative keywords
  for (const kw of NEGATIVE_KEYWORDS) {
    if (haystack.includes(kw)) return false;
  }

  // Size minimums (when known)
  if (img.width && img.height) {
    if (img.width < 600 || img.height < 400) return false;

    const ratio = img.width / img.height;
    // Strong vertical: only allow if there's a positive geographic keyword
    if (ratio < 0.9) {
      const hasPositive = POSITIVE_GEO_KEYWORDS.some(k => haystack.includes(k));
      if (!hasPositive) return false;
    }
  }

  return true;
}

export function scorePlacePhoto(img: NormalizedImage): number {
  const haystack = `${normalize(img.title)} ${normalize(img.description)}`;
  let score = 0;

  for (const kw of POSITIVE_GEO_KEYWORDS) {
    if (haystack.includes(kw)) {
      score += 1;
      break;
    }
  }

  if (img.width && img.height) {
    const ratio = img.width / img.height;
    if (ratio >= 1.2) score += 2; // horizontal landscape preferred
    else if (ratio >= 1.0) score += 1;
    if (img.width >= 1200) score += 1;
  }

  // Geo-anchored sources (geosearch, wikidata, osm) are inherently more relevant
  if (img.source === 'wikimedia_geosearch' || img.source === 'wikidata' || img.source === 'osm') {
    score += 2;
  }

  return score;
}

export function filterAndRankPlacePhotos(images: NormalizedImage[]): NormalizedImage[] {
  const filtered = images.filter(isPlacePhoto);
  // dedupe by URL
  const seen = new Set<string>();
  const unique = filtered.filter(img => {
    const key = img.url.split('?')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique
    .map(img => ({ img, score: scorePlacePhoto(img) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.img);
}
