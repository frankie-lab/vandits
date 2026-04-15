/**
 * useResolvedMapFeatures — Central composition hook for V2 map data.
 * 
 * This is NOT a trivial mapping hook. It:
 * 1. Reads places, waypoints, user_places based on map mode and flags
 * 2. Crosses with user preferences and visibility settings
 * 3. Applies the visual grammar (shape, color, decorations)
 * 4. Emits MapFeature[] ready for the map layer to consume
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
} from '@/domains/v2';
import { resolveVisualGrammar } from '@/domains/v2/visual-grammar';
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

  const visual = resolveVisualGrammar({
    entityType: 'place',
    ownershipSource: 'own',
    state,
    isEnriched,
  });

  return {
    id: place.id,
    entityType: 'place',
    ownershipSource: 'own',
    renderContext,
    state,
    latitude: place.latitude,
    longitude: place.longitude,
    name: place.name,
    shape: visual.shape,
    fillColor: visual.fillColor,
    borderColor: visual.borderColor,
    decoration: visual.decoration.length > 0 ? visual.decoration : undefined,
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
  const isEnriched = !!resolvedPlace?.enrichedData?.descripcion;

  const state: MapFeatureState = {
    isSelected: waypoint.id === selectedId,
    isVisited: false,
    isFavorite: false,
    isConflict: waypoint.resolutionStatus === 'conflict',
  };

  const visual = resolveVisualGrammar({
    entityType: 'waypoint',
    ownershipSource: 'own',
    state,
    isEnriched,
  });

  return {
    id: waypoint.id,
    entityType: 'waypoint',
    ownershipSource: 'own',
    renderContext: 'document',
    state,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    name: waypoint.normalizedName || waypoint.rawName,
    shape: visual.shape,
    fillColor: visual.fillColor,
    borderColor: visual.borderColor,
    decoration: visual.decoration.length > 0 ? visual.decoration : undefined,
    clickPayload: {
      entityId: waypoint.id,
      entityType: 'waypoint',
      placeId: waypoint.placeId ?? undefined,
      documentId,
    },
  };
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

  // Compose features from loaded data
  const features = useMemo(() => {
    if (!data) return [];

    const userPlaceIndex = buildUserPlaceIndex(data.userPlaces);
    const placeIndex = new Map(data.places.map(p => [p.id, p]));
    const result: MapFeature[] = [];

    const renderContext: MapRenderContext =
      mapMode === 'document' ? 'document' : 'default';

    // Places → features
    for (const place of data.places) {
      const userPlace = userPlaceIndex.get(place.id);
      result.push(placeToFeature(place, userPlace, selectedFeatureId ?? null, renderContext));
    }

    // Waypoints → features (document mode)
    if (mapMode === 'document' && documentId) {
      for (const wp of data.waypoints) {
        // Skip waypoints whose resolved place is already in the list
        if (wp.placeId && placeIndex.has(wp.placeId)) continue;
        result.push(waypointToFeature(wp, undefined, selectedFeatureId ?? null, documentId));
      }
    }

    return result;
  }, [data, selectedFeatureId, mapMode, documentId]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return { features, loading: loading || flagsLoading, isV2Active, refresh };
}
