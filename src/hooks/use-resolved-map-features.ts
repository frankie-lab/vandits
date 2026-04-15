/**
 * useResolvedMapFeatures — Central composition hook for V2 map data.
 * 
 * This is NOT a trivial mapping hook. It:
 * 1. Reads places, waypoints, user_places based on map mode and flags
 * 2. Crosses with user preferences and visibility settings
 * 3. Validates features (rejects invalid combinations)
 * 4. Applies the marker grammar (shape, color, decorations, zIndex)
 * 5. Emits MapFeature[] ready for the map layer to consume
 * 
 * The map does NOT deduce semantics — it receives pre-resolved features.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  MapFeature,
  MapFeatureState,
  MapMode,
  MapEntityType,
  MapOwnershipSource,
  MapRenderContext,
  Place,
  Waypoint,
  UserPlace,
  V2FeatureFlags,
  DiscardedFeature,
} from '@/domains/v2';
import { resolveMarkerGrammar } from '@/domains/v2/marker-grammar';
import { validateFeature } from '@/domains/v2/marker-validation';
import { loadMapData, type LoadedMapData } from '@/domains/v2/loaders';
import { useV2Flags } from './use-v2-flags';

// ── Types ─────────────────────────────────────────────────────

interface UseResolvedMapFeaturesOptions {
  userId: string | null;
  mapMode: MapMode;
  documentId?: string | null;
  selectedFeatureId?: string | null;
}

interface UseResolvedMapFeaturesResult {
  features: MapFeature[];
  /** Features rejected by validation, with reasons. Useful for debugging. */
  discarded: DiscardedFeature[];
  loading: boolean;
  /** True when V2 data is active (flags enabled and data loaded) */
  isV2Active: boolean;
  refresh: () => void;
}

// ── Composition helpers ───────────────────────────────────────

function buildUserPlaceIndex(userPlaces: UserPlace[]): Map<string, UserPlace> {
  const index = new Map<string, UserPlace>();
  for (const up of userPlaces) {
    index.set(up.placeId, up);
  }
  return index;
}

function placeToFeature(
  place: Place,
  userPlace: UserPlace | undefined,
  selectedId: string | null,
  renderContext: MapRenderContext,
): MapFeature {
  const isEnriched = !!place.enrichedData?.descripcion;

  const state: MapFeatureState = {
    isSelected: place.id === selectedId,
    isVisited: userPlace?.visitStatus === 'visited',
    isFavorite: userPlace?.isFavorite ?? false,
    isConflict: false,
  };

  // Shape determined by enrichment, not by grammar (grammar confirms)
  const shape = isEnriched ? 'teardrop' as const : 'circle-solid' as const;

  return {
    id: place.id,
    entityType: 'place',
    ownershipSource: 'own',
    renderContext,
    state,
    latitude: place.latitude,
    longitude: place.longitude,
    name: place.name,
    shape,
    fillColor: '', // Will be resolved by grammar
    isCatalog: renderContext === 'default', // catalog when in default view
    iconKey: place.placeType ?? undefined,
    clickPayload: {
      entityId: place.id,
      entityType: 'place',
      placeId: place.id,
    },
  };
}

function waypointToFeature(
  waypoint: Waypoint,
  resolvedPlace: Place | undefined,
  selectedId: string | null,
  documentId: string,
): MapFeature {
  const state: MapFeatureState = {
    isSelected: waypoint.id === selectedId,
    isVisited: false,
    isFavorite: false,
    isConflict: waypoint.resolutionStatus === 'conflict',
  };

  return {
    id: waypoint.id,
    entityType: 'waypoint',
    ownershipSource: 'own',
    renderContext: 'document',
    state,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    name: waypoint.normalizedName || waypoint.rawName,
    shape: 'circle-hollow',
    fillColor: '', // Will be resolved by grammar
    clickPayload: {
      entityId: waypoint.id,
      entityType: 'waypoint',
      placeId: waypoint.placeId ?? undefined,
      documentId,
    },
  };
}

// ── Validation + Grammar Application ──────────────────────────

function applyGrammar(
  rawFeatures: MapFeature[],
): { valid: MapFeature[]; discarded: DiscardedFeature[] } {
  const valid: MapFeature[] = [];
  const discarded: DiscardedFeature[] = [];

  for (const feature of rawFeatures) {
    const validation = validateFeature(feature);

    if (!validation.isValid) {
      if (import.meta.env.DEV) {
        console.warn(
          `[useResolvedMapFeatures] Discarded feature "${feature.name}" (${feature.id}): ${validation.reason}`,
        );
      }
      discarded.push({ feature, reason: validation.reason! });
      continue;
    }

    // Apply grammar to get resolved visual properties
    const grammar = resolveMarkerGrammar(feature);

    valid.push({
      ...feature,
      shape: grammar.shape,
      fillColor: grammar.fillColor,
      borderColor: grammar.borderColor,
      decoration: grammar.decorations.length > 0 ? grammar.decorations : undefined,
    });
  }

  return { valid, discarded };
}

// ── Hook ──────────────────────────────────────────────────────

export function useResolvedMapFeatures(
  options: UseResolvedMapFeaturesOptions,
): UseResolvedMapFeaturesResult {
  const { userId, mapMode, documentId, selectedFeatureId } = options;
  const { flags, loading: flagsLoading } = useV2Flags();

  const [data, setData] = useState<LoadedMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const isV2Active = !flagsLoading && (flags.v2DataReadPlaces || flags.v2DataReadUserPlaces);

  // Load data when inputs change
  useEffect(() => {
    if (!userId || flagsLoading) return;
    if (!flags.v2DataReadPlaces && !flags.v2DataReadUserPlaces) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadMapData(userId, mapMode, documentId ?? null, flags)
      .then(result => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('[useResolvedMapFeatures] Load failed:', err);
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [userId, mapMode, documentId, flagsLoading, flags.v2DataReadPlaces, flags.v2DataReadUserPlaces, refreshKey]);

  // Compose and validate features from loaded data
  const { features, discarded } = useMemo(() => {
    if (!data) return { features: [], discarded: [] };

    const userPlaceIndex = buildUserPlaceIndex(data.userPlaces);
    const placeIndex = new Map(data.places.map(p => [p.id, p]));
    const rawFeatures: MapFeature[] = [];

    const renderContext: MapRenderContext =
      mapMode === 'document' ? 'document' : 'default';

    // Places → features
    for (const place of data.places) {
      const userPlace = userPlaceIndex.get(place.id);
      rawFeatures.push(placeToFeature(place, userPlace, selectedFeatureId ?? null, renderContext));
    }

    // Waypoints → features (document mode)
    if (mapMode === 'document' && documentId) {
      for (const wp of data.waypoints) {
        // Skip waypoints whose resolved place is already in the list
        if (wp.placeId && placeIndex.has(wp.placeId)) continue;
        rawFeatures.push(waypointToFeature(wp, undefined, selectedFeatureId ?? null, documentId));
      }
    }

    // Validate + apply grammar
    const { valid, discarded } = applyGrammar(rawFeatures);
    return { features: valid, discarded };
  }, [data, selectedFeatureId, mapMode, documentId]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return { features, discarded, loading: loading || flagsLoading, isV2Active, refresh };
}
