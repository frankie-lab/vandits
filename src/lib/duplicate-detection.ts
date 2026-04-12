import { GeoLocation, PlaceType } from '@/types/location';

/**
 * Genera un hash de coordenadas con precisión configurable.
 * Precisión 5 = ~1.1m, 4 = ~11m, 3 = ~110m
 */
export function coordinateHash(lat: number, lng: number, precision: number = 5): string {
 return `${lat.toFixed(precision)}_${lng.toFixed(precision)}`;
}

/**
 * Construye un índice espacial: hash → lista de ubicaciones en esa celda.
 * Se usa como acelerador para el análisis de proximidad, NO como barrera.
 */
export function buildSpatialIndex(
 locations: GeoLocation[],
 precision: number = 4, // ~11m cells
): Map<string, GeoLocation[]> {
 const index = new Map<string, GeoLocation[]>();
 for (const loc of locations) {
  const hash = coordinateHash(loc.coordinates.lat, loc.coordinates.lng, precision);
  const bucket = index.get(hash);
  if (bucket) bucket.push(loc);
  else index.set(hash, [loc]);
 }
 return index;
}

/**
 * Calcula la distancia entre dos puntos geográficos usando la fórmula de Haversine
 * @returns Distancia en metros
 */
export function calculateDistance(
 lat1: number,
 lng1: number,
 lat2: number,
 lng2: number
): number {
 const R = 6371000; // Radio de la Tierra en metros
 const dLat = toRadians(lat2 - lat1);
 const dLng = toRadians(lng2 - lng1);
 
 const a = 
 Math.sin(dLat / 2) * Math.sin(dLat / 2) +
 Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
 Math.sin(dLng / 2) * Math.sin(dLng / 2);
 
 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
 
 return R * c;
}

function toRadians(degrees: number): number {
 return degrees * (Math.PI / 180);
}

/**
 * Umbral por defecto: 250 metros (configurable por usuario en perfil)
 */
export const DEFAULT_DISTANCE_THRESHOLD = 250; // metros

/**
 * Calcula la similitud entre dos strings (Levenshtein normalizado)
 * @returns Valor entre 0 (completamente diferentes) y 1 (idénticos)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
 const s1 = (str1 || '').toLowerCase().trim();
 const s2 = (str2 || '').toLowerCase().trim();
 
 if (s1 === s2) return 1;
 if (!s1 || !s2) return 0;
 
 const longer = s1.length > s2.length ? s1 : s2;
 const shorter = s1.length > s2.length ? s2 : s1;
 
 if (longer.length === 0) return 1;
 
 const distance = levenshteinDistance(longer, shorter);
 return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
 const m = str1.length;
 const n = str2.length;
 const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
 
 for (let i = 0; i <= m; i++) dp[i][0] = i;
 for (let j = 0; j <= n; j++) dp[0][j] = j;
 
 for (let i = 1; i <= m; i++) {
 for (let j = 1; j <= n; j++) {
 if (str1[i - 1] === str2[j - 1]) {
 dp[i][j] = dp[i - 1][j - 1];
 } else {
 dp[i][j] = Math.min(
 dp[i - 1][j] + 1,
 dp[i][j - 1] + 1,
 dp[i - 1][j - 1] + 1
 );
 }
 }
 }
 
 return dp[m][n];
}

/**
 * Umbral de similitud para considerar que nombres/descripciones coinciden
 */
const NAME_SIMILARITY_THRESHOLD = 0.6; // 60% similitud

export interface DuplicateMatch {
 newLocation: GeoLocation;
 existingLocation: GeoLocation;
 distance: number;
 threshold: number;
 /** Similitud del nombre (0-1) */
 nameSimilarity: number;
 /** Similitud de la descripción (0-1) */
 descriptionSimilarity: number;
}

export interface DeduplicationResult {
 /** Ubicaciones nuevas sin duplicados (se pueden agregar) */
 uniqueLocations: GeoLocation[];
 /** Ubicaciones que requieren evaluación del usuario (posibles duplicados) */
 possibleDuplicates: DuplicateMatch[];
 /** Ubicaciones descartadas automáticamente (coordenadas exactas + nombre/descripción coinciden) */
 autoDiscarded: DuplicateMatch[];
 /** Puntos que ya existían en una importación previa del mismo archivo */
 skippedFromPriorImport: GeoLocation[];
 /** Estadísticas del proceso */
 stats: {
 total: number;
 unique: number;
 possibleDuplicates: number;
 autoDiscarded: number;
 skippedFromPriorImport: number;
 };
}

/**
 * Detecta y filtra ubicaciones duplicadas basándose en:
 * 1. Reimportación: si existingLocations contienen puntos del mismo archivo original,
 *    los puntos que ya existen (mismas coords+nombre) se saltan; los nuevos pasan.
 * 2. Índice espacial: pre-filtra candidatos cercanos en celdas de ~11m para
 *    acelerar el análisis sin descartar nada automáticamente.
 * 3. Proximidad + similitud: análisis detallado con Haversine + Levenshtein.
 *
 * @param userThreshold - Umbral de distancia definido por el usuario (metros)
 * @param importFilename - Nombre del archivo que se importa (para detectar reimportación)
 */
