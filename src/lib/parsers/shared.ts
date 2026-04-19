// Shared helpers for all geo file parsers (KML/GPX/GeoJSON/CSV)
// Owns the unified ParsedGeoContent contract + a single mapper to KMLDocument.
import { GeoLocation, KMLDocument, ImportedRoute } from '@/types/location';

// ============================================================================
// Unified contract — every parser MUST populate this to its full capacity
// ============================================================================
export interface ParsedPoint {
  id: string;
  name: string;
  description?: string;
  coordinates: { lat: number; lng: number; altitude?: number };
  timestamp?: Date;
  continent?: string;
  country?: string;
  region?: string;
  zone?: string;
  customData?: Record<string, string>;
}

export interface ParsedRoute {
  id: string;
  name: string;
  coordinates: [number, number][]; // [lat, lng]
  color?: string;
  date?: Date;
  customData?: Record<string, string>;
}

export interface ParsedGeoContent {
  documentName: string;
  fileName: string;
  documentDate?: Date;
  points: ParsedPoint[];
  routes: ParsedRoute[];
  documentCustomData?: Record<string, string>;
}

// ============================================================================
// Geographic helpers
// ============================================================================
export function getContinent(lat: number, lng: number): string {
  if (lat > 35 && lat < 71 && lng > -25 && lng < 65) return 'Europa';
  if (lat > -35 && lat < 37 && lng > -20 && lng < 55) return 'África';
  if (lat > 5 && lat < 83 && lng > -170 && lng < -50) return 'América del Norte';
  if (lat > -60 && lat < 15 && lng > -85 && lng < -30) return 'América del Sur';
  if (lat > -50 && lat < 75 && lng > 25 && lng < 180) return 'Asia';
  if (lat > -50 && lng > 110 && lng < 180) return 'Oceanía';
  if (lat < -60) return 'Antártida';
  return 'Desconocido';
}

// ============================================================================
// Text + HTML helpers
// ============================================================================
export function cleanText(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  let cleaned = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = cleaned;
    cleaned = textarea.value;
  } else {
    // Minimal entity decoding for non-DOM environments (tests in node)
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
  cleaned = cleaned
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim();
  return cleaned || undefined;
}

// ============================================================================
// Date helpers
// ============================================================================
export function parseFlexibleDate(dateStr: unknown): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // ISO 8601
  let parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed;

  // DD/MM/YYYY or DD-MM-YYYY
  const euMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // MM/DD/YYYY (US) — only if disambiguous
  const usMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    if (parseInt(month) <= 12 && parseInt(day) > 12) {
      parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

const DATE_FIELD_KEYS = [
  'date', 'Date', 'fecha', 'Fecha',
  'created', 'Created', 'createdAt', 'created_at',
  'timestamp', 'Timestamp', 'time', 'Time',
  'datetime', 'DateTime', 'dateTime',
  'visitDate', 'visit_date', 'fechaVisita', 'fecha_visita',
  'addedOn', 'added_on', 'agregado', 'when',
];

export function pickTimestampFromCustomData(
  customData: Record<string, string>
): Date | null {
  for (const key of DATE_FIELD_KEYS) {
    const value = customData[key];
    if (value) {
      const parsed = parseFlexibleDate(value);
      if (parsed) return parsed;
    }
  }
  return null;
}

// ============================================================================
// Geographic-metadata extraction from arbitrary properties
// ============================================================================
const COUNTRY_KEYS = ['country', 'Country', 'pais', 'País', 'país'];
const REGION_KEYS = ['region', 'Region', 'región', 'Región'];
const ZONE_KEYS = ['zone', 'Zone', 'zona', 'Zona'];

function pickFirst(obj: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) if (obj[k]) return obj[k];
  return undefined;
}

export interface ExtractedGeoMeta {
  country?: string;
  region?: string;
  zone?: string;
}

export function extractGeoMeta(customData: Record<string, string>): ExtractedGeoMeta {
  return {
    country: pickFirst(customData, COUNTRY_KEYS),
    region: pickFirst(customData, REGION_KEYS),
    zone: pickFirst(customData, ZONE_KEYS),
  };
}

const GEO_META_KEYS_TO_STRIP = [...COUNTRY_KEYS, ...REGION_KEYS, ...ZONE_KEYS, ...DATE_FIELD_KEYS];

export function stripGeoMetaAndDateKeys(customData: Record<string, string>): Record<string, string> {
  const cleaned = { ...customData };
  for (const k of GEO_META_KEYS_TO_STRIP) delete cleaned[k];
  return cleaned;
}

// ============================================================================
// Color normalization — accepts: numeric rgb, "#rrggbb", "rrggbb",
// KML "aabbggrr" (8-hex with alpha-first, BGR), "#rrggbbaa".
// Output: "#rrggbb"
// ============================================================================
export function normalizeColor(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;

  // Numeric rgb (e.g. GeoJSON `rgb: 16711680`)
  if (typeof input === 'number' && Number.isFinite(input)) {
    return '#' + (input & 0xffffff).toString(16).padStart(6, '0');
  }

  if (typeof input !== 'string') return undefined;
  const raw = input.trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(raw)) return undefined;

  if (raw.length === 6) return '#' + raw;
  if (raw.length === 3) return '#' + raw.split('').map((c) => c + c).join('');
  if (raw.length === 8) {
    // KML: aabbggrr → rrggbb. For hex8 that came as #rrggbbaa we'd swap to rrggbb.
    // We can't reliably distinguish; KML is the dominant 8-hex producer in our pipeline.
    const aa = raw.slice(0, 2);
    const bb = raw.slice(2, 4);
    const gg = raw.slice(4, 6);
    const rr = raw.slice(6, 8);
    // Heuristic: if input looked like "#rrggbbaa" (came with leading '#') treat as RGBA
    // Otherwise treat as KML AABBGGRR.
    if (typeof input === 'string' && input.trim().startsWith('#')) {
      return '#' + aa + bb + gg; // RGBA → drop A
    }
    return '#' + rr + gg + bb;
  }
  return undefined;
}

// ============================================================================
// Mapper: ParsedGeoContent → KMLDocument (single source of truth)
// ============================================================================
export function toKMLDocument(parsed: ParsedGeoContent): KMLDocument {
  const now = new Date();

  const locations: GeoLocation[] = parsed.points.map((p) => {
    const customData = { ...(p.customData || {}) };
    if (p.timestamp) {
      // preserve raw timestamp inside customData too so nothing is ever lost
      customData.timestamp = p.timestamp.toISOString();
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      coordinates: p.coordinates,
      continent: p.continent ?? getContinent(p.coordinates.lat, p.coordinates.lng),
      country: p.country,
      region: p.region,
      zone: p.zone,
      customData: Object.keys(customData).length > 0 ? customData : undefined,
      createdAt: p.timestamp || now,
      updatedAt: now,
    };
  });

  const routes: ImportedRoute[] | undefined = parsed.routes.length
    ? parsed.routes.map((r) => ({
        id: r.id,
        name: r.name,
        coordinates: r.coordinates,
        color: r.color,
        date: r.date,
      }))
    : undefined;

  return {
    id: crypto.randomUUID(),
    name: parsed.documentName,
    fileName: parsed.fileName,
    locations,
    routes,
    uploadedAt: now,
  };
}
