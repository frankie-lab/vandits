// Estructura de ficha técnica basada en criterio de redacción técnica validado
export interface EnrichedLocationData {
  verified: boolean;
  verification_notes: string;
  
  // Categoría principal del punto
  categoria: string;
  
  // Estructura obligatoria de la ficha (sin encabezados)
  nombre_lugar: string;
  localizacion: string;
  descripcion: string;
  punto_destacado: string;
  observacion?: string;
  
  // Nube de etiquetas (hashtags)
  etiquetas: string[];
  
  // Etiquetas geográficas basadas en GPS (continente, país, región, zona)
  etiquetas_geograficas?: string[];
  
  // Datos clave (solo verificados)
  datos_clave: {
    tipo: string;
    dimension_principal?: string;
    acceso?: string;
    estado_proteccion?: string;
    coordenadas: string;
    web_referencia?: string;
  };
  
  // Fuentes efectivamente utilizadas
  fuentes: string[];
  
  // Imagen real del lugar (URL de Wikimedia Commons)
  imagen?: string;
  imagen_fuente?: string;
}

export type PlaceType = 
  | 'city' 
  | 'monument' 
  | 'geographic_feature' 
  | 'viewpoint' 
  | 'beach' 
  | 'mountain' 
  | 'park' 
  | 'museum' 
  | 'restaurant' 
  | 'hotel' 
  | 'historical_site' 
  | 'religious_site'
  | 'natural_reserve'
  | 'route'
  | 'other';

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  city: 'Núcleo Urbano',
  monument: 'Monumento',
  geographic_feature: 'Accidente Geográfico',
  viewpoint: 'Mirador',
  beach: 'Playa/Costa',
  mountain: 'Montaña',
  park: 'Naturaleza',
  museum: 'Museo/Cultura',
  restaurant: 'Gastronomía',
  hotel: 'Alojamiento',
  historical_site: 'Patrimonio Histórico',
  religious_site: 'Arquitectura Religiosa',
  natural_reserve: 'Reserva Natural',
  route: 'Ruta/Sendero',
  other: 'Otro',
};

// Mapeo de categorías del AI a PlaceType
export const CATEGORY_TO_PLACE_TYPE: Record<string, PlaceType> = {
  'Naturaleza': 'park',
  'Playas y Costa': 'beach',
  'Patrimonio Histórico': 'historical_site',
  'Arquitectura Religiosa': 'religious_site',
  'Núcleos Urbanos': 'city',
  'Miradores y Paisajes': 'viewpoint',
  'Museos y Cultura': 'museum',
  'Gastronomía': 'restaurant',
  'Alojamiento': 'hotel',
  'Rutas y Senderos': 'route',
  'Otros': 'other',
};

// Función para derivar PlaceType desde categoría AI
export function getPlaceTypeFromCategory(category: string): PlaceType {
  // Coincidencia exacta
  if (CATEGORY_TO_PLACE_TYPE[category]) {
    return CATEGORY_TO_PLACE_TYPE[category];
  }
  
  // Búsqueda parcial case-insensitive
  const lowerCategory = category.toLowerCase();
  
  if (lowerCategory.includes('naturaleza') || lowerCategory.includes('parque') || lowerCategory.includes('bosque')) return 'park';
  if (lowerCategory.includes('playa') || lowerCategory.includes('costa') || lowerCategory.includes('cala')) return 'beach';
  if (lowerCategory.includes('patrimonio') || lowerCategory.includes('castillo') || lowerCategory.includes('fortaleza')) return 'historical_site';
  if (lowerCategory.includes('religio') || lowerCategory.includes('iglesia') || lowerCategory.includes('catedral') || lowerCategory.includes('monasterio')) return 'religious_site';
  if (lowerCategory.includes('urbano') || lowerCategory.includes('pueblo') || lowerCategory.includes('ciudad') || lowerCategory.includes('villa')) return 'city';
  if (lowerCategory.includes('mirador') || lowerCategory.includes('panorám') || lowerCategory.includes('paisaje')) return 'viewpoint';
  if (lowerCategory.includes('museo') || lowerCategory.includes('cultura') || lowerCategory.includes('centro')) return 'museum';
  if (lowerCategory.includes('gastro') || lowerCategory.includes('restaurante') || lowerCategory.includes('bodega')) return 'restaurant';
  if (lowerCategory.includes('aloja') || lowerCategory.includes('hotel') || lowerCategory.includes('camping')) return 'hotel';
  if (lowerCategory.includes('ruta') || lowerCategory.includes('sendero') || lowerCategory.includes('camino')) return 'route';
  if (lowerCategory.includes('reserva')) return 'natural_reserve';
  if (lowerCategory.includes('montaña') || lowerCategory.includes('pico') || lowerCategory.includes('cumbre')) return 'mountain';
  if (lowerCategory.includes('monumento')) return 'monument';
  
  return 'other';
}

export interface GeoLocation {
  id: string;
  name: string;
  description?: string;
  coordinates: {
    lat: number;
    lng: number;
    altitude?: number;
  };
  continent?: string;
  country?: string;
  region?: string;
  zone?: string;
  placeType?: PlaceType;
  customData?: Record<string, string>;
  enrichedData?: EnrichedLocationData;
  createdAt: Date;
  updatedAt: Date;
}

export interface KMLDocument {
  id: string;
  name: string;
  fileName: string;
  locations: GeoLocation[];
  uploadedAt: Date;
}

export type FilterCriteria = {
  continent?: string;
  country?: string;
  region?: string;
  zone?: string;
  searchTerm?: string;
  placeType?: PlaceType;
  tag?: string;
  onlyEnriched?: boolean;
  verified?: boolean;
};

export type ExportFormat = 'kml' | 'csv' | 'json';
