/**
 * useMapHeatmap.ts
 * Custom hook that manages heat layer creation, zoom-based toggling,
 * and view mode switching for the map component.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { GeoLocation } from '@/types/location';
import { getUserHue } from './map-utils';
import { ViewMode } from './map-constants';

/**
 * Resolve the correct opacity for a marker considering heatmap state,
 * view mode, ownership, and entity-level min_visibility_zoom.
 */
export function resolveMarkerOpacity(
  id: string,
  currentZoom: number,
  heatVisible: boolean,
  viewMode: ViewMode,
  isOwn: boolean,
  entityId: string | undefined,
  entityVisibilityZooms: Map<string, number | null>,
): number {
  // In markers mode, only entity zoom restriction applies
  if (viewMode !== 'heatmap' && viewMode !== 'hybrid') {
    if (entityId) {
      const minZoom = entityVisibilityZooms.get(entityId);
      if (minZoom != null && currentZoom < minZoom) return 0;
    }
    return 1;
  }

  // Heat is visible → only own markers in hybrid are shown
  if (heatVisible) {
    return (viewMode === 'hybrid' && isOwn) ? 1 : 0;
  }

  // Heat hidden (zoomed in past threshold) → show markers, but respect entity zoom
  if (entityId) {
    const minZoom = entityVisibilityZooms.get(entityId);
    if (minZoom != null && currentZoom < minZoom) return 0;
  }
  return 1;
}

interface UseMapHeatmapParams {
  mapRef: React.MutableRefObject<L.Map | null>;
  markersRef: React.MutableRefObject<Map<string, L.Marker>>;
  locations: GeoLocation[];
  viewMode: ViewMode;
  heatmapZoomThreshold: number;
  getLocationOwnership: (id: string, userId: string | null) => any;
  currentUserId: string | null;
  userViewModeRef: React.MutableRefObject<ViewMode>;
  entityVisibilityZooms: Map<string, number | null>;
}

