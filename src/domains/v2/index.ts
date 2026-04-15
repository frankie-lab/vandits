/**
 * VANDITS V2 Domain — Index
 * 
 * Re-exports all V2 domain types for clean imports.
 * Usage: import { Place, Waypoint, MapFeature } from '@/domains/v2';
 */

export type {
  Place,
  Waypoint,
  WaypointResolutionStatus,
  WaypointResolutionMethod,
  DocumentTrack,
  DocumentV2,
  DocumentSourceType,
  DocumentImportStatus,
  UserPlace,
  VisitStatus,
  UserPlaceOrigin,
  Collection,
  CollectionItem,
  CollectionItemType,
  MapMode,
  MapEntityType,
  MapOwnershipSource,
  MapRenderContext,
  MapFeatureState,
  MapFeature,
  MapFeatureClickPayload,
  UserMapPreferences,
  PlaceMergeRecord,
  V2FeatureFlags,
} from './types';

export { V2_FLAG_PHASES, V2_FLAG_CONSTRAINTS } from './types';

// Visual grammar
export {
  resolveShape,
  resolveColors,
  resolveDecorations,
  resolveVisualGrammar,
} from './visual-grammar';
export type { VisualGrammarInput, VisualGrammarOutput } from './visual-grammar';

// Data loaders
export {
  loadPlaces,
  loadWaypoints,
  loadUnresolvedWaypoints,
  loadUserPlaces,
  loadFavorites,
  loadVisited,
  loadMapData,
} from './loaders';
export type { LoadedMapData } from './loaders';

// Dual-write bridges
export { dualWriteImport, dualWriteResolveWaypoint } from './dual-write-import';
export {
  dualWriteVisited,
  dualWriteFavorite,
  dualWriteRating,
  dualWriteAdopt,
} from './dual-write-user-place';
