import { GeoLocation, PlaceType } from '@/types/location';

/**
 * Genera un hash de coordenadas con precisión configurable.
 * Precisión 5 = ~1.1m, 4 = ~11m, 3 = ~110m
 */
export function coordinateHash(lat: number, lng: number, precision: number = 5): string {
 return `${lat.toFixed(precision)}_${lng.toFixed(precision)}`;
}

/**
 * Construye un Set de hashes de coordenadas existentes para búsqueda O(1).
 */
export function buildCoordinateIndex(locations: GeoLocation[], precision: number = 5): Set<string> {
 const index = new Set<string>();
 for (const loc of locations) {
  index.add(coordinateHash(loc.coordinates.lat, loc.coordinates.lng, precision));
 }
 return index;
}

/**
 * Construye un Set de document IDs existentes para bloqueo de reimportación.
 */
export function buildDocumentIndex(locations: GeoLocation[]): Set<string> {
 const index = new Set<string>();
 for (const loc of locations) {
  if (loc.documentId) index.add(loc.documentId);
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
 /** Ubicaciones bloqueadas por pertenecer a un documento ya importado */
 blockedByDocument: GeoLocation[];
 /** Ubicaciones bloqueadas por hash de coordenadas idéntico */
 blockedByHash: GeoLocation[];
 /** Estadísticas del proceso */
 stats: {
 total: number;
 unique: number;
 possibleDuplicates: number;
 autoDiscarded: number;
 blockedByDocument: number;
 blockedByHash: number;
 };
}

/**
 * Detecta y filtra ubicaciones duplicadas basándose en:
 * 1. Bloqueo por documento: si el nuevo punto pertenece a un documento ya importado → bloqueado
 * 2. Hash de coordenadas: si ya existe un punto con coordenadas idénticas (5 decimales ~1.1m) → bloqueado
 * 3. Proximidad + similitud: análisis detallado con Haversine + Levenshtein
 * 
 * @param userThreshold - Umbral de distancia definido por el usuario (metros)
 * @param importDocumentId - ID del documento que se está importando (para bloqueo)
 */
export function deduplicateLocations(
 newLocations: GeoLocation[],
 existingLocations: GeoLocation[],
 userThreshold: number = DEFAULT_DISTANCE_THRESHOLD,
 importDocumentId?: string,
): DeduplicationResult {
 const uniqueLocations: GeoLocation[] = [];
 const possibleDuplicates: DuplicateMatch[] = [];
 const autoDiscarded: DuplicateMatch[] = [];
 const blockedByDocument: GeoLocation[] = [];
 const blockedByHash: GeoLocation[] = [];
 
 // Pre-build indexes for O(1) lookups
 const existingDocIds = buildDocumentIndex(existingLocations);
 const existingCoordHashes = buildCoordinateIndex(existingLocations);

 // Barrera 1: Si el documento ya fue importado, bloquear todo
 if (importDocumentId && existingDocIds.has(importDocumentId)) {
  return {
   uniqueLocations: [],
   possibleDuplicates: [],
   autoDiscarded: [],
   blockedByDocument: newLocations,
   blockedByHash: [],
   stats: {
    total: newLocations.length,
    unique: 0,
    possibleDuplicates: 0,
    autoDiscarded: 0,
    blockedByDocument: newLocations.length,
    blockedByHash: 0,
   },
  };
 }

 for (const newLoc of newLocations) {
  // Barrera 2: Hash de coordenadas — si ya existe un punto en la misma posición exacta
  const hash = coordinateHash(newLoc.coordinates.lat, newLoc.coordinates.lng);
  if (existingCoordHashes.has(hash)) {
   // Verificar si nombre también coincide para auto-bloquear silenciosamente
   const matchingExisting = existingLocations.find(e => 
    coordinateHash(e.coordinates.lat, e.coordinates.lng) === hash
   );
   if (matchingExisting) {
    const nameSim = calculateStringSimilarity(newLoc.name, matchingExisting.name);
    if (nameSim >= NAME_SIMILARITY_THRESHOLD) {
     blockedByHash.push(newLoc);
     continue;
    }
   }
  }

  // Barrera 3: Análisis detallado por proximidad
  let bestMatch: DuplicateMatch | null = null;
  let shouldAutoDiscard = false;
  
  for (const existingLoc of existingLocations) {
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
  blockedByDocument,
  blockedByHash,
  stats: {
   total: newLocations.length,
   unique: uniqueLocations.length,
   possibleDuplicates: possibleDuplicates.length,
   autoDiscarded: autoDiscarded.length,
   blockedByDocument: blockedByDocument.length,
   blockedByHash: blockedByHash.length,
  },
 };
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