export function useMapHeatmap({
  mapRef,
  markersRef,
  locations,
  viewMode,
  heatmapZoomThreshold,
  getLocationOwnership,
  currentUserId,
  userViewModeRef,
  entityVisibilityZooms,
}: UseMapHeatmapParams) {
  const heatLayersRef = useRef<L.Layer[]>([]);
  const markerOwnershipRef = useRef<Map<string, boolean>>(new Map());
  const heatVisibleRef = useRef(true);

  // Build heat layers when locations change
  useEffect(() => {
    if (!mapRef.current) return;
    const userMode = userViewModeRef.current;

    // Clear old layers
    heatLayersRef.current.forEach((layer) => {
      if (mapRef.current?.hasLayer(layer)) mapRef.current.removeLayer(layer);
    });
    heatLayersRef.current = [];
    markerOwnershipRef.current.clear();

    if (userMode !== 'heatmap' && userMode !== 'hybrid') {
      markersRef.current.forEach((marker) => marker.setOpacity(1));
      return;
    }

    const hueToGradient = (hue: number): Record<number, string> => ({
      0.0: `hsl(${hue}, 60%, 85%)`,
      0.3: `hsl(${hue}, 70%, 65%)`,
      0.5: `hsl(${hue}, 80%, 55%)`,
      0.7: `hsl(${hue}, 85%, 45%)`,
      1.0: `hsl(${hue}, 90%, 35%)`,
    });

    const createHeatLayer = (locs: GeoLocation[], gradient: Record<number, string>) => {
      const count = locs.length;
      if (count === 0) return null;
      const intensity = count <= 1 ? 1.0 : count <= 10 ? 0.8 : count <= 50 ? 0.6 : count <= 200 ? 0.4 : 0.3;
      const radius = count <= 1 ? 50 : count <= 10 ? 40 : count <= 50 ? 30 : count <= 200 ? 25 : 20;
      const blur = count <= 1 ? 30 : count <= 10 ? 25 : count <= 50 ? 20 : 15;
      const max = count <= 1 ? 0.5 : count <= 10 ? 0.6 : count <= 50 ? 0.8 : 1.0;
      const data: [number, number, number][] = locs.map((l) => [l.coordinates.lat, l.coordinates.lng, intensity]);
      return (L as any).heatLayer(data, { radius, blur, maxZoom: 18, max, minOpacity: 0.4, gradient });
    };

    // Group locations by owner
    const groups = new Map<string, GeoLocation[]>();
    locations.forEach((loc) => {
      const ownership = getLocationOwnership(loc.id, currentUserId);
      markerOwnershipRef.current.set(loc.id, ownership.isOwn);
      const key = ownership.isOwn ? '_own' : ownership.curatorId || ownership.ownerId || '_unknown';
      const arr = groups.get(key) || [];
      arr.push(loc);
      groups.set(key, arr);
    });

    const ownGradient: Record<number, string> = {
      0.0: '#60a5fa',
      0.2: '#22c55e',
      0.4: '#84cc16',
      0.6: '#eab308',
      0.8: '#f97316',
      1.0: '#dc2626',
    };

    groups.forEach((locs, ownerId) => {
      // In hybrid mode, skip own locations — they show as markers, not heat
      if (userMode === 'hybrid' && ownerId === '_own') return;
      const gradient = ownerId === '_own' ? ownGradient : hueToGradient(getUserHue(ownerId));
      const layer = createHeatLayer(locs, gradient);
      if (layer) heatLayersRef.current.push(layer);
    });

    // Apply initial visibility
    const zoom = mapRef.current.getZoom();
    const showHeat = zoom < heatmapZoomThreshold;
    heatVisibleRef.current = showHeat;

    if (showHeat) {
      heatLayersRef.current.forEach((layer) => layer.addTo(mapRef.current!));
      markersRef.current.forEach((marker, id) => {
        const ownership = markerOwnershipRef.current.get(id);
        const isOwn = !!ownership;
        // Determine entity id for this marker
        const loc = locations.find(l => l.id === id);
        const ownershipFull = loc ? getLocationOwnership(loc.id, currentUserId) : undefined;
        const entityId = ownershipFull?.curatorId || ownershipFull?.druidId;
        marker.setOpacity(resolveMarkerOpacity(id, zoom, true, userMode, isOwn, entityId, entityVisibilityZooms));
      });
    } else {
      markersRef.current.forEach((marker, id) => {
        const loc = locations.find(l => l.id === id);
        const ownershipFull = loc ? getLocationOwnership(loc.id, currentUserId) : undefined;
        const entityId = ownershipFull?.curatorId || ownershipFull?.druidId;
        const isOwn = markerOwnershipRef.current.get(id) ?? true;
        marker.setOpacity(resolveMarkerOpacity(id, zoom, false, userMode, isOwn, entityId, entityVisibilityZooms));
      });
    }
  }, [locations, getLocationOwnership, currentUserId, viewMode, entityVisibilityZooms]);

  // Zoom toggle — show/hide cached layers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const onZoom = () => {
      const userMode = userViewModeRef.current;
      if (userMode !== 'hybrid' && userMode !== 'heatmap') return;
      if (heatLayersRef.current.length === 0) return;

      const shouldShowHeat = map.getZoom() < heatmapZoomThreshold;
      if (shouldShowHeat === heatVisibleRef.current) return;
      heatVisibleRef.current = shouldShowHeat;

      if (shouldShowHeat) {
        heatLayersRef.current.forEach((layer) => {
          if (!map.hasLayer(layer)) layer.addTo(map);
        });
        markersRef.current.forEach((marker, id) => {
          const isOwn = markerOwnershipRef.current.get(id) ?? false;
          // For zoom handler we don't have easy access to entityId, so use a simpler check
          marker.setOpacity((userMode === 'hybrid' && isOwn) ? 1 : 0);
        });
      } else {
        heatLayersRef.current.forEach((layer) => {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        });
        const currentZoom = map.getZoom();
        markersRef.current.forEach((marker, id) => {
          // Respect entity visibility zooms when transitioning from heat to markers
          let opacity = 1;
          // Check if this marker belongs to a curator/druid with min_visibility_zoom
          for (const [entityId, minZoom] of entityVisibilityZooms.entries()) {
            if (minZoom != null && currentZoom < minZoom) {
              // We need to know if this marker belongs to this entity
              // Use the locationsRef if available, but in the hook we only have markersRef
              // So we'll set opacity 1 and let the curator visibility handler correct it
            }
          }
          marker.setOpacity(opacity);
        });
        // Dispatch event so curator/druid visibility handler re-checks
        window.dispatchEvent(new CustomEvent('heatmap-transition-complete'));
      }
    };

    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [heatmapZoomThreshold, entityVisibilityZooms]);

  // React to viewMode changes from toolbar
  useEffect(() => {
    if (!mapRef.current) return;
    userViewModeRef.current = viewMode;
    if (viewMode === 'markers') {
      heatLayersRef.current.forEach((layer) => {
        if (mapRef.current?.hasLayer(layer)) mapRef.current.removeLayer(layer);
      });
      heatLayersRef.current = [];
      markersRef.current.forEach((marker, id) => marker.setOpacity(1));
      // Let curator/druid visibility re-check
      window.dispatchEvent(new CustomEvent('heatmap-transition-complete'));
    }
  }, [viewMode]);

  return { heatLayersRef, markerOwnershipRef, heatVisibleRef };
}
