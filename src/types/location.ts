// Árbol global de clasificación de puntos geográficos
export interface ClasificacionPunto {
 categoria_principal: string; // "1. Asentamientos humanos", "2. Entidades construidas", etc.
 subcategoria: string; // "1.1 Ciudad", "2.1 Edificio", etc.
 tipo_especifico?: string; // "2.1.1 Monumento", "4.2.2 Playa", etc.
 codigo: string; // "1.1", "2.1.1", "4.2.2" - para filtrado jerárquico
}

// Estructura jerárquica geográfica completa
export interface DatosGeograficos {
 continente?: string;
 pais?: string;
 admin_nivel_1?: string; // Estado/Comunidad Autónoma/Región/Land/Cantón
 admin_nivel_2?: string; // Provincia/Departamento/Condado/Distrito
 admin_nivel_3?: string; // Comarca/Municipio/Borough/Arrondissement
 localidad?: string; // Ciudad/Villa/Pueblo/Aldea
 sublocalidad?: string; // Barrio/Distrito urbano
 lugar_interes?: string; // POI específico (nombre del monumento, parque, etc.)
 direccion_postal?: string; // Dirección completa si aplica
 coordenadas?: string; // Formato: "lat, lng"
  // Fuente de los datos
 fuente_geocoding?: 'nominatim' | 'ai' | 'manual';
 fuente_refinamiento?: 'ai' | 'manual';
}

// Estructura de ficha técnica basada en criterio de redacción técnica validado
export interface EnrichedLocationData {
 verified: boolean;
 verification_notes: string;
 
  // Categoría principal del punto (legacy, para compatibilidad)
 categoria: string;
 
  // NUEVA: Clasificación jerárquica del punto
 clasificacion?: ClasificacionPunto;
 
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
 
  // Índice de interés (1-5) generado por IA basado en relevancia turística/cultural
 indice_interes?: number;
 indice_interes_notas?: string;
 
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

export type LocationVisibility = 'public' | 'followers' | 'private';

export type LocationEnrichmentDBStatus = 'enriched' | 'unresolved' | 'manual' | 'pending';

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
 visibility?: LocationVisibility;
 customData?: Record<string, string>;
 enrichedData?: EnrichedLocationData;
 /** Estado de enriquecimiento en BD: null=no intentado, enriched, unresolved, manual, pending */
 enrichmentStatus?: LocationEnrichmentDBStatus;
 /** ID del documento de origen */
 documentId?: string;
 createdAt: Date;
 updatedAt: Date;
}

export interface ImportedRoute {
 id: string;
 name: string;
 coordinates: [number, number][]; // [lat, lng] pairs
 color?: string;
 /** User-editable date for when this route was traveled */
 date?: Date;
}

export interface KMLDocument {
 id: string;
 name: string;
 fileName: string;
 locations: GeoLocation[];
 routes?: ImportedRoute[];
 uploadedAt: Date;
 userId?: string; // ID del propietario del documento
 ownerName?: string; // Nombre para mostrar del propietario (de profiles)
  // Curador virtual asociado (si aplica)
 curatorId?: string;
 curatorIcon?: string;
 curatorColor?: string;
 curatorAvatar?: string;
  // Druida asociado (si aplica)
 druidId?: string;
 druidIcon?: string;
 druidColor?: string;
}

export type EnrichmentStatusFilter = 'current' | 'previous' | 'unknown' | 'new';
export type OwnershipFilter = 'all' | 'mine' | 'followed';
export type VisitedFilter = 'all' | 'visited' | 'pending';

export type FilterCriteria = {
 continent?: string;
 country?: string;
 region?: string;
 zone?: string;
  // Nuevos niveles administrativos (de enrichedData.datos_geograficos)
 comarca?: string; // admin_nivel_3
 localidad?: string;
 sublocalidad?: string;
  // Clasificación de puntos
 classificationCode?: string;
 searchTerm?: string;
 placeType?: PlaceType;
 tag?: string; // Single tag (legacy, deprecated)
 tags?: string[]; // Multiple tags selection
 onlyEnriched?: boolean;
 verified?: boolean;
 semanticResultIds?: string[];
  // Estado de enriquecimiento
 enrichmentStatus?: EnrichmentStatusFilter;
  // Filtro de propietario
 ownershipFilter?: OwnershipFilter;
  // Filtro de visita
 visitedFilter?: VisitedFilter;
  // Filtro por usuario específico (para ver puntos de un usuario seguido)
 filterByUserId?: string;
 filterByUserName?: string; // Nombre para mostrar en UI
  // Filtro por curador virtual
 filterByCuratorId?: string;
 filterByCuratorName?: string; // Nombre para mostrar en UI
  // Filtro por druida
 filterByDruidId?: string;
  filterByDruidName?: string; // Nombre para mostrar en UI
   // Filtro por documento importado
  filterByDocumentId?: string;
  filterByDocumentName?: string;
  // Documentos ocultos por estado
  hiddenDocumentIds?: string[];
  // Curadores ocultos (no mostrar sus puntos en el mapa)
 hiddenCuratorIds?: string[];
  // Druidas ocultos (no mostrar sus puntos en el mapa)
 hiddenDruidIds?: string[];
  // Usuarios seguidos ocultos (no mostrar sus puntos en el mapa)
 hiddenFollowedUserIds?: string[];
};

export type ExportFormat = 'kml' | 'csv' | 'json';
