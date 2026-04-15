/**
 * useV2MapBridge — Bridges V2 MapFeature[] data into the legacy LocationMap.
 * 
 * This hook sits alongside the existing legacy data flow and provides
 * V2-resolved features when flags are active. The LocationMap can optionally
 * consume these features for rendering, while the legacy flow remains
 * the fallback.
 * 
 * This is a transitional bridge — it will be removed when LocationMap
 * fully consumes MapFeature[] directly (Phase D: v2_map_features).
 */

import { useEffect, useRef, useCallback } from 'react';
import { useV2Flags } from '@/hooks/use-v2-flags';
import { useResolvedMapFeatures } from '@/hooks/use-resolved-map-features';
import type { MapFeature, MapMode } from '@/domains/v2';

interface UseV2MapBridgeOptions {
  userId: string | null;
  documentId?: string | null;
  selectedFeatureId?: string | null;
}

interface UseV2MapBridgeResult {
  /** V2 features when flags are active, empty array otherwise */
  v2Features: MapFeature[];
  /** True when V2 map rendering is enabled (Phase D) */
  shouldUseV2Render: boolean;
  /** True when V2 data is being loaded */
  v2Loading: boolean;
  /** Refresh V2 data */
  refreshV2: () => void;
}

/**
 * Determines the current map mode based on application state.
 * In the future this will be driven by router/context.
 */
function inferMapMode(documentId: string | null | undefined): MapMode {
  if (documentId) return 'document';
  return 'personal';
}

export function useV2MapBridge(options: UseV2MapBridgeOptions): UseV2MapBridgeResult {
  const { userId, documentId, selectedFeatureId } = options;
  const { flags, loading: flagsLoading } = useV2Flags();

  const mapMode = inferMapMode(documentId);

  const { features, loading, isV2Active, refresh } = useResolvedMapFeatures({
    userId,
    mapMode,
    documentId,
    selectedFeatureId,
  });

  // Phase D flag: when true, LocationMap should use V2 features for rendering
  const shouldUseV2Render = !flagsLoading && flags.v2MapFeatures && isV2Active;

  return {
    v2Features: features,
    shouldUseV2Render,
    v2Loading: loading,
    refreshV2: refresh,
  };
}
