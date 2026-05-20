/**
 * poi-maturity.ts — Cálculo determinista del nivel de madurez POI-0…POI-10.
 *
 * Contrato visual: `docs/contracts/poi-maturity-visual-contract.md`.
 * Reglas canónicas (ladder estrictamente monotónico; no se pueden saltar
 * niveles):
 *
 *   POI-0  sin dato útil (ni nombre validado ni coordenadas presentes)
 *   POI-1  solo coordenadas (lat+lng presentes, sin nombre validado)
 *   POI-2  solo nombre (nombre validado, sin coordenadas válidas)
 *   POI-3  nombre + coordenadas WGS84 válidas (`isValidWgs84Coord`)
 *   POI-4  identidad confirmada (raw_geocode poblado)
 *   POI-5  país o continente resuelto
 *   POI-6  región o zona/provincia resuelta
 *   POI-7  descripción enriquecida (`enriched_data.descripcion` no vacío
 *          y no es placeholder evasivo del LLM)
 *   POI-8  media validada (imagen IA o foto propia)
 *   POI-9  categoría o tags validados
 *   POI-10 curado completo (`geoHealth === 'ok'`,
 *          `enrichment_status === 'enriched'`, observación personal
 *          presente)
 *
 * Reglas DURAS:
 *   - Coordenadas inválidas (Null Island, fuera de rango, NaN, null) no
 *     pueden producir nivel > POI-2.
 *   - Sin `raw_geocode` no se puede pasar de POI-3.
 *   - Sin geografía resuelta (país/región) no se puede llegar a POI-7+.
 *   - Estado personal NUNCA degrada el nivel objetivo: este helper sólo
 *     SUBE en función de señales presentes; ausencia de datos NO degrada
 *     niveles ya alcanzados aguas abajo (es imposible por construcción
 *     monotónica).
 *
 * No toca renderer del mapa, no toca datos, no re-enriquece. Es función
 * pura: mismas entradas → mismas salidas, sin efectos secundarios.
 *
 * Ver también:
 *   - `getPoiCurationLevel` (`./poi-curation-level.ts`) — eje de 6 niveles
 *     {0,1,3,5,9,10} que sigue siendo SoT del renderer del marker hasta
 *     que la escala POI-N se integre formalmente. POI-maturity es una
 *     señal nueva, complementaria, NO sustituye `levelKey` PR-MAP-CANON-3.
 */

import { isValidWgs84Coord } from '@/shared/geography/coord-validity';
import { isUnverifiableDescription } from './llm-unverifiable';

export type PoiMaturityLevel =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Forma flexible de entrada: acepta tanto camelCase del dominio
 * (`GeoLocation`) como snake_case que llega de Supabase/edge sin
 * transformar. Cualquier campo no presente se trata como ausente.
 */
export interface PoiMaturityInput {
  // identidad
  name?: string | null;
  title?: string | null;

  // coordenadas
  latitude?: number | null;
  longitude?: number | null;
  coordinates?: { lat?: number | null; lng?: number | null } | null;

  // geocoding
  raw_geocode?: unknown;
  rawGeocode?: unknown;
  geo_health?: string | null;
  geoHealth?: string | null;
  enrichment_status?: string | null;
  enrichmentStatus?: string | null;

  // geografía resuelta
  country?: string | null;
  continent?: string | null;
  region?: string | null;
  zone?: string | null;

  // descripción / enrichment
  description?: string | null;
  enriched_data?: PoiEnrichedShape | null;
  enrichedData?: PoiEnrichedShape | null;

  // media
  photos?: unknown[] | null;
  images?: unknown[] | null;
  media?: unknown[] | null;

  // taxonomía
  category?: string | null;
  placeType?: string | null;
  tags?: string[] | null;
}

interface PoiEnrichedShape {
  descripcion?: string | null;
  imagen?: string | null;
  imagen_fuente?: string | null;
  categoria?: string | null;
  clasificacion?: unknown;
  etiquetas?: string[] | null;
  observacion?: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Predicados internos (puros)
// ────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_RX = /^\(sin\s+/i;

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function notPlaceholder(v: string): boolean {
  return !PLACEHOLDER_RX.test(v.trim());
}

function hasValidatedName(loc: PoiMaturityInput): boolean {
  const raw = (loc.name ?? loc.title ?? '');
  if (!nonEmptyString(raw)) return false;
  const lower = raw.trim().toLowerCase();
  if (lower === 'sin nombre' || lower === 'unnamed') return false;
  return true;
}

function getCoords(loc: PoiMaturityInput): { lat?: number; lng?: number } {
  const lat = loc.latitude ?? loc.coordinates?.lat ?? undefined;
  const lng = loc.longitude ?? loc.coordinates?.lng ?? undefined;
  return {
    lat: typeof lat === 'number' ? lat : undefined,
    lng: typeof lng === 'number' ? lng : undefined,
  };
}

function hasCoordsPresent(loc: PoiMaturityInput): boolean {
  const { lat, lng } = getCoords(loc);
  return typeof lat === 'number' && typeof lng === 'number';
}

function hasValidCoords(loc: PoiMaturityInput): boolean {
  const { lat, lng } = getCoords(loc);
  return isValidWgs84Coord(lat, lng);
}

function hasRawGeocode(loc: PoiMaturityInput): boolean {
  const raw = loc.rawGeocode ?? loc.raw_geocode;
  if (raw == null) return false;
  if (typeof raw === 'string') return raw.trim().length > 0;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'object') return Object.keys(raw as object).length > 0;
  return Boolean(raw);
}

