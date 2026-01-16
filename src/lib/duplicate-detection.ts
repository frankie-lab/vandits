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
 * Umbrales de distancia (en metros) según el tipo de lugar
 */
export const DISTANCE_THRESHOLDS: Record<string, number> = {
  // Localidades y accidentes geográficos: 250 metros
  city: 250,
  geographic_feature: 250,
  viewpoint: 250,
  beach: 250,
  mountain: 250,
  park: 250,
  natural_reserve: 250,
  
  // Establecimientos y locales: 10 metros
  monument: 10,
  museum: 10,
  restaurant: 10,
  hotel: 10,
  historical_site: 10,
  religious_site: 10,
  
  // Por defecto (sin tipo definido): 100 metros (intermedio)
  other: 100,
  default: 100,
};

/**
 * Categorías que se consideran "localidades/accidentes geográficos"
 */
export const GEOGRAPHIC_CATEGORIES = [
  'Naturaleza',
  'Paisaje',
  'Geografía',
  'Montaña',
  'Costa',
  'Playa',
  'Parque',
  'Reserva',
];

/**
 * Categorías que se consideran "establecimientos/locales"
 */
export const ESTABLISHMENT_CATEGORIES = [
  'Gastronomía',
  'Alojamiento',
  'Comercio',
  'Museo',
  'Monumento',
  'Edificio',
  'Patrimonio',
];

/**
 * Obtiene el umbral de distancia para un lugar dado
 */
export function getDistanceThreshold(location: GeoLocation): number {
  // Primero intentar por placeType
  if (location.placeType && DISTANCE_THRESHOLDS[location.placeType]) {
    return DISTANCE_THRESHOLDS[location.placeType];
  }
  
  // Si tiene datos enriquecidos, usar la categoría
  if (location.enrichedData?.categoria) {
    const category = location.enrichedData.categoria;
    
    if (GEOGRAPHIC_CATEGORIES.some(cat => category.toLowerCase().includes(cat.toLowerCase()))) {
      return 250; // Localidad/accidente geográfico
    }
    
    if (ESTABLISHMENT_CATEGORIES.some(cat => category.toLowerCase().includes(cat.toLowerCase()))) {
      return 10; // Establecimiento
    }
  }
  
  // Por defecto
  return DISTANCE_THRESHOLDS.default;
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
