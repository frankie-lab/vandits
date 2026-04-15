/**
 * VANDITS V2 — Domain Type Contracts
 * 
 * These types define the V2 data model. They coexist with legacy types
 * during the transition period controlled by feature flags.
 */

import type { EnrichedLocationData, ClasificacionPunto, PlaceType, LocationVisibility, LocationEnrichmentDBStatus } from '@/types/location';

// =============================================
// Core Entities
// =============================================

/** Canonical, neutral location entity */
export interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  enrichedData?: EnrichedLocationData;
  placeType?: PlaceType;
  classification?: ClasificacionPunto;
  continent?: string;
  country?: string;
  region?: string;
  zone?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Imported point with process identity — always a point, never a line */
export interface Waypoint {
  id: string;
  documentId: string;
  placeId?: string;
  rawName: string;
  normalizedName: string;
  latitude: number;
  longitude: number;
  resolutionStatus: WaypointResolutionStatus;
  resolutionConfidence?: number;
  resolutionMethod?: WaypointResolutionMethod;
  resolvedByUserId?: string;
  resolvedAt?: Date;
  sourceHash?: string;
  enrichmentStatus?: LocationEnrichmentDBStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type WaypointResolutionStatus = 'pending' | 'resolved' | 'conflict' | 'dismissed';
export type WaypointResolutionMethod = 'auto' | 'ai' | 'manual';

/** Linear geometry imported from a file */
export interface DocumentTrack {
  id: string;
  documentId: string;
  name: string;
  coordinates: [number, number][]; // [lat, lng]
  color?: string;
  date?: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Import document as root audit entity */
export interface DocumentV2 {
  id: string;
  userId: string;
  name: string;
  sourceType?: DocumentSourceType;
  filename?: string;
  originalFilePath?: string;
  importStatus?: DocumentImportStatus;
  totalWaypoints: number;
  resolvedCount: number;
  pendingCount: number;
  conflictCount: number;
  confirmedAt?: Date;
  metadata: Record<string, unknown>;
  status: 'draft' | 'in_review' | 'published' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export type DocumentSourceType = 'kml' | 'gpx' | 'geojson' | 'csv' | 'manual';
export type DocumentImportStatus = 'parsing' | 'reviewing' | 'confirmed' | 'partial' | 'failed';

// =============================================
// User Relationships
// =============================================

/** User-place relationship with orthogonal status */
export interface UserPlace {
  id: string;
  userId: string;
  placeId: string;
  visitStatus: VisitStatus;
  isSaved: boolean;
  isFavorite: boolean;
  rating?: number;
  visibility: LocationVisibility;
  isArchived: boolean;
  origin: UserPlaceOrigin;
  savedFromUserId?: string;
  sourceDocumentId?: string;
  visitedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type VisitStatus = 'not_visited' | 'want_to_go' | 'visited';
export type UserPlaceOrigin = 'import' | 'manual' | 'adopted';

// =============================================
// Collections (polymorphic-ready)
// =============================================

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  visibility: LocationVisibility | 'private';
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  itemType: CollectionItemType;
  itemId: string;
  position: number;
  addedAt: Date;
}

export type CollectionItemType = 'place' | 'waypoint' | 'route';

// =============================================
// Map View Model
// =============================================

export type MapMode = 'personal' | 'document' | 'social';
export type MapEntityType = 'place' | 'waypoint' | 'track';
export type MapOwnershipSource = 'own' | 'followed' | 'curator' | 'druid';
export type MapRenderContext = 'default' | 'document' | 'search';

/** Composable, non-mutually-exclusive state */
export interface MapFeatureState {
  isSelected: boolean;
  isVisited: boolean;
  isFavorite: boolean;
  isConflict: boolean;
}

/** Pre-resolved view model for map rendering — the map does NOT deduce semantics */
export interface MapFeature {
  id: string;
  entityType: MapEntityType;
  ownershipSource: MapOwnershipSource;
  renderContext: MapRenderContext;
  state: MapFeatureState;
  latitude: number;
  longitude: number;
  name: string;
  // Visual grammar (pre-resolved)
  shape: 'teardrop' | 'circle-solid' | 'circle-hollow' | 'circle-dashed';
  fillColor: string;
  borderColor?: string;
  decoration?: ('halo' | 'check' | 'star' | 'warning')[];
  iconKey?: string;
  // Click payload
  clickPayload: MapFeatureClickPayload;
}

export interface MapFeatureClickPayload {
  entityId: string;
  entityType: MapEntityType;
  placeId?: string;
  documentId?: string;
  userId?: string;
}

// =============================================
// Map Preferences
// =============================================

export interface UserMapPreferences {
  id: string;
  userId: string;
  context: MapMode;
  visibleLayers: Record<string, boolean>;
  activeFilters: Record<string, unknown>;
  viewport: {
    center?: [number, number];
    zoom?: number;
  };
  updatedAt: Date;
}

// =============================================
// Canonicalization
// =============================================

export interface PlaceMergeRecord {
  id: string;
  sourcePlaceId: string;
  targetPlaceId: string;
  mergedAt: Date;
  mergedBy?: string;
  reason?: string;
}

// =============================================
// Feature Flags
// =============================================

export interface V2FeatureFlags {
  v2DataReadPlaces: boolean;
  v2DataReadUserPlaces: boolean;
  v2DataWriteImports: boolean;
  v2DataWriteUserPlaces: boolean;
  v2MapFeatures: boolean;
  v2Collections: boolean;
}

/** Valid activation phases — flags MUST be activated in this order */
export const V2_FLAG_PHASES = {
  A: ['v2_data_read_places', 'v2_data_read_user_places'],
  B: ['v2_data_write_imports'],
  C: ['v2_data_write_user_places'],
  D: ['v2_map_features'],
  E: ['v2_collections'],
} as const;

/** Prohibited combinations */
export const V2_FLAG_CONSTRAINTS = {
  v2_map_features: { requires: ['v2_data_read_places'] },
  v2_data_write_imports: { requires: ['v2_data_read_places'] },
  v2_collections: { requires: ['v2_data_read_user_places'] },
} as const;
