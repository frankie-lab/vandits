// Estructura jerárquica geográfica completa
export interface DatosGeograficos {
  continente?: string;
  pais?: string;
  admin_nivel_1?: string;      // Estado/Comunidad Autónoma/Región/Land/Cantón
  admin_nivel_2?: string;      // Provincia/Departamento/Condado/Distrito
  admin_nivel_3?: string;      // Comarca/Municipio/Borough/Arrondissement
  localidad?: string;          // Ciudad/Villa/Pueblo/Aldea
  sublocalidad?: string;       // Barrio/Distrito urbano
  lugar_interes?: string;      // POI específico (nombre del monumento, parque, etc.)
  direccion_postal?: string;   // Dirección completa si aplica
  coordenadas?: string;        // Formato: "lat, lng"
  // Fuente de los datos
  fuente_geocoding?: 'nominatim' | 'ai' | 'manual';
  fuente_refinamiento?: 'ai' | 'manual';
}

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
  
  // Datos geográficos estructurados (jerarquía administrativa completa)
  datos_geograficos?: DatosGeograficos;
  
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
  if (CATEGORY_TO_PLACE_TYPE[category]) {
    return CATEGORY_TO_PLACE_TYPE[category];
  }
  
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

// Función para derivar PlaceType desde datos_clave.tipo (más preciso, basado en BBDD real)
export function getPlaceTypeFromTipo(tipo: string): PlaceType {
  const lowerTipo = tipo.toLowerCase();
  
  // Núcleos urbanos
  if (lowerTipo.includes('municipio') || lowerTipo.includes('ciudad') || lowerTipo.includes('villa') || 
      lowerTipo.includes('localidad') || lowerTipo.includes('comuna') || lowerTipo.includes('concejo') ||
      lowerTipo.includes('conjunto histórico') || lowerTipo.includes('despoblado') || lowerTipo.includes('pueblo') ||
      lowerTipo.includes('plaza')) {
    return 'city';
  }
  
  // Playas y costa
  if (lowerTipo.includes('playa') || lowerTipo.includes('cala') || lowerTipo.includes('acantilado') || 
      lowerTipo.includes('costa') || lowerTipo.includes('cabo') || lowerTipo.includes('puerto')) {
    return 'beach';
  }
  
  // Patrimonio histórico
  if (lowerTipo.includes('castillo') || lowerTipo.includes('fortaleza') || lowerTipo.includes('muralla') ||
      lowerTipo.includes('alcázar') || lowerTipo.includes('palacio') || lowerTipo.includes('torre') ||
      lowerTipo.includes('fortificación') || lowerTipo.includes('búnker') || lowerTipo.includes('ruina')) {
    return 'historical_site';
  }
  
  // Arquitectura religiosa
  if (lowerTipo.includes('iglesia') || lowerTipo.includes('catedral') || lowerTipo.includes('monasterio') ||
      lowerTipo.includes('ermita') || lowerTipo.includes('santuario') || lowerTipo.includes('convento') ||
      lowerTipo.includes('abadía') || lowerTipo.includes('basílica') || lowerTipo.includes('capilla')) {
    return 'religious_site';
  }
  
  // Reservas y parques naturales
  if (lowerTipo.includes('parque natural') || lowerTipo.includes('parque nacional') || 
      lowerTipo.includes('reserva') || lowerTipo.includes('biosfera') || lowerTipo.includes('espacio protegido') ||
      lowerTipo.includes('biotopo') || lowerTipo.includes('paraje natural')) {
    return 'natural_reserve';
  }
  
  // Accidentes geográficos
  if (lowerTipo.includes('pico') || lowerTipo.includes('montaña') || lowerTipo.includes('cumbre') ||
      lowerTipo.includes('formación') || lowerTipo.includes('desfiladero') || lowerTipo.includes('congost') ||
      lowerTipo.includes('cueva') || lowerTipo.includes('cañón') || lowerTipo.includes('garganta') || 
      lowerTipo.includes('desierto') || lowerTipo.includes('lago') || lowerTipo.includes('cascada') || 
      lowerTipo.includes('volcán') || lowerTipo.includes('geológic') || lowerTipo.includes('monumento natural') ||
      lowerTipo.includes('flysch') || lowerTipo.includes('salina')) {
    return 'geographic_feature';
  }
  
  // Miradores
  if (lowerTipo.includes('mirador') || lowerTipo.includes('balcón') || lowerTipo.includes('panorám')) {
    return 'viewpoint';
  }
  
  // Museos y cultura
  if (lowerTipo.includes('museo') || lowerTipo.includes('centro de interpretación') || 
      lowerTipo.includes('centro cultural') || lowerTipo.includes('educación ambiental') ||
      lowerTipo.includes('laberinto')) {
    return 'museum';
  }
  
  // Gastronomía
  if (lowerTipo.includes('restaurante') || lowerTipo.includes('bodega') || lowerTipo.includes('mercado') ||
      lowerTipo.includes('mesón') || lowerTipo.includes('taberna')) {
    return 'restaurant';
  }
  
  // Alojamiento
  if (lowerTipo.includes('hotel') || lowerTipo.includes('albergue') || lowerTipo.includes('camping') ||
      lowerTipo.includes('casa rural') || lowerTipo.includes('parador')) {
    return 'hotel';
  }
  
  // Rutas
  if (lowerTipo.includes('sendero') || lowerTipo.includes('ruta') || lowerTipo.includes('camino') ||
      lowerTipo.includes('vía verde')) {
    return 'route';
  }
  
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
  semanticResultIds?: string[];
};

export type ExportFormat = 'kml' | 'csv' | 'json';
