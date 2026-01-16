export interface EnrichedLocationData {
  verified: boolean;
  verification_notes: string;
  enriched_description: string;
  tourism: {
    main_attractions: string[];
    best_season: string;
    tips: string[];
  };
  gastronomy: {
    typical_dishes: string[];
    recommended_restaurants: string[];
    food_tips: string;
  };
  practical_info: {
    accessibility: string;
    estimated_time: string;
    budget: string;
  };
  curiosities: string[];
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
};

export type ExportFormat = 'kml' | 'csv' | 'json';
