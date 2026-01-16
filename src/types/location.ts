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
