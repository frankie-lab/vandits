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

interface UseMapHeatmapParams {
  mapRef: React.MutableRefObject<L.Map | null>;
  markersRef: React.MutableRefObject<Map<string, L.Marker>>;
  locations: GeoLocation[];
  viewMode: ViewMode;
  heatmapZoomThreshold: number;
  getLocationOwnership: (id: string, userId: string | null) => any;
  currentUserId: string | null;
  userViewModeRef: React.MutableRefObject<ViewMode>;
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
        marker.setOpacity(userMode === 'hybrid' && markerOwnershipRef.current.get(id) ? 1 : 0);
      });
    } else {
      markersRef.current.forEach((marker) => marker.setOpacity(1));
    }
  }, [locations, getLocationOwnership, currentUserId, viewMode]);

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
          marker.setOpacity(userMode === 'hybrid' && markerOwnershipRef.current.get(id) ? 1 : 0);
        });
      } else {
        heatLayersRef.current.forEach((layer) => {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        });
        markersRef.current.forEach((marker) => marker.setOpacity(1));
      }
    };

    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [heatmapZoomThreshold]);

  // React to viewMode changes from toolbar
  useEffect(() => {
    if (!mapRef.current) return;
    userViewModeRef.current = viewMode;
    if (viewMode === 'markers') {
      heatLayersRef.current.forEach((layer) => {
        if (mapRef.current?.hasLayer(layer)) mapRef.current.removeLayer(layer);
      });
      heatLayersRef.current = [];
      markersRef.current.forEach((marker) => marker.setOpacity(1));
    }
  }, [viewMode]);

  return { heatLayersRef, markerOwnershipRef, heatVisibleRef };
}
