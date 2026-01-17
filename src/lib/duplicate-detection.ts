import { GeoLocation, PlaceType } from '@/types/location';

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
  /** Si es true, es un duplicado exacto que se descarta automáticamente */
  isExactDuplicate: boolean;
  /** Similitud del nombre (0-1) */
  nameSimilarity: number;
}

export interface DeduplicationResult {
  /** Ubicaciones nuevas sin duplicados (se pueden agregar) */
  uniqueLocations: GeoLocation[];
  /** Ubicaciones que requieren evaluación del usuario (posibles duplicados) */
  possibleDuplicates: DuplicateMatch[];
  /** Ubicaciones descartadas automáticamente (coordenadas exactas + nombre similar) */
  autoDiscarded: DuplicateMatch[];
  /** Estadísticas del proceso */
  stats: {
    total: number;
    unique: number;
    possibleDuplicates: number;
    autoDiscarded: number;
  };
}

/**
 * Detecta y filtra ubicaciones duplicadas basándose en proximidad geográfica
 * y similitud de nombre/descripción
 * 
 * @param userThreshold - Umbral de distancia definido por el usuario (metros)
 */
export function deduplicateLocations(
  newLocations: GeoLocation[],
  existingLocations: GeoLocation[],
  userThreshold: number = DEFAULT_DISTANCE_THRESHOLD
): DeduplicationResult {
  const uniqueLocations: GeoLocation[] = [];
  const possibleDuplicates: DuplicateMatch[] = [];
  const autoDiscarded: DuplicateMatch[] = [];
  
  for (const newLoc of newLocations) {
    let bestMatch: DuplicateMatch | null = null;
    
    for (const existingLoc of existingLocations) {
      const distance = calculateDistance(
        newLoc.coordinates.lat,
        newLoc.coordinates.lng,
        existingLoc.coordinates.lat,
        existingLoc.coordinates.lng
      );
      
      // Solo considerar si está dentro del umbral del usuario
      if (distance <= userThreshold) {
        const nameSimilarity = calculateStringSimilarity(newLoc.name, existingLoc.name);
        
        const match: DuplicateMatch = {
          newLocation: newLoc,
          existingLocation: existingLoc,
          distance,
          threshold: userThreshold,
          isExactDuplicate: false,
          nameSimilarity,
        };
        
        // Coordenadas exactas (0m) con nombre similar → descarte automático
        if (distance < 0.5 && nameSimilarity >= NAME_SIMILARITY_THRESHOLD) {
          match.isExactDuplicate = true;
        }
        
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = match;
        }
      }
    }
    
    if (bestMatch) {
      if (bestMatch.isExactDuplicate) {
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
    stats: {
      total: newLocations.length,
      unique: uniqueLocations.length,
      possibleDuplicates: possibleDuplicates.length,
      autoDiscarded: autoDiscarded.length,
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
