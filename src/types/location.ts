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
