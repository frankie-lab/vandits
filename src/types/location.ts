// Estructura de ficha técnica basada en criterio de redacción técnica validado
export interface EnrichedLocationData {
  verified: boolean;
  verification_notes: string;
  
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
  | 'other';

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  city: 'Ciudad',
  monument: 'Monumento',
  geographic_feature: 'Accidente Geográfico',
  viewpoint: 'Mirador',
  beach: 'Playa',
  mountain: 'Montaña',
  park: 'Parque',
  museum: 'Museo',
  restaurant: 'Restaurante',
  hotel: 'Hotel',
  historical_site: 'Sitio Histórico',
  religious_site: 'Sitio Religioso',
  natural_reserve: 'Reserva Natural',
  other: 'Otro',
};

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
