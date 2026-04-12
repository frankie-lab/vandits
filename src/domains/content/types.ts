// Domain: Content — user-created locations, documents, notes, photos
// Re-exports from the canonical type file (will be migrated fully later)
export type {
  GeoLocation,
  KMLDocument,
  EnrichedLocationData,
  ClasificacionPunto,
  DatosGeograficos,
  PlaceType,
  FilterCriteria,
  ExportFormat,
  LocationVisibility,
  LocationEnrichmentDBStatus,
  EnrichmentStatusFilter,
  OwnershipFilter,
  VisitedFilter,
} from '@/types/location';

export { PLACE_TYPE_LABELS, CATEGORY_TO_PLACE_TYPE, getPlaceTypeFromCategory, getPlaceTypeFromTipo } from '@/types/location';