function hasCountryOrContinent(loc: PoiMaturityInput): boolean {
  return (
    (nonEmptyString(loc.country) && notPlaceholder(loc.country)) ||
    (nonEmptyString(loc.continent) && notPlaceholder(loc.continent))
  );
}

function hasRegionOrZone(loc: PoiMaturityInput): boolean {
  return (
    (nonEmptyString(loc.region) && notPlaceholder(loc.region)) ||
    (nonEmptyString(loc.zone) && notPlaceholder(loc.zone))
  );
}

function pickEnriched(loc: PoiMaturityInput): PoiEnrichedShape | null {
  return loc.enrichedData ?? loc.enriched_data ?? null;
}

function hasEnrichedDescription(loc: PoiMaturityInput): boolean {
  const ed = pickEnriched(loc);
  const desc = ed?.descripcion;
  if (!nonEmptyString(desc)) return false;
  if (isUnverifiableDescription(desc.trim())) return false;
  return true;
}

function arrayHasEntries(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

function hasValidatedMedia(loc: PoiMaturityInput): boolean {
  const ed = pickEnriched(loc);
  if (nonEmptyString(ed?.imagen)) return true;
  if (arrayHasEntries(loc.photos)) return true;
  if (arrayHasEntries(loc.images)) return true;
  if (arrayHasEntries(loc.media)) return true;
  return false;
}

function hasCategoryOrTags(loc: PoiMaturityInput): boolean {
  if (nonEmptyString(loc.category)) return true;
  if (nonEmptyString(loc.placeType)) return true;
  const ed = pickEnriched(loc);
  if (nonEmptyString(ed?.categoria)) return true;
  if (ed?.clasificacion && typeof ed.clasificacion === 'object') return true;
  if (arrayHasEntries(ed?.etiquetas)) return true;
  if (arrayHasEntries(loc.tags)) return true;
  return false;
}

function isFullyCurated(loc: PoiMaturityInput): boolean {
  const geo = loc.geoHealth ?? loc.geo_health;
  if (geo !== 'ok') return false;
  const status = loc.enrichmentStatus ?? loc.enrichment_status;
  if (status !== 'enriched') return false;
  const ed = pickEnriched(loc);
  if (!nonEmptyString(ed?.observacion)) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el nivel de madurez POI-0…POI-10 del POI dado.
 *
 * Ladder monotónico: se sale en el primer gate que falla. Por construcción
 * no se pueden saltar niveles — siempre se garantiza que todos los gates
 * anteriores se cumplen para alcanzar el nivel N.
 */
export function computePoiMaturity(loc: PoiMaturityInput | null | undefined): PoiMaturityLevel {
  if (!loc) return 0;

  const hasName = hasValidatedName(loc);
  const hasCoords = hasCoordsPresent(loc);
  const validCoords = hasValidCoords(loc);

  // POI-0: ni nombre validado ni coordenadas presentes.
  if (!hasName && !hasCoords) return 0;

  // POI-1: solo coordenadas (con o sin validez), sin nombre.
  if (!hasName && hasCoords) return 1;

  // hasName === true a partir de aquí.

  // POI-2: nombre validado, pero coordenadas inválidas o ausentes.
  // Coords inválidas NUNCA pueden pasar de POI-2.
  if (!validCoords) return 2;

  // POI-3: nombre + coordenadas WGS84 válidas.
  if (!hasRawGeocode(loc)) return 3;

  // POI-4: identidad confirmada (raw_geocode poblado).
  if (!hasCountryOrContinent(loc)) return 4;

  // POI-5: país / continente resuelto.
  if (!hasRegionOrZone(loc)) return 5;

  // POI-6: región / zona resuelta.
  if (!hasEnrichedDescription(loc)) return 6;

  // POI-7: descripción IA verificable.
  if (!hasValidatedMedia(loc)) return 7;

  // POI-8: media validada.
  if (!hasCategoryOrTags(loc)) return 8;

  // POI-9: categoría / tags validados.
  if (!isFullyCurated(loc)) return 9;

  // POI-10: curado completo.
  return 10;
}
