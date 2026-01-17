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
 * Umbral de distancia único: 5 metros para todos los tipos de lugar
 */
export const DISTANCE_THRESHOLD = 5; // metros

/**
 * Umbrales de distancia (en metros) según el tipo de lugar - DEPRECADO
 * Se mantiene por compatibilidad pero ya no se usa
 */
export const DISTANCE_THRESHOLDS: Record<string, number> = {
  default: 5,
};

/**
 * Categorías que se consideran "localidades/accidentes geográficos" - DEPRECADO
 */
export const GEOGRAPHIC_CATEGORIES = [
  'Naturaleza',
  'Paisaje',
  'Geografía',
];

/**
 * Categorías que se consideran "establecimientos/locales" - DEPRECADO
 */
export const ESTABLISHMENT_CATEGORIES = [
  'Gastronomía',
  'Alojamiento',
  'Comercio',
];

/**
 * Obtiene el umbral de distancia para un lugar dado
 * Ahora siempre devuelve 5 metros
 */
export function getDistanceThreshold(location: GeoLocation): number {
  return DISTANCE_THRESHOLD;
}

export interface DuplicateMatch {
  newLocation: GeoLocation;
  existingLocation: GeoLocation;
  distance: number;
  threshold: number;
}

export interface DeduplicationResult {
  /** Ubicaciones nuevas sin duplicados (se pueden agregar) */
  uniqueLocations: GeoLocation[];
  /** Ubicaciones que ya existen (duplicados detectados) */
  duplicates: DuplicateMatch[];
  /** Estadísticas del proceso */
  stats: {
    total: number;
    unique: number;
    duplicates: number;
  };
}

/**
 * Detecta y filtra ubicaciones duplicadas basándose en proximidad geográfica
 * Mantiene las ubicaciones existentes (especialmente las enriquecidas)
 */
export function deduplicateLocations(
  newLocations: GeoLocation[],
  existingLocations: GeoLocation[]
): DeduplicationResult {
  const uniqueLocations: GeoLocation[] = [];
  const duplicates: DuplicateMatch[] = [];
  
  for (const newLoc of newLocations) {
    let isDuplicate = false;
    let bestMatch: DuplicateMatch | null = null;
    
    for (const existingLoc of existingLocations) {
      const distance = calculateDistance(
        newLoc.coordinates.lat,
        newLoc.coordinates.lng,
        existingLoc.coordinates.lat,
        existingLoc.coordinates.lng
      );
      
      // Usar el umbral del punto existente (que puede tener más datos)
      const threshold = getDistanceThreshold(existingLoc);
      
      if (distance <= threshold) {
        // Si el existente está enriquecido, siempre es duplicado
        // Si no está enriquecido, usar el más cercano
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = {
            newLocation: newLoc,
            existingLocation: existingLoc,
            distance,
            threshold,
          };
        }
        isDuplicate = true;
      }
    }
    
    if (isDuplicate && bestMatch) {
      duplicates.push(bestMatch);
    } else {
      uniqueLocations.push(newLoc);
    }
  }
  
  return {
    uniqueLocations,
    duplicates,
    stats: {
      total: newLocations.length,
      unique: uniqueLocations.length,
      duplicates: duplicates.length,
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