export function deduplicateLocations(
 newLocations: GeoLocation[],
 existingLocations: GeoLocation[],
 userThreshold: number = DEFAULT_DISTANCE_THRESHOLD,
 importFilename?: string,
): DeduplicationResult {
 const uniqueLocations: GeoLocation[] = [];
 const possibleDuplicates: DuplicateMatch[] = [];
 const autoDiscarded: DuplicateMatch[] = [];
 const skippedFromPriorImport: GeoLocation[] = [];

 // Build spatial index for fast neighbor lookup (~11m cells)
 const spatialIndex = buildSpatialIndex(existingLocations, 4);

 // Build a quick-lookup set for prior-import detection:
 // "coordHash|name" of existing locations to check reimported points
 const existingFingerprints = new Set<string>();
 if (importFilename) {
  for (const loc of existingLocations) {
   const fp = `${coordinateHash(loc.coordinates.lat, loc.coordinates.lng, 5)}|${(loc.name || '').toLowerCase().trim()}`;
   existingFingerprints.add(fp);
  }
 }

 for (const newLoc of newLocations) {
  // Barrera 1: Reimportación — si el punto ya existe con mismas coordenadas + nombre exacto, saltarlo
  if (importFilename && existingFingerprints.size > 0) {
   const fp = `${coordinateHash(newLoc.coordinates.lat, newLoc.coordinates.lng, 5)}|${(newLoc.name || '').toLowerCase().trim()}`;
   if (existingFingerprints.has(fp)) {
    skippedFromPriorImport.push(newLoc);
    continue;
   }
  }

  // Barrera 2: Análisis detallado por proximidad
  // Use spatial index to get nearby candidates (check current cell + 8 neighbors)
  const candidates = getCandidatesFromSpatialIndex(spatialIndex, newLoc.coordinates.lat, newLoc.coordinates.lng, 4);

  let bestMatch: DuplicateMatch | null = null;
  let shouldAutoDiscard = false;

  // First pass: check spatially indexed candidates (fast path)
  for (const existingLoc of candidates) {
   const distance = calculateDistance(
    newLoc.coordinates.lat,
    newLoc.coordinates.lng,
    existingLoc.coordinates.lat,
    existingLoc.coordinates.lng
   );

   if (distance <= userThreshold) {
    const nameSimilarity = calculateStringSimilarity(newLoc.name, existingLoc.name);
    const descriptionSimilarity = calculateStringSimilarity(
     newLoc.description || '',
     existingLoc.description || ''
    );

    const match: DuplicateMatch = {
     newLocation: newLoc,
     existingLocation: existingLoc,
     distance,
     threshold: userThreshold,
     nameSimilarity,
     descriptionSimilarity,
    };

    if (distance < 0.5) {
     if (nameSimilarity >= NAME_SIMILARITY_THRESHOLD ||
      (descriptionSimilarity >= NAME_SIMILARITY_THRESHOLD && existingLoc.description)) {
      shouldAutoDiscard = true;
      bestMatch = match;
      break;
     }
    }

    if (!bestMatch || distance < bestMatch.distance) {
     bestMatch = match;
    }
   }
  }

  // If spatial index didn't find anything and threshold is large (>100m),
  // fall back to full scan for this point
  if (!bestMatch && !shouldAutoDiscard && userThreshold > 100) {
   const degThreshold = userThreshold / 111_000;
   for (const existingLoc of existingLocations) {
    if (
     Math.abs(newLoc.coordinates.lat - existingLoc.coordinates.lat) > degThreshold ||
     Math.abs(newLoc.coordinates.lng - existingLoc.coordinates.lng) > degThreshold
    ) continue;

    const distance = calculateDistance(
     newLoc.coordinates.lat,
     newLoc.coordinates.lng,
     existingLoc.coordinates.lat,
     existingLoc.coordinates.lng
    );

    if (distance <= userThreshold) {
     const nameSimilarity = calculateStringSimilarity(newLoc.name, existingLoc.name);
     const descriptionSimilarity = calculateStringSimilarity(
      newLoc.description || '',
      existingLoc.description || ''
     );

     const match: DuplicateMatch = {
      newLocation: newLoc,
      existingLocation: existingLoc,
      distance,
      threshold: userThreshold,
      nameSimilarity,
      descriptionSimilarity,
     };

     if (distance < 0.5 && (
      nameSimilarity >= NAME_SIMILARITY_THRESHOLD ||
      (descriptionSimilarity >= NAME_SIMILARITY_THRESHOLD && existingLoc.description)
     )) {
      shouldAutoDiscard = true;
      bestMatch = match;
      break;
     }

     if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = match;
     }
    }
   }
  }

  if (bestMatch) {
   if (shouldAutoDiscard) {
    autoDiscarded.push(bestMatch);
   } else {
    possibleDuplicates.push(bestMatch);
   }
  } else {
   uniqueLocations.push(newLoc);
  }
 }

 return {
  uniqueLocations,
  possibleDuplicates,
  autoDiscarded,
  skippedFromPriorImport,
  stats: {
   total: newLocations.length,
   unique: uniqueLocations.length,
   possibleDuplicates: possibleDuplicates.length,
   autoDiscarded: autoDiscarded.length,
   skippedFromPriorImport: skippedFromPriorImport.length,
  },
 };
}

/**
 * Obtiene candidatos del índice espacial: celda actual + 8 vecinas
 */
function getCandidatesFromSpatialIndex(
 index: Map<string, GeoLocation[]>,
 lat: number,
 lng: number,
 precision: number,
): GeoLocation[] {
 const step = Math.pow(10, -precision); // e.g. 0.0001 for precision 4
 const candidates: GeoLocation[] = [];
 for (let dLat = -1; dLat <= 1; dLat++) {
  for (let dLng = -1; dLng <= 1; dLng++) {
   const hash = coordinateHash(lat + dLat * step, lng + dLng * step, precision);
   const bucket = index.get(hash);
   if (bucket) candidates.push(...bucket);
  }
 }
 return candidates;
}

/**
 * Formatea la distancia para mostrar al usuario
 */
export function formatDistance(meters: number): string {
 if (meters < 1) {
 return `${Math.round(meters * 100)} cm`;
 }
 if (meters < 1000) {
 return `${Math.round(meters)} m`;
 }
 return `${(meters / 1000).toFixed(2)} km`;
}
