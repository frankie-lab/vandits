/**
 * Discovery domain — types for map, filters, and exploration.
 *
 * These types are re-exported from the canonical location for now
 * and will be moved here as the domain matures.
 */

// ── Re-exports from canonical types (backward compat) ────────
export type {
  FilterCriteria,
  OwnershipFilter,
  VisitedFilter,
  EnrichmentStatusFilter,
} from '@/types/location';

// ── Discovery-specific types ─────────────────────────────────

export type ViewMode = 'map' | 'gallery' | 'list';

/** Layer types managed by the discovery domain */
export type DiscoveryLayerType = 'catalog' | 'workspace' | 'own' | 'followed' | 'routes' | 'points';

/** Viewport state for map persistence */
export interface MapViewport {
  center: [number, number]; // [lat, lng]
  zoom: number;
}

/** Discovery panel visibility state */
export interface DiscoveryPanelState {
  showFilters: boolean;
  showLocations: boolean;
  showGallery: boolean;
  showSemanticSearch: boolean;
  showDuplicates: boolean;
  showIncomplete: boolean;
  showUnresolved: boolean;
  showLayers: boolean;
}
