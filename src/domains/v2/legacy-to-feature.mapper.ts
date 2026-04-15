/**
 * VANDITS V2 — Legacy-to-Feature Mapper
 * 
 * Bridges V1 GeoLocation to V2 MapFeature during the transition period.
 * Pure function — no side effects, no DB access.
 * 
 * Key rules:
 * - isApproved determines entityType, NOT ownershipSource or shape
 * - renderContext is passed explicitly, never derived from domain state
 * - isEnriched is a single boolean (no current/previous distinction)
 * - isCatalog is passed from caller to distinguish catalog vs workspace
 */

import type { GeoLocation } from '@/types/location';
import type {
  MapFeature,
  MapFeatureState,
  MapEntityType,
  MapOwnershipSource,
  MapRenderContext,
} from './types';

// ── Options ───────────────────────────────────────────────────

export interface LegacyMapperOptions {
  isOwn: boolean;
  isSelected: boolean;
  isFocused: boolean;
  isVisited: boolean;
  isFavorite: boolean;
  isCatalog: boolean;
  ownerInfo?: {
    curatorId?: string;
    druidId?: string;
    followedUserId?: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────

function resolveEntityType(location: GeoLocation): MapEntityType {
  const isEnriched = !!location.enrichedData?.descripcion;

  // Enriched → always a place
  if (isEnriched) return 'place';

  // Approved but not enriched → manually promoted place
  if (location.isApproved) return 'place';

  // Not enriched, not approved → waypoint
  return 'waypoint';
}

function resolveOwnership(options: LegacyMapperOptions): MapOwnershipSource {
  if (options.ownerInfo?.druidId) return 'druid';
  if (options.ownerInfo?.curatorId) return 'curator';
  if (!options.isOwn) return 'followed';
  return 'own';
}

// ── Main Mapper ───────────────────────────────────────────────

export function mapLegacyLocationToMapFeature(
  location: GeoLocation,
  options: LegacyMapperOptions,
  renderContext: MapRenderContext,
): MapFeature {
  const entityType = resolveEntityType(location);
  const ownershipSource = resolveOwnership(options);
  const isEnriched = !!location.enrichedData?.descripcion;

  const state: MapFeatureState = {
    isSelected: options.isSelected,
    isVisited: entityType === 'place' ? options.isVisited : false,
    isFavorite: entityType === 'place' ? options.isFavorite : false,
    isConflict: false, // V1 locations don't have resolution conflicts
  };

  // Determine shape based on entity type and enrichment
  const shape = entityType === 'waypoint'
    ? 'circle-hollow' as const
    : isEnriched
      ? 'teardrop' as const
      : 'circle-solid' as const;

  return {
    id: location.id,
    entityType,
    ownershipSource,
    renderContext,
    state,
    latitude: location.coordinates.lat,
    longitude: location.coordinates.lng,
    name: location.name,
    shape,
    fillColor: '', // Will be resolved by marker-grammar
    isCatalog: options.isCatalog,
    clickPayload: {
      entityId: location.id,
      entityType,
      placeId: entityType === 'place' ? location.id : undefined,
      documentId: location.documentId ?? undefined,
    },
  };
}
