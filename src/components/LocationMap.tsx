import React, { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import 'leaflet.heat';
import { useLocationsStore } from '@/store/locations-store';
import { useFilteredLocations } from '@/domains/content/hooks/use-filtered-locations';
import { GeoLocation } from '@/types/location';
import { motion } from 'framer-motion';
import { Maximize2, MapPin, Flame, CircleDot, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MapThemeToggle, MapTheme, MAP_TILE_LAYERS } from './MapThemeToggle';
import { MapScaleBar } from './MapScaleBar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMapCenterConfig, MapCenterConfig } from './MapCenterSettings';
import { toast } from 'sonner';
import { playEnrichmentComplete } from '@/lib/sounds';
import { usePermissions } from '@/hooks/use-permissions';
import { supabase } from '@/integrations/supabase/client';
import { getLucideSvgString, getMapMarkerHtml, getStopTypeIconKey } from '@/lib/icon-utils';

// Refactored modules
import { ViewMode, CriteriaStatus, CURATOR_ICON_PATHS } from './map/map-constants';
import {
  loadCriteriaTimestamp, meetsEnrichmentCriteria, getCriteriaColor,
  getUserHue, getOwnerInitials, adjustHslLightness,
  calculateDistance, toLeafletLatLng, createFlightArcCoords, calculateSegmentBearing,
  calculateVisitRelevance, formatTimeAgo, createFilterLink, parseLocalizacionToLinks,
  type VisitRelevanceInfo,
} from './map/map-utils';
import { createCustomIcon } from './map/map-icons';
import { loadCommunityReviews, submitCommunityReview } from './map/map-community-reviews';
import { buildImageSection, createPopupContent } from './map/map-popups';
import {
  showRoute, clearRoute, showAdvisorPreview, clearAdvisorPreview,
  showJourneyPreview, clearJourneyPreview,
  handleMapRouteClick, handleAlternativeHover,
  type RouteRefs,
} from './map/map-routes';

// Extend L namespace for heat layer
declare module 'leaflet' {
 function heatLayer(latlngs: Array<[number, number, number?]>, options?: {
 minOpacity?: number;
 maxZoom?: number;
 max?: number;
 radius?: number;
 blur?: number;
 gradient?: { [key: number]: string };
 }): L.Layer;
}

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
 iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
 iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
 shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Inline aliases for backward compatibility within this file
const calculateVisitRelevanceInline = calculateVisitRelevance;
const formatTimeAgoInline = formatTimeAgo;





export function LocationMap() {
 const mapRef = useRef<L.Map | null>(null);
 const mapContainerRef = useRef<HTMLDivElement>(null);
 const markersRef = useRef<Map<string, L.Marker>>(new Map());
 const locationsRef = useRef<Map<string, GeoLocation>>(new Map());
 const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);
 const tileLayerRef = useRef<L.TileLayer | null>(null);
 const homeMarkerRef = useRef<L.Marker | null>(null);
 const userLocationMarkerRef = useRef<L.Marker | null>(null);
 const userLocationCircleRef = useRef<L.Circle | null>(null);
 const prevLocationsCountRef = useRef<number>(0);
  const routeLayersRef = useRef<L.Layer[]>([]);
  const routeGroupRef = useRef<L.LayerGroup | null>(null);
   const advisorPreviewGroupRef = useRef<L.LayerGroup | null>(null);
   const journeyPreviewGroupRef = useRef<L.LayerGroup | null>(null);
 const prevFilterKeyRef = useRef<string>('');
 const [showZoomButton, setShowZoomButton] = useState(false);
 const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('vandits-map-view-mode') as ViewMode) || 'markers');
  const heatLayersRef = useRef<L.Layer[]>([]);
  const [heatmapZoomThreshold, setHeatmapZoomThreshold] = useState(() => parseInt(localStorage.getItem('vandits-heatmap-zoom-threshold') || '10'));
  const userViewModeRef = useRef<ViewMode>((() => (localStorage.getItem('vandits-map-view-mode') as ViewMode) || 'markers')());
 const [mapTheme, setMapTheme] = useState<MapTheme>('light');
  // showCenterSettings removed - now in UserProfileEditor
 const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
 
  // Measurement units preference
 const [measurementUnits, setMeasurementUnits] = useState<'metric' | 'imperial' | 'auto'>(() => {
 const stored = localStorage.getItem('geodata-measurement-units');
 return (stored as 'metric' | 'imperial' | 'auto') || 'metric';
 });
 
  // Map center config from database/localStorage
 const { config: mapCenterConfig, loading: mapCenterLoading } = useMapCenterConfig();
 
  // Track recently enriched locations for animation
 const [recentlyEnrichedIds, setRecentlyEnrichedIds] = useState<Set<string>>(new Set());
  // Track previous enrichment state: store description length to detect actual content changes
 const previousEnrichmentStateRef = useRef<Map<string, number>>(new Map());

  // Force marker refresh when the "Criterios de Actualización" change
 const [criteriaVersion, setCriteriaVersion] = useState(0);
 
  // Force update counter for realtime and store updates
 const [forceUpdateCount, setForceUpdateCount] = useState(0);
 
  // Map center config version to trigger re-centering
 const [centerConfigVersion, setCenterConfigVersion] = useState(0);

 useEffect(() => {
 const handleCriteriaChanged = () => setCriteriaVersion((v) => v + 1);
 const handleRealtimeUpdate = () => setForceUpdateCount((v) => v + 1);
 
    // Listen for toolbar map control events
  const handleViewModeChange = (e: Event) => {
  const mode = (e as CustomEvent).detail?.mode;
  if (mode === 'markers' || mode === 'heatmap' || mode === 'hybrid') {
  userViewModeRef.current = mode;
  setViewMode(mode);
  }
  };
  const handleHeatmapThresholdChange = (e: Event) => {
  const threshold = (e as CustomEvent).detail?.threshold;
  if (typeof threshold === 'number') setHeatmapZoomThreshold(threshold);
  };
 
 const handleGoHome = () => {
 if (mapRef.current && mapCenterConfig?.homeLocation) {
 mapRef.current.setView(
 [mapCenterConfig.homeLocation.lat, mapCenterConfig.homeLocation.lng],
 12,
 { animate: true }
 );
 toast.success(`Centrando en ${mapCenterConfig.homeLocation.name || 'ubicación base'}`);
 } else if (mapRef.current && locations.length > 0) {
        // Fallback: zoom to all locations
 const bounds = L.latLngBounds(locations.map(l => [l.coordinates.lat, l.coordinates.lng]));
 mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });
 }
 };
 
 const handleSetTheme = (e: Event) => {
 const customEvent = e as CustomEvent<{ theme: MapTheme }>;
 if (customEvent.detail?.theme) {
 setMapTheme(customEvent.detail.theme);
 }
 };
 
 const handleFitBounds = (e: Event) => {
 const customEvent = e as CustomEvent<{ 
 bounds: [[number, number], [number, number]];
 padding?: [number, number];
 maxZoom?: number;
 }>;
 if (customEvent.detail?.bounds && mapRef.current) {
 const { bounds, padding = [50, 50], maxZoom = 18 } = customEvent.detail;
 const latLngBounds = L.latLngBounds(
 [bounds[0][0], bounds[0][1]],
 [bounds[1][0], bounds[1][1]]
 );
 mapRef.current.fitBounds(latLngBounds, { 
 padding, 
 maxZoom,
 animate: true 
 });
 }
 };
 
 const handleMeasurementUnitsChanged = (e: Event) => {
 const customEvent = e as CustomEvent<{ units: 'metric' | 'imperial' | 'auto' }>;
 if (customEvent.detail?.units) {
 setMeasurementUnits(customEvent.detail.units);
 }
 };
 
    // Handler to refresh curator visibility zoom levels when settings change
 const handleCuratorVisibilityUpdate = () => {
 import('@/integrations/supabase/client').then(({ supabase }) => {
 supabase
 .from('curators')
 .select('id, min_visibility_zoom')
 .eq('is_active', true)
 .then(({ data }) => {
 if (data) {
 const zoomMap = new Map<string, number | null>();
 data.forEach(c => zoomMap.set(c.id, c.min_visibility_zoom));
 setCuratorVisibilityZooms(zoomMap);
 }
 });
 });
 };
 
 window.addEventListener('enrichment-criteria-changed', handleCriteriaChanged);
 window.addEventListener('location-realtime-update', handleRealtimeUpdate);
 window.addEventListener('store-updated', handleRealtimeUpdate);
 window.addEventListener('map-view-mode', handleViewModeChange);
 window.addEventListener('map-go-home', handleGoHome);
 window.addEventListener('map-set-theme', handleSetTheme);
 window.addEventListener('map-fit-bounds', handleFitBounds);
 window.addEventListener('curator-info-updated', handleRealtimeUpdate);
 window.addEventListener('curator-info-updated', handleCuratorVisibilityUpdate);
  window.addEventListener('measurement-units-changed', handleMeasurementUnitsChanged);
  window.addEventListener('heatmap-zoom-threshold-changed', handleHeatmapThresholdChange);
 
  let lastRouteSegCount = 0;

  const highlightSelectedRouteGroup = (groupId: string) => {
    (window as any).__selectedRouteGroup = groupId;

    routeLayersRef.current.forEach((layer: any) => {
      if (!layer._routeGroup || layer._baseOpacity == null || typeof layer.setStyle !== 'function') return;

      if (layer._routeGroup === groupId) {
        layer.setStyle({ opacity: 1, weight: layer._baseWeight + 2 });
      } else {
        layer.setStyle({ opacity: 0.15, weight: layer._baseWeight });
      }
    });
  };

  const dispatchRouteLayerSelection = (layer: any) => {
    if (layer._routeGroup) {
      highlightSelectedRouteGroup(layer._routeGroup);
    }

    if (layer._alternativeMode) {
      window.dispatchEvent(new CustomEvent('route-alternative-selected', {
        detail: { mode: layer._alternativeMode, label: layer._alternativeLabel },
      }));
      return;
    }

    if (layer._routeId) {
      window.dispatchEvent(new CustomEvent('map-route-selected', { detail: { routeId: layer._routeId } }));
      return;
    }
  };

  const handleMapRouteClick = (e: L.LeafletMouseEvent) => {
    if (!mapRef.current) return;

    const clickPoint = mapRef.current.latLngToContainerPoint(e.latlng);
    let bestAlternativeLayer: any = null;
    let bestAlternativeDistance = Infinity;
    let bestOtherLayer: any = null;
    let bestOtherDistance = Infinity;

    routeLayersRef.current.forEach((layer: any) => {
      const routeLayer = layer as any;
      if (!routeLayer || typeof routeLayer.closestLayerPoint !== 'function') return;
      if (!routeLayer._routeGroup && !routeLayer._alternativeMode && !routeLayer._routeId) return;

      const closestPoint = routeLayer.closestLayerPoint(clickPoint);
      if (!closestPoint) return;

      const distance = clickPoint.distanceTo(closestPoint);
      const hitTargetWeight = Number(routeLayer._hitTargetWeight || routeLayer._baseWeight || 0);
      const threshold = Math.max(hitTargetWeight / 2 + 4, 12);
      if (distance > threshold) return;

      if (routeLayer._alternativeMode) {
        if (distance < bestAlternativeDistance) {
          bestAlternativeDistance = distance;
          bestAlternativeLayer = routeLayer;
        }
        return;
      }

      if (distance < bestOtherDistance) {
        bestOtherDistance = distance;
        bestOtherLayer = routeLayer;
      }
    });

    const bestLayer = bestAlternativeLayer || bestOtherLayer;
    if (bestLayer) {
      dispatchRouteLayerSelection(bestLayer);
    }
  };

  const handleShowRoute = (e: Event) => {
  const segments = (e as CustomEvent).detail?.segments;
  const routeStops = (e as CustomEvent).detail?.stops as any[] | undefined;
       // Remove previous route layers — instant via LayerGroup
  if (routeGroupRef.current) {
    routeGroupRef.current.clearLayers();
  }
  routeLayersRef.current = [];
  
  const isNewRoute = !segments || segments.length !== lastRouteSegCount;
  lastRouteSegCount = segments?.length || 0;

   if (!segments || !Array.isArray(segments) || segments.length === 0 || !mapRef.current) return;
  
  // Ensure layer group exists
  if (!routeGroupRef.current) {
    routeGroupRef.current = L.layerGroup().addTo(mapRef.current);
  }
  
  const allBounds: L.LatLng[] = [];
  
    // Detect round trip robustly: either explicit return segments OR route ends near where it starts
    let firstPoint: L.LatLng | null = null;
    let finalPoint: L.LatLng | null = null;

    for (const seg of segments) {
     if (!seg.geometry?.coordinates || seg.geometry.coordinates.length === 0) continue;
     const firstCoord = seg.geometry.coordinates[0];
     firstPoint = L.latLng(firstCoord[1], firstCoord[0]);
     break;
    }

    for (let i = segments.length - 1; i >= 0; i--) {
     const seg = segments[i];
     if (!seg.geometry?.coordinates || seg.geometry.coordinates.length === 0) continue;
     const lastCoord = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
     finalPoint = L.latLng(lastCoord[1], lastCoord[0]);
     break;
    }

    const closesBackToOrigin = !!(firstPoint && finalPoint && firstPoint.distanceTo(finalPoint) < 2500);
    const isRoundTrip = segments.some((s: any) => s.isReturnLeg === true) || closesBackToOrigin;
    
    let turningPoint: L.LatLng | null = null;
    let turningStageNumber: number | null = null;
    let lastSegmentEndPoint: L.LatLng | null = finalPoint;
    
    // Group segments by stage for visual separation
    const segmentsByStage: Map<number, { seg: any; idx: number }[]> = new Map();
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (!seg.geometry?.coordinates) continue;
      const stageNum = seg.stageNumber || 1;
      if (!segmentsByStage.has(stageNum)) segmentsByStage.set(stageNum, []);
      segmentsByStage.get(stageNum)!.push({ seg, idx: si });
    }

    const stageKeys = Array.from(segmentsByStage.keys()).sort((a, b) => a - b);
    const stageSummaries = stageKeys.map((stageNum) => {
      const stageSegs = segmentsByStage.get(stageNum)!;
      let distance = 0;
      let endPoint: L.LatLng | null = null;

      for (const { seg } of stageSegs) {
        distance += Number(seg.distance || 0);
        const coords = seg.geometry.coordinates;
        if (coords?.length) {
          const lastCoord = coords[coords.length - 1];
          endPoint = L.latLng(lastCoord[1], lastCoord[0]);
        }
      }

      return {
        stageNumber: stageNum,
        distance,
        endPoint,
        explicitReturn: stageSegs[0]?.seg.isReturnLeg === true,
      };
    });

    if (isRoundTrip && stageSummaries.length > 0) {
      const totalRouteDistance = stageSummaries.reduce((sum, stage) => sum + stage.distance, 0);
      let cumulativeDistance = 0;
      let maxRouteDistanceFromOrigin = -1;

      for (const stage of stageSummaries) {
        cumulativeDistance += stage.distance;
        const routeDistanceFromOrigin = totalRouteDistance > 0
          ? Math.min(cumulativeDistance, totalRouteDistance - cumulativeDistance)
          : cumulativeDistance;

        if (routeDistanceFromOrigin > maxRouteDistanceFromOrigin && stage.endPoint) {
          maxRouteDistanceFromOrigin = routeDistanceFromOrigin;
          turningPoint = stage.endPoint;
          turningStageNumber = stage.stageNumber;
        }
      }

      if (!turningPoint) {
        const explicitReturnIdx = stageSummaries.findIndex((stage) => stage.explicitReturn);
        const fallbackStage = explicitReturnIdx > 0
          ? stageSummaries[explicitReturnIdx - 1]
          : stageSummaries[stageSummaries.length - 1];
        turningPoint = fallbackStage?.endPoint || null;
        turningStageNumber = fallbackStage?.stageNumber ?? null;
      }
    }

    // Draw each stage as a separate polyline group with gap markers between stages
    
    for (const stageNum of stageKeys) {
      const stageSegs = segmentsByStage.get(stageNum)!;
      
      for (const { seg } of stageSegs) {
        const rawCoords: L.LatLngExpression[] = seg.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
        
        const isFlightSeg = seg.transportMode === 'flight';
        const isFerrySeg = seg.transportMode === 'ferry';
        const coords = isFlightSeg && mapRef.current
          ? createFlightArcCoords(mapRef.current, rawCoords)
          : rawCoords;

        coords.forEach((c: any) => allBounds.push(L.latLng(c[0], c[1])));

        if (coords.length > 0) {
          const lc = coords[coords.length - 1] as any;
          lastSegmentEndPoint = L.latLng(lc[0] ?? lc.lat, lc[1] ?? lc.lng);
        }

        const isReturn = isRoundTrip && turningStageNumber !== null
          ? stageNum > turningStageNumber
          : seg.isReturnLeg === true;
        const defaultColor = isReturn ? '#e84d0e' : '#2563eb';
        const color = seg.routeColor || (isFlightSeg ? '#9333ea' : isFerrySeg ? '#0891b2' : defaultColor);

        if (coords.length > 0 && mapRef.current) {
          const isAlternative = seg.isAlternative === true;
          const isAltDrivingLeg = isAlternative && !isFlightSeg && !isFerrySeg;
          const baseWeight = isAlternative ? (isAltDrivingLeg ? 2.5 : 3) : isFlightSeg ? 3 : isReturn ? 3.5 : 4;
          const baseOpacity = isAlternative ? 0.55 : isFlightSeg ? 0.7 : isReturn ? 0.8 : 0.95;
          const altGroupId = seg.alternativeMode || seg.alternativeLabel || null;
          const segGroupId = isAlternative ? (altGroupId || `alt-${stageNum}`) : 'primary';

          // Wide near-invisible polyline for reliable hover/click capture
          const hitAreaWeight = Math.max(baseWeight + 14, 18);
          const hitArea = L.polyline(coords, {
            color,
            weight: hitAreaWeight,
            opacity: 0.01,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'leaflet-route-hit-area',
            interactive: true,
          }).addTo(routeGroupRef.current!);

          const polyline = L.polyline(coords, {
            color,
            weight: baseWeight,
            opacity: baseOpacity,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: isFlightSeg ? '6, 8' : isFerrySeg ? '4, 6' : isAltDrivingLeg ? '3, 5' : isReturn ? '8, 6' : undefined,
            interactive: true,
          }).addTo(routeGroupRef.current!);

          // Store metadata for group selection
          (polyline as any)._routeGroup = segGroupId;
          (polyline as any)._baseWeight = baseWeight;
          (polyline as any)._baseOpacity = baseOpacity;
          (polyline as any)._altLabel = isAlternative ? (seg.alternativeLabel || null) : null;
          (polyline as any)._alternativeMode = isAlternative ? (seg.alternativeMode || null) : null;
          (polyline as any)._alternativeLabel = isAlternative ? (seg.alternativeLabel || null) : null;
          (polyline as any)._routeId = seg.routeId || null;
          (polyline as any)._hitTargetWeight = hitAreaWeight;

          (hitArea as any)._routeGroup = segGroupId;
          (hitArea as any)._baseWeight = baseWeight;
          (hitArea as any)._baseOpacity = baseOpacity;
          (hitArea as any)._altLabel = isAlternative ? (seg.alternativeLabel || null) : null;
          (hitArea as any)._alternativeMode = isAlternative ? (seg.alternativeMode || null) : null;
          (hitArea as any)._alternativeLabel = isAlternative ? (seg.alternativeLabel || null) : null;
          (hitArea as any)._routeId = seg.routeId || null;
          (hitArea as any)._hitTargetWeight = hitAreaWeight;

          // Hover highlight for ALL routes
          const onMouseOver = () => {
            polyline.setStyle({ opacity: 1, weight: baseWeight + 3 });
            if (isAlternative && seg.alternativeLabel) {
              window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: seg.alternativeLabel } }));
            }
          };
          const onMouseOut = () => {
            if (isAlternative && seg.alternativeLabel) {
              window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: null } }));
            }
            const selected = (window as any).__selectedRouteGroup;
            if (selected && selected !== segGroupId) {
              polyline.setStyle({ opacity: 0.15, weight: baseWeight });
            } else if (selected === segGroupId) {
              polyline.setStyle({ opacity: 1, weight: baseWeight + 2 });
            } else {
              polyline.setStyle({ opacity: baseOpacity, weight: baseWeight });
            }
          };
          polyline.on('mouseover', onMouseOver);
          polyline.on('mouseout', onMouseOut);
          hitArea.on('mouseover', onMouseOver);
          hitArea.on('mouseout', onMouseOut);

          // Click to select this route group — dim all others + notify app
          const onRouteClick = (evt?: any) => {
            if (evt?.originalEvent) {
              L.DomEvent.stop(evt.originalEvent);
            }
            dispatchRouteLayerSelection(polyline as any);
          };
          polyline.on('click', onRouteClick);
          hitArea.on('click', onRouteClick);
          hitArea.bringToFront();
 
          if (isAlternative && seg.alternativeMode) {
            const altLabel = seg.alternativeLabel || seg.alternativeMode;
            polyline.bindTooltip(`${altLabel} — clic para seleccionar`, { sticky: true, direction: 'top' });
            hitArea.bindTooltip(`${altLabel} — clic para seleccionar`, { sticky: true, direction: 'top' });
          }
 
          routeLayersRef.current.push(hitArea);
 
          routeLayersRef.current.push(polyline);

          // Add transport mode icon at midpoint of flight/ferry arcs
          if ((isFlightSeg || isFerrySeg) && coords.length >= 2) {
            const midIdx = Math.floor(coords.length / 2);
            const midCoord = coords[midIdx] as any;
            const prevCoord = coords[Math.max(midIdx - 1, 0)] as any;
            const nextCoord = coords[Math.min(midIdx + 1, coords.length - 1)] as any;
            if (midCoord && prevCoord && nextCoord) {
              const midLat = midCoord[0] ?? midCoord.lat;
              const midLng = midCoord[1] ?? midCoord.lng;
              const bearing = calculateSegmentBearing(prevCoord, nextCoord);
              const iconKey = isFlightSeg ? 'plane' : 'ship';
              const rotation = isFlightSeg ? bearing - 90 : bearing - 90;
              const svgSize = isAlternative ? 14 : 18;
              const svgStr = getLucideSvgString(iconKey, { size: svgSize, color, strokeWidth: 2.5 });

              const modeIcon = L.divIcon({
                className: '',
                html: `<div style="
                  transform: rotate(${rotation}deg);
                  line-height: 1;
                  opacity: ${isAlternative ? '0.6' : '1'};
                  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
                ">${svgStr}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              });
              const marker = L.marker([midLat, midLng], { icon: modeIcon, interactive: isAlternative }).addTo(routeGroupRef.current!);
              if (isAlternative && seg.alternativeMode) {
                marker.on('click', () => {
                  window.dispatchEvent(new CustomEvent('route-alternative-selected', { detail: { mode: seg.alternativeMode, label: seg.alternativeLabel } }));
                });
              }
              routeLayersRef.current.push(marker);
            }
          }

          // Add port/airport endpoint markers for ferry/flight segments
          if ((isFlightSeg || isFerrySeg) && !isAlternative && coords.length >= 2) {
            const startCoord = rawCoords[0] as any;
            const endCoord = rawCoords[rawCoords.length - 1] as any;
            const startLat = startCoord[0] ?? startCoord.lat;
            const startLng = startCoord[1] ?? startCoord.lng;
            const endLat = endCoord[0] ?? endCoord.lat;
            const endLng = endCoord[1] ?? endCoord.lng;

            const iconKey = isFlightSeg ? 'plane' : 'anchor';
            const bgColor = isFlightSeg ? '#9333ea' : '#0891b2';
            const label = isFlightSeg ? 'Aeropuerto' : 'Puerto';

            // Start endpoint
            const startIcon = L.divIcon({
              className: '',
              html: getMapMarkerHtml(iconKey, bgColor, { size: 26, iconSize: 13 }),
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });
            const startMarker = L.marker([startLat, startLng], { icon: startIcon, interactive: true, zIndexOffset: 9100 }).addTo(routeGroupRef.current!);
            startMarker.bindTooltip(`${label} de salida`, { direction: 'top', offset: [0, -14] });
            routeLayersRef.current.push(startMarker);

            // End endpoint
            const endIcon = L.divIcon({
              className: '',
              html: getMapMarkerHtml(iconKey, bgColor, { size: 26, iconSize: 13 }),
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });
            const endMarker = L.marker([endLat, endLng], { icon: endIcon, interactive: true, zIndexOffset: 9100 }).addTo(routeGroupRef.current!);
            endMarker.bindTooltip(`${label} de llegada`, { direction: 'top', offset: [0, -14] });
            routeLayersRef.current.push(endMarker);
          }
        }
      }

      // Add stage label at midpoint of the stage
      if (stageKeys.length > 1 && mapRef.current) {
        // Collect all coords from this stage for the label position
        const allStageCoords: L.LatLngExpression[] = [];
        for (const { seg: s } of stageSegs) {
          if (s.geometry?.coordinates) {
            allStageCoords.push(...s.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as L.LatLngExpression));
          }
        }
        const isReturn = isRoundTrip && turningStageNumber !== null
          ? stageNum > turningStageNumber
          : stageSegs[0]?.seg.isReturnLeg === true;
        const stageColor = stageSegs[0]?.seg.routeColor || (isReturn ? '#e84d0e' : '#2563eb');

        if (allStageCoords.length > 0) {
          const midIdx = Math.floor(allStageCoords.length / 2);
          const midCoord = allStageCoords[midIdx] as any;
          if (midCoord) {
            const midPos = L.latLng(midCoord[0] ?? midCoord.lat, midCoord[1] ?? midCoord.lng);
            const labelIcon = L.divIcon({
              className: '',
              html: `<div style="
                display:flex;align-items:center;gap:2px;
                padding:1px 6px;border-radius:10px;
                background:${stageColor};color:white;
                font-size:9px;font-weight:700;
                white-space:nowrap;
                box-shadow:0 1px 3px rgba(0,0,0,0.3);
                border:1.5px solid white;
              ">${isReturn ? '↩' : '→'} E${stageNum}</div>`,
              iconSize: [40, 18],
              iconAnchor: [20, 9],
            });
            const labelMarker = L.marker(midPos, { icon: labelIcon, interactive: false, zIndexOffset: 8000 }).addTo(routeGroupRef.current!);
            routeLayersRef.current.push(labelMarker);
          }
        }
      }
    }

    // Draw junction markers between segments with names
    const drawnWaypointPositions: string[] = [];
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (seg.isAlternative) continue;
      if (!seg.geometry?.coordinates?.length) continue;
      
      // Draw start point of each segment (except first — that's origin)
      if (si > 0) {
        const startCoord = seg.geometry.coordinates[0];
        if (startCoord && startCoord.length >= 2) {
          const posKey = `${startCoord[1].toFixed(3)},${startCoord[0].toFixed(3)}`;
          if (!drawnWaypointPositions.includes(posKey)) {
            drawnWaypointPositions.push(posKey);
            const wpPos = L.latLng(startCoord[1], startCoord[0]);
            const junctionName = seg.fromName || `Punto ${si}`;
            
            // Determine icon based on transport mode transition
            const prevSeg = segments[si - 1];
            const isPort = prevSeg?.transportMode === 'ferry' || seg.transportMode === 'ferry';
            const isAirport = prevSeg?.transportMode === 'flight' || seg.transportMode === 'flight';
            const iconKey = isPort ? 'anchor' : isAirport ? 'plane' : 'map-pin';
            const bgColor = isPort ? '#0891b2' : isAirport ? '#9333ea' : 'hsl(var(--primary))';
            
            const wpIcon = L.divIcon({
              className: '',
              html: `<div style="
                display:flex;align-items:center;gap:3px;
                padding:2px 8px 2px 4px;border-radius:12px;
                background:${bgColor};color:white;
                font-size:9px;font-weight:600;
                white-space:nowrap;
                box-shadow:0 2px 6px rgba(0,0,0,0.3);
                border:2px solid white;
              ">${getLucideSvgString(iconKey, { size: 12, color: 'white', strokeWidth: 2.5 })} ${junctionName.length > 20 ? junctionName.slice(0, 18) + '…' : junctionName}</div>`,
              iconSize: [140, 22],
              iconAnchor: [12, 11],
            });
            if (mapRef.current) {
              const wpMarker = L.marker(wpPos, { icon: wpIcon, interactive: true, zIndexOffset: 8500 }).addTo(routeGroupRef.current!);
              wpMarker.bindTooltip(junctionName, { direction: 'top', offset: [0, -14] });
              routeLayersRef.current.push(wpMarker);
            }
          }
        }
      }
      
      // Draw end point of last segment (destination) — only if multimodal and last segment isn't the only one
      if (si === segments.filter(s => !s.isAlternative).length - 1 && seg.toName) {
        const endCoord = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
        if (endCoord && endCoord.length >= 2) {
          const posKey = `${endCoord[1].toFixed(3)},${endCoord[0].toFixed(3)}`;
          if (!drawnWaypointPositions.includes(posKey)) {
            drawnWaypointPositions.push(posKey);
          }
        }
      }
    }
    
    // Round trip → flag at the point with max real route distance from origin; One-way → final destination
    const flagPosition = isRoundTrip ? turningPoint : lastSegmentEndPoint;
   
   if (flagPosition && mapRef.current) {
    const flagIcon = L.divIcon({
     className: '',
     html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:36px;height:36px;border-radius:50%;
      background:#dc2626;border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      z-index:9999;
     ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
       <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
       <line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
     </div>`,
     iconSize: [36, 36],
     iconAnchor: [18, 18],
    });
    const marker = L.marker(flagPosition, { icon: flagIcon, interactive: false, zIndexOffset: 9999 }).addTo(routeGroupRef.current!);
    routeLayersRef.current.push(marker);
    }

    // Stage break markers (overnight/rest stops)
    const stageBreaks = (segments as any)._stageBreaks;
    if (stageBreaks && Array.isArray(stageBreaks) && mapRef.current) {
     for (const sb of stageBreaks) {
      const pos = sb.lat != null && sb.lng != null
        ? L.latLng(sb.lat, sb.lng)
        : (() => {
            const seg = segments[sb.segmentIndex];
            if (!seg?.geometry?.coordinates?.length) return null;
            const lastCoord = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
            return L.latLng(lastCoord[1], lastCoord[0]);
          })();
      if (!pos) continue;
      const hours = Math.round(sb.cumulativeDuration / 3600 * 10) / 10;
      const isReturn = isRoundTrip && turningStageNumber !== null
        ? sb.stageNumber > turningStageNumber
        : sb.isReturnLeg === true;
      const bgColor = isReturn ? '#ea580c' : '#f59e0b';
       const stageIcon = L.divIcon({
        className: '',
        html: getMapMarkerHtml('home', bgColor, { size: 28, iconSize: 14 }),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
       });
      const label = isReturn ? 'Vuelta' : 'Ida';
      const stageMarker = L.marker(pos, { icon: stageIcon, interactive: true, zIndexOffset: 9000 }).addTo(routeGroupRef.current!);
      stageMarker.bindTooltip(`Parada ${label} · Etapa ${sb.stageNumber} · ${hours}h conducción`, { direction: 'top', offset: [0, -16] });
      routeLayersRef.current.push(stageMarker);
     }
    }

    // Render persisted route stops (ports, airports, overnight, etc.)
    if (routeStops && Array.isArray(routeStops) && routeStops.length > 0 && mapRef.current) {
      const stopColors: Record<string, string> = {
        overnight: '#f59e0b',
        port: '#0891b2',
        airport: '#9333ea',
        refuel: '#ef4444',
        rest: '#22c55e',
        scenic: '#ec4899',
        custom: '#6b7280',
      };

      for (const stop of routeStops) {
        const pos = L.latLng(stop.latitude, stop.longitude);
        const color = stopColors[stop.stopType] || '#6b7280';
        const iconKey = getStopTypeIconKey(stop.stopType, stop.icon);
        allBounds.push(pos);

        const stopIcon = L.divIcon({
          className: '',
          html: getMapMarkerHtml(iconKey, color, { size: 32, iconSize: 16 }),
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const stopMarker = L.marker(pos, { icon: stopIcon, interactive: true, zIndexOffset: 9200 }).addTo(routeGroupRef.current!);
        const tooltipParts = [stop.name];
        if (stop.arrivalEstimate) tooltipParts.push(`Llegada: ${stop.arrivalEstimate}`);
        if (stop.departureEstimate) tooltipParts.push(`Salida: ${stop.departureEstimate}`);
        stopMarker.bindTooltip(tooltipParts.join(' · '), { direction: 'top', offset: [0, -18] });
        routeLayersRef.current.push(stopMarker);
      }
    }
  
   if (allBounds.length > 0 && mapRef.current && isNewRoute) {
   mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [60, 60], animate: true });
   }
  };
 
  const handleClearRoute = () => {
   if (routeGroupRef.current) {
     routeGroupRef.current.clearLayers();
   }
   routeLayersRef.current = [];
  };

  // ─── Advisor preview: approximate arcs for AI recommendation segments ───
  const handleShowAdvisorPreview = (e: Event) => {
    const { segments } = (e as CustomEvent).detail || {};
    if (!mapRef.current) return;

    // Ensure layer group exists
    if (!advisorPreviewGroupRef.current) {
      advisorPreviewGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }
    advisorPreviewGroupRef.current.clearLayers();

    if (!segments || !Array.isArray(segments) || segments.length === 0) return;

    const modeColors: Record<string, string> = {
      driving: '#3b82f6',
      car: '#3b82f6',
      camper_van: '#3b82f6',
      motorhome: '#3b82f6',
      ferry: '#0891b2',
      flight: '#9333ea',
      walking: '#22c55e',
      bicycle: '#f59e0b',
      train: '#6366f1',
    };

    const allBounds: L.LatLng[] = [];

    for (const seg of segments) {
      if (!seg.fromLat || !seg.toLat) continue;

      const from = L.latLng(seg.fromLat, seg.fromLng);
      const to = L.latLng(seg.toLat, seg.toLng);
      allBounds.push(from, to);

      // Generate arc points for visual appeal
      const numPoints = 30;
      const coords: L.LatLngExpression[] = [];
      for (let i = 0; i <= numPoints; i++) {
        const f = i / numPoints;
        const lat = seg.fromLat + (seg.toLat - seg.fromLat) * f;
        const lng = seg.fromLng + (seg.toLng - seg.fromLng) * f;
        coords.push([lat, lng]);
      }

      const modeKey = (seg.mode || 'driving').toLowerCase().replace(/[^a-z_]/g, '');
      const color = modeColors[modeKey] || '#6b7280';
      const isSea = modeKey === 'ferry' || modeKey === 'flight';

      const polyline = L.polyline(coords, {
        color,
        weight: 3.5,
        opacity: 0.7,
        dashArray: isSea ? '8, 8' : undefined,
        lineCap: 'round',
        interactive: false,
      }).addTo(advisorPreviewGroupRef.current!);

      // Add mode label at midpoint
      const midIdx = Math.floor(coords.length / 2);
      const midCoord = coords[midIdx] as [number, number];
      if (midCoord && seg.modeLabel) {
        const icon = L.divIcon({
          className: 'advisor-preview-label',
          html: `<div style="background:${color};color:white;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${seg.modeLabel}</div>`,
          iconAnchor: [0, 0],
        });
        L.marker(midCoord, { icon, interactive: false }).addTo(advisorPreviewGroupRef.current!);
      }
    }

    if (allBounds.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], animate: true });
    }
  };

  const handleClearAdvisorPreview = () => {
    if (advisorPreviewGroupRef.current) {
      advisorPreviewGroupRef.current.clearLayers();
    }
  };
 
  // ─── Journey preview: show day stage markers from AI journey planner ───
  const handleShowJourneyPreview = (e: Event) => {
    const { days } = (e as CustomEvent).detail || {};
    if (!mapRef.current) return;

    if (!journeyPreviewGroupRef.current) {
      journeyPreviewGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }
    journeyPreviewGroupRef.current.clearLayers();

    if (!days || !Array.isArray(days) || days.length === 0) return;

    const allBounds: L.LatLng[] = [];
    const dayColors = ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#9333ea', '#ec4899', '#0891b2', '#6366f1'];

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      if (!day.overnightLat || !day.overnightLng) continue;

      const pos = L.latLng(day.overnightLat, day.overnightLng);
      allBounds.push(pos);
      const color = dayColors[i % dayColors.length];

      const icon = L.divIcon({
        className: '',
        html: getMapMarkerHtml('moon', color, { size: 30, iconSize: 14 }),
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker(pos, { icon, interactive: true, zIndexOffset: 9500 })
        .addTo(journeyPreviewGroupRef.current!);
      
      const tooltipText = `Día ${day.dayNumber}: ${day.overnightStop || 'Pernocta'}`;
      marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -18] });
    }

    if (allBounds.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], maxZoom: 10, animate: true });
    }
  };

  const handleClearJourneyPreview = () => {
    if (journeyPreviewGroupRef.current) {
      journeyPreviewGroupRef.current.clearLayers();
    }
  };

   window.addEventListener('map-show-route', handleShowRoute);
   window.addEventListener('map-clear-route', handleClearRoute);
   window.addEventListener('map-show-advisor-preview', handleShowAdvisorPreview);
   window.addEventListener('map-clear-advisor-preview', handleClearAdvisorPreview);
   window.addEventListener('map-show-journey-preview', handleShowJourneyPreview);
   window.addEventListener('map-clear-journey-preview', handleClearJourneyPreview);
   mapRef.current?.on('click', handleMapRouteClick);

 // Hover highlight: when user hovers an alternative in the sidebar, highlight it on map
 const handleAlternativeHover = (e: Event) => {
   const label = (e as CustomEvent).detail?.label;
   routeLayersRef.current.forEach((layer: any) => {
     if (layer._routeGroup == null || layer._baseOpacity == null) return;
     if (!label) {
       // Reset all to defaults
       layer.setStyle({ opacity: layer._baseOpacity, weight: layer._baseWeight });
     } else if (layer._routeGroup === 'primary') {
       // Dim primary when hovering an alternative
       layer.setStyle({ opacity: 0.2, weight: layer._baseWeight });
     } else if (layer._altLabel === label) {
       // Highlight the hovered alternative
       layer.setStyle({ opacity: 1, weight: layer._baseWeight + 3 });
     } else {
       // Dim other alternatives
       layer.setStyle({ opacity: 0.15, weight: layer._baseWeight });
     }
   });
 };
 window.addEventListener('route-alternative-hover', handleAlternativeHover);

 const handleResetView = () => {
 if (!mapRef.current) return;
 if (locations.length > 0) {
 const bounds = L.latLngBounds(locations.map(l => [l.coordinates.lat, l.coordinates.lng]));
 mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });
 } else {
 mapRef.current.setView([20, 0], 3);
 }
 };
 window.addEventListener('map-reset-view', handleResetView);
 
  // Insert waypoint preview marker disabled
  const handleShowInsertPreview = () => {};
  const handleHideInsertPreview = () => {};

 return () => {
 window.removeEventListener('enrichment-criteria-changed', handleCriteriaChanged);
 window.removeEventListener('location-realtime-update', handleRealtimeUpdate);
 window.removeEventListener('store-updated', handleRealtimeUpdate);
 window.removeEventListener('map-view-mode', handleViewModeChange);
 window.removeEventListener('map-go-home', handleGoHome);
 window.removeEventListener('map-set-theme', handleSetTheme);
 window.removeEventListener('map-fit-bounds', handleFitBounds);
 window.removeEventListener('curator-info-updated', handleRealtimeUpdate);
 window.removeEventListener('curator-info-updated', handleCuratorVisibilityUpdate);
  window.removeEventListener('measurement-units-changed', handleMeasurementUnitsChanged);
  window.removeEventListener('heatmap-zoom-threshold-changed', handleHeatmapThresholdChange);
  window.removeEventListener('map-show-route', handleShowRoute);
  window.removeEventListener('map-clear-route', handleClearRoute);
   window.removeEventListener('map-show-advisor-preview', handleShowAdvisorPreview);
   window.removeEventListener('map-clear-advisor-preview', handleClearAdvisorPreview);
   window.removeEventListener('map-show-journey-preview', handleShowJourneyPreview);
   window.removeEventListener('map-clear-journey-preview', handleClearJourneyPreview);
 window.removeEventListener('map-reset-view', handleResetView);
 window.removeEventListener('route-alternative-hover', handleAlternativeHover);
  window.removeEventListener('map-show-insert-preview', handleShowInsertPreview);
  window.removeEventListener('map-hide-insert-preview', handleHideInsertPreview);
  
  mapRef.current?.off('click', handleMapRouteClick);
 };
 }, [mapCenterConfig]);

 const criteriaTimestamp = React.useMemo(() => loadCriteriaTimestamp(), [criteriaVersion]);
 const criteriaKey = React.useMemo(() => String(criteriaTimestamp), [criteriaTimestamp]);

  const { 
  selectedLocations, 
  toggleLocationSelection, 
  focusedLocationId,
  setFocusedLocation,
  setFilters,
  filters,
  selectedDocument,
  getLocationOwnership,
  documents, // Subscribe directly to documents for reactivity
  } = useLocationsStore();
  
  const locations = useFilteredLocations();
  
   // Get current user ID for ownership detection
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
   // Curator visibility zoom cache
  const [curatorVisibilityZooms, setCuratorVisibilityZooms] = useState<Map<string, number | null>>(new Map());
  
   // Get admin status for enrichment permissions (only master/admin can enrich)
  const { isAdmin } = usePermissions();
  const canEnrichLocations = isAdmin();
  
  useEffect(() => {
  import('@/integrations/supabase/client').then(({ supabase }) => {
  supabase.auth.getSession().then(({ data: { session } }) => {
  setCurrentUserId(session?.user?.id || null);
  });
  
       // Load all curators' visibility zoom levels
  supabase
  .from('curators')
  .select('id, min_visibility_zoom')
  .eq('is_active', true)
  .then(({ data }) => {
  if (data) {
  const zoomMap = new Map<string, number | null>();
  data.forEach(c => zoomMap.set(c.id, c.min_visibility_zoom));
  setCuratorVisibilityZooms(zoomMap);
  }
  });
  });
  }, []);
  // Compute allLocations from documents (reactive) instead of calling getAllLocations()
 const allLocations = React.useMemo(() => 
 documents.flatMap(doc => doc.locations), 
 [documents]
 );
 const totalLocations = allLocations.length;

  // Generate a key from current filters to detect changes
 const filterKey = JSON.stringify({
 continent: filters.continent,
 country: filters.country,
 region: filters.region,
 zone: filters.zone,
 tag: filters.tag,
 placeType: filters.placeType,
 onlyEnriched: filters.onlyEnriched,
 searchTerm: filters.searchTerm,
 });

  // Generate a key that changes when enrichment data OR criteria change
  // Use selectedDocument.locations to ensure we detect changes from the store
  // Also include forceUpdateCount to trigger updates from realtime/store events
 const enrichmentKey = React.useMemo(() => {
 if (!selectedDocument) return `${criteriaKey}-${forceUpdateCount}`;

 return selectedDocument.locations.reduce((acc, loc) => {
 const ed = loc.enrichedData;
 const cd = loc.customData;
      // Note: user_rating, user_image_url, and enriched imagen are excluded from this key
      // because these updates are handled in-place by their respective event handlers
      // (rating-updated, photo-updated). Including them here would cause full popup 
      // regeneration which loses scroll position and causes visual glitches.
 const signature = ed
 ? [
 ed.descripcion?.length || 0,
            // Note: ed.imagen is excluded - handled by photo-updated event
 ed.datos_clave?.web_referencia ? 1 : 0,
 ed.etiquetas?.length || 0,
 ed.datos_clave?.tipo ? 1 : 0,
 ed.datos_clave?.acceso ? 1 : 0,
 ed.datos_clave?.estado_proteccion ? 1 : 0,
 ed.clasificacion?.codigo || 'nc',
 loc.continent ? 1 : 0,
 loc.country ? 1 : 0,
 loc.region ? 1 : 0,
            // Include visited but NOT user_rating or user_image (handled in-place)
 cd?.visited || '0',
 ].join(':')
 : `orig:${loc.description?.length || 0}:${cd?.visited || '0'}`;

 return acc + loc.id.slice(0, 4) + signature;
 }, `${criteriaKey}-${selectedDocument.locations.length}-${forceUpdateCount}-`);
 }, [selectedDocument?.locations, criteriaKey, selectedDocument, forceUpdateCount]);

  // Zoom to bounds function - fits all points in view
  // zoomOffset: 0 = fit all, 1 = one level closer (outer points outside view)
 const zoomToBounds = useCallback((immediate: boolean = false, zoomOffset: number = 0) => {
 if (!mapRef.current || locations.length === 0) return;
 
 const bounds = L.latLngBounds(
 locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
 );
 
 if (immediate) {
      // Immediate fit without animation (for initial load)
 mapRef.current.fitBounds(bounds, { 
 padding: [50, 50], 
 maxZoom: 16,
 });
 
      // Apply zoom offset after fitting
 if (zoomOffset > 0) {
 const currentZoom = mapRef.current.getZoom();
 mapRef.current.setZoom(currentZoom + zoomOffset);
 }
 } else {
      // Animated fly for user interactions
 mapRef.current.flyToBounds(bounds, { 
 padding: [50, 50], 
 maxZoom: 16,
 duration: 0.8 
 });
 }
 
 setShowZoomButton(false);
 }, [locations]);

  // Apply map center based on user configuration
 const applyMapCenter = useCallback((immediate: boolean = true, config?: MapCenterConfig) => {
 if (!mapRef.current) return;
 
 const centerConfig = config || mapCenterConfig;
 console.log('Applying map center config:', centerConfig);
 
 if (centerConfig.mode === 'home' && centerConfig.homeLocation) {
      // Center on home location
 const { lat, lng } = centerConfig.homeLocation;
 if (immediate) {
 mapRef.current.setView([lat, lng], 12);
 } else {
 mapRef.current.flyTo([lat, lng], 12, { duration: 0.8 });
 }
      // Then zoom to show points with offset
 if (locations.length > 0) {
 setTimeout(() => zoomToBounds(immediate, 1), immediate ? 50 : 800);
 }
 } else if (centerConfig.mode === 'geolocation') {
      // Use GPS location
 if (navigator.geolocation) {
 navigator.geolocation.getCurrentPosition(
 (position) => {
 const { latitude, longitude } = position.coords;
 if (immediate) {
 mapRef.current?.setView([latitude, longitude], 12);
 } else {
 mapRef.current?.flyTo([latitude, longitude], 12, { duration: 0.8 });
 }
            // Then zoom to show points with offset
 if (locations.length > 0) {
 setTimeout(() => zoomToBounds(immediate, 1), immediate ? 50 : 800);
 }
 },
 (error) => {
 console.error('Geolocation error:', error);
 toast.error('No se pudo obtener tu ubicación GPS');
            // Fallback to auto
 if (locations.length > 0) {
 zoomToBounds(immediate, 1);
 }
 },
 { enableHighAccuracy: true, timeout: 10000 }
 );
 } else {
        // Fallback to auto
 if (locations.length > 0) {
 zoomToBounds(immediate, 1);
 }
 }
 } else {
      // Auto mode - zoom to show all points
 if (locations.length > 0) {
 zoomToBounds(immediate, 1);
 }
 }
 }, [locations, zoomToBounds, mapCenterConfig]);

  // Create home marker icon
 const createHomeMarkerIcon = useCallback(() => {
 return L.divIcon({
 className: 'home-marker-icon',
 html: `
 <div style="
 width: 24px;
 height: 24px;
 display: flex;
 align-items: center;
 justify-content: center;
 background: linear-gradient(135deg, hsl(142, 76%, 36%), hsl(142, 71%, 28%));
 border-radius: 50%;
 border: 2px solid white;
 box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
 ">
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
 <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
 <polyline points="9 22 9 12 15 12 15 22"/>
 </svg>
 </div>
 `,
 iconSize: [24, 24],
 iconAnchor: [12, 12],
 });
 }, []);

   // Create user location marker icon (static blue dot)
  const createUserLocationIcon = useCallback(() => {
  return L.divIcon({
  className: 'user-location-icon',
  html: `
  <div style="
  width: 14px;
  height: 14px;
  background: #3b82f6;
  border-radius: 50%;
  border: 3px solid white;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.5);
  "></div>
  `,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
 });
 }, []);

  // Get user's current location
 useEffect(() => {
 if (!navigator.geolocation) return;

 const watchId = navigator.geolocation.watchPosition(
 (position) => {
 setUserLocation({
 lat: position.coords.latitude,
 lng: position.coords.longitude,
 accuracy: position.coords.accuracy,
 });
 },
 (error) => {
 console.log('Geolocation error:', error.message);
 },
 {
 enableHighAccuracy: true,
 timeout: 10000,
 maximumAge: 30000,
 }
 );

 return () => navigator.geolocation.clearWatch(watchId);
 }, []);

  // Update user location marker
  useEffect(() => {
  if (!mapRef.current || !userLocation) return;

     // Remove existing markers
  if (userLocationMarkerRef.current) {
  mapRef.current.removeLayer(userLocationMarkerRef.current);
  }
  if (userLocationCircleRef.current) {
  mapRef.current.removeLayer(userLocationCircleRef.current);
  userLocationCircleRef.current = null;
  }

     // Small dot only, no accuracy circle
  const marker = L.marker([userLocation.lat, userLocation.lng], {
  icon: createUserLocationIcon(),
  zIndexOffset: 3000,
  });

  marker.bindPopup(`
 <div style="text-align: center; padding: 8px;">
 <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #3b82f6;">
 Tu ubicación
 </div>
 <div style="font-size: 11px; color: #6b7280;">
 ${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}
 </div>
 <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">
 Precisión: ±${Math.round(userLocation.accuracy)}m
 </div>
 </div>
 `);

 marker.addTo(mapRef.current);
 userLocationMarkerRef.current = marker;
 }, [userLocation, createUserLocationIcon]);

  // Update home marker when config changes
 useEffect(() => {
 if (!mapRef.current) return;

    // Remove existing home marker
 if (homeMarkerRef.current) {
 mapRef.current.removeLayer(homeMarkerRef.current);
 homeMarkerRef.current = null;
 }

    // Add new home marker if home mode is set
 if (mapCenterConfig.mode === 'home' && mapCenterConfig.homeLocation) {
 const { lat, lng, name } = mapCenterConfig.homeLocation;
 const homeMarker = L.marker([lat, lng], {
 icon: createHomeMarkerIcon(),
 zIndexOffset: 2000, // Above other markers
 });

 homeMarker.bindPopup(`
 <div style="text-align: center; padding: 8px;">
 <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
 ${name || 'Mi casa'}
 </div>
 <div style="font-size: 12px; color: #6b7280;">
 ${lat.toFixed(6)}, ${lng.toFixed(6)}
 </div>
 </div>
 `);

 homeMarker.addTo(mapRef.current);
 homeMarkerRef.current = homeMarker;
 }
 }, [mapCenterConfig, createHomeMarkerIcon]);

  // Auto-zoom when filters change OR on initial load
  // Ref to track if initial zoom has happened
 const initialZoomDoneRef = useRef(false);
 
 useEffect(() => {
    // Wait for map center config to load before applying initial center
 if (!mapRef.current || locations.length === 0 || mapCenterLoading) return;
 
 const filterChanged = prevFilterKeyRef.current !== filterKey;
 const isInitialLoad = !initialZoomDoneRef.current;
 
    // Auto-zoom on initial load OR when filters change
 if (isInitialLoad) {
      // Initial load - apply map center configuration
 setTimeout(() => {
 applyMapCenter(true, mapCenterConfig);
 initialZoomDoneRef.current = true;
 }, 100);
 } else if (filterChanged) {
      // Filter change (including search) - animated transition to fit all filtered results
 setTimeout(() => {
 zoomToBounds(false, 0);
 }, 150);
 }
 
 prevFilterKeyRef.current = filterKey;
 prevLocationsCountRef.current = locations.length;
 }, [filterKey, locations.length, zoomToBounds, applyMapCenter, mapCenterLoading, mapCenterConfig]);
 
  // Re-apply center when config changes (user saved new settings)
 useEffect(() => {
 if (centerConfigVersion > 0 && mapRef.current && !mapCenterLoading) {
      // Reload config and apply
 applyMapCenter(false);
 }
 }, [centerConfigVersion, applyMapCenter, mapCenterLoading]);

  // Show zoom button when user pans away
 useEffect(() => {
 if (!mapRef.current) return;
 
 const checkBounds = () => {
 if (!mapRef.current || locations.length === 0) return;
 
 const mapBounds = mapRef.current.getBounds();
 const locationsInView = locations.filter(loc => 
 mapBounds.contains([loc.coordinates.lat, loc.coordinates.lng])
 );
 
      // Show button if less than 50% of locations are in view
 setShowZoomButton(locationsInView.length < locations.length * 0.5);
 };
 
 mapRef.current.on('moveend', checkBounds);
 
 return () => {
 mapRef.current?.off('moveend', checkBounds);
 };
 }, [locations]);

  // Handle filter link clicks from popups
 useEffect(() => {
 const handleFilterClick = (e: MouseEvent) => {
 const target = e.target as HTMLElement;
 if (target.classList.contains('filter-link')) {
 e.preventDefault();
 e.stopPropagation();
 
 const filterType = target.dataset.filterType as 'zone' | 'region' | 'country' | 'continent' | 'searchTerm' | 'tag';
 const filterValue = target.dataset.filterValue;
 
 if (filterType && filterValue) {
 if (filterType === 'searchTerm') {
            // When clicking on a hashtag/classification, clear ALL other filters to prevent zero results
 setFilters({ 
 searchTerm: filterValue,
              // Clear all other filters
 continent: undefined,
 country: undefined,
 region: undefined,
 zone: undefined,
 tag: undefined,
 classificationCode: undefined,
 placeType: undefined,
 });
 } else if (filterType === 'tag') {
            // Clear all geography and other filters when filtering by tag (inverse filter)
 setFilters({ 
 tag: filterValue,
 continent: undefined,
 country: undefined,
 region: undefined,
 zone: undefined,
 searchTerm: undefined,
 classificationCode: undefined,
 });
 } else if (filterType === 'continent') {
            // Clear children when setting continent
 setFilters({ ...filters, continent: filterValue, country: undefined, region: undefined, zone: undefined });
 } else if (filterType === 'country') {
            // Clear children when setting country
 setFilters({ ...filters, country: filterValue, region: undefined, zone: undefined });
 } else if (filterType === 'region') {
            // Clear children when setting region
 setFilters({ ...filters, region: filterValue, zone: undefined });
 } else {
 setFilters({ ...filters, [filterType]: filterValue });
 }
 }
 }
 };

 document.addEventListener('click', handleFilterClick);
 return () => document.removeEventListener('click', handleFilterClick);
 }, [setFilters, filters]);

  // Handle popup action button clicks
 useEffect(() => {
 const handleActionClick = (e: MouseEvent) => {
 const target = e.target as HTMLElement;
 const button = target.closest('.popup-action-btn') as HTMLElement | null;
 
 if (button) {
 e.preventDefault();
 e.stopPropagation();
 
 const action = button.dataset.action;
 const locationId = button.dataset.locationId;
 const rating = button.dataset.rating;
 const locationName = button.dataset.locationName;
 
 if (action && locationId) {
          // Dispatch custom event that will be handled by the app
 window.dispatchEvent(new CustomEvent('popup-action', {
 detail: { action, locationId, rating, locationName }
 }));
 }
 }
 
      // Handle tech toggle button
 const toggleBtn = target.closest('.popup-toggle-tech') as HTMLElement | null;
 if (toggleBtn) {
 e.preventDefault();
 e.stopPropagation();
 
 const popupId = toggleBtn.dataset.popupId;
 if (popupId) {
 const content = document.querySelector(`.tech-content[data-popup-id="${popupId}"]`) as HTMLElement;
 const arrow = toggleBtn.querySelector('.toggle-arrow') as HTMLElement;
 
 if (content) {
 const isHidden = content.style.display === 'none';
 content.style.display = isHidden ? 'block' : 'none';
 if (arrow) {
 arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
 }
 }
 }
 }
 
      // Handle original description toggle button
 const toggleOriginalBtn = target.closest('.popup-toggle-original') as HTMLElement | null;
 if (toggleOriginalBtn) {
 e.preventDefault();
 e.stopPropagation();
 
 const popupId = toggleOriginalBtn.dataset.popupId;
 if (popupId) {
 const content = document.querySelector(`.original-content[data-popup-id="${popupId}"]`) as HTMLElement;
 const arrow = toggleOriginalBtn.querySelector('.toggle-arrow-original') as HTMLElement;
 
 if (content) {
 const isHidden = content.style.display === 'none';
 content.style.display = isHidden ? 'block' : 'none';
 if (arrow) {
 arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
 }
 }
 }
 }
 
      // Handle community validation toggle button
 const toggleCommunityBtn = target.closest('.popup-toggle-community') as HTMLElement | null;
 if (toggleCommunityBtn) {
 e.preventDefault();
 e.stopPropagation();
 
 const popupId = toggleCommunityBtn.dataset.popupId;
 if (popupId) {
 const content = document.querySelector(`.community-content[data-popup-id="${popupId}"]`) as HTMLElement;
 const arrow = toggleCommunityBtn.querySelector('.toggle-arrow-community') as HTMLElement;
 
 if (content) {
 const isHidden = content.style.display === 'none';
 content.style.display = isHidden ? 'block' : 'none';
 if (arrow) {
 arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
 }
 
            // When opening, load reviews and check distance
 if (isHidden) {
 const locationId = content.dataset.locationId;
 const curatorId = content.dataset.curatorId;
 if (locationId) {
 loadCommunityReviews(locationId, curatorId || '');
 }
 }
 }
 }
 }
 
      // Handle community rating star clicks
 const ratingStar = target.closest('.community-rating-star') as HTMLElement | null;
 if (ratingStar) {
 e.preventDefault();
 e.stopPropagation();
 
 const rating = parseInt(ratingStar.dataset.rating || '0');
 const container = ratingStar.closest('.community-rating-input') as HTMLElement;
 if (container) {
 container.dataset.selectedRating = String(rating);
 const stars = container.querySelectorAll('.community-rating-star');
 stars.forEach((star, idx) => {
 (star as HTMLElement).textContent = idx < rating ? '' : '';
 (star as HTMLElement).style.color = idx < rating ? '#f59e0b' : '#d1d5db';
 });
 }
 }
 
      // Handle community review submit
 const submitBtn = target.closest('[data-action="submit-community-review"]') as HTMLElement | null;
 if (submitBtn) {
 e.preventDefault();
 e.stopPropagation();
 
 const locationId = submitBtn.dataset.locationId;
 if (locationId) {
 submitCommunityReview(locationId);
 }
 }
 };

 document.addEventListener('click', handleActionClick);
 return () => document.removeEventListener('click', handleActionClick);
 }, []);

  // Handle notes-updated event to refresh popup
 useEffect(() => {
 const handleNotesUpdated = (e: Event) => {
 const customEvent = e as CustomEvent<{ locationId: string; notes: string; visibility: string }>;
 const { locationId } = customEvent.detail;
 
      // Find the marker and refresh its popup
 const marker = markersRef.current.get(locationId);
 const location = locationsRef.current.get(locationId);
 
 if (marker && location) {
        // Update the location's customData locally for immediate UI feedback
 const updatedLocation = {
 ...location,
 customData: {
 ...location.customData,
 has_notes: 'true',
 }
 };
 locationsRef.current.set(locationId, updatedLocation);
 
        // Regenerate popup content with ownership info
 const ownership = getLocationOwnership(locationId, currentUserId);
 marker.setPopupContent(createPopupContent(updatedLocation, criteriaTimestamp, ownership, canEnrichLocations));
 
        // Reopen popup if it was open
 if (marker.isPopupOpen()) {
 marker.openPopup();
 }
 }
 };

 window.addEventListener('notes-updated', handleNotesUpdated);
 return () => window.removeEventListener('notes-updated', handleNotesUpdated);
 }, [criteriaTimestamp, getLocationOwnership, currentUserId, canEnrichLocations]);

  // Handle photo-updated event to refresh popup after photo upload/delete
 useEffect(() => {
 const handlePhotoUpdated = (e: Event) => {
 const customEvent = e as CustomEvent<{ locationId: string; imageUrl: string | null; visibility?: string | null; isDefaultImage?: boolean }>;
 const { locationId, imageUrl, visibility, isDefaultImage } = customEvent.detail;
 
      // Find the marker and refresh its popup
 const marker = markersRef.current.get(locationId);
 const location = locationsRef.current.get(locationId);
 
 if (marker && location) {
 let updatedLocation = { ...location };
 
 if (isDefaultImage && imageUrl) {
          // Admin set official image - update enrichedData
 const currentEnriched = location.enrichedData || {} as any;
 updatedLocation = {
 ...location,
 enrichedData: {
 ...currentEnriched,
 imagen: imageUrl,
 } as any,
 };
 } else {
          // User's personal image - update customData
 const updatedCustomData = { ...location.customData };
 if (imageUrl) {
 updatedCustomData.user_image_url = imageUrl;
 updatedCustomData.user_image_visibility = visibility || 'private';
 } else {
 delete updatedCustomData.user_image_url;
 delete updatedCustomData.user_image_visibility;
 }
 
 updatedLocation = {
 ...location,
 customData: Object.keys(updatedCustomData).length ? updatedCustomData : undefined,
 };
 }
 
 locationsRef.current.set(locationId, updatedLocation);
 
        // Regenerate popup content with ownership info
 const ownership = getLocationOwnership(locationId, currentUserId);
 marker.setPopupContent(createPopupContent(updatedLocation, criteriaTimestamp, ownership, canEnrichLocations));
 
        // Reopen popup if it was open
 if (marker.isPopupOpen()) {
 marker.openPopup();
 }
 }
 };

 window.addEventListener('photo-updated', handlePhotoUpdated);
 return () => window.removeEventListener('photo-updated', handlePhotoUpdated);
 }, [criteriaTimestamp, getLocationOwnership, currentUserId, canEnrichLocations]);

  // Handle visited-updated event to update popup elements in-place (without full regeneration)
 useEffect(() => {
 const upsertRatingUi = (parent: HTMLElement, locationId: string, ratingValue: number, allowRating: boolean) => {
 const starButtons = Array.from(
 parent.querySelectorAll(`button[data-action="set-rating"][data-location-id="${locationId}"]`)
 ) as HTMLButtonElement[];

 const hasStars = starButtons.length > 0;
 const currentRating = Number.isFinite(ratingValue) ? ratingValue : 0;

 if (!allowRating && hasStars) {
 const container = starButtons[0]?.parentElement as HTMLElement | null;
 if (container) container.remove();
 return;
 }

 if (allowRating && !hasStars) {
 const starsHtml = `
 <div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal">
 ${[1, 2, 3, 4, 5]
 .map(
 (star) => `
 <button 
 class="popup-action-btn" 
 data-action="set-rating" 
 data-location-id="${locationId}"
 data-rating="${star}"
 style="background: none; border: none; padding: 0; cursor: pointer; font-size: 14px; transition: transform 0.1s; color: ${currentRating >= star ? '#f59e0b' : '#d1d5db'};"
 title="Valorar ${star} estrella${star > 1 ? 's' : ''}"
 >${currentRating >= star ? '' : ''}</button>
 `
 )
 .join('')}
 ${currentRating > 0 ? `
 <button 
 class="popup-action-btn" 
 data-action="clear-rating" 
 data-location-id="${locationId}"
 style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
 title="Quitar valoración"
 ></button>
 ` : ''}
 </div>
 `;

 const visitedBtn = parent.querySelector(
 `[data-action="toggle-visited"][data-location-id="${locationId}"]`
 ) as HTMLElement | null;
 visitedBtn?.insertAdjacentHTML('afterend', starsHtml);
 return;
 }

 if (hasStars) {
        // Update star fill
 starButtons.forEach((btn) => {
 const star = Number(btn.getAttribute('data-rating') || '0');
 const filled = currentRating >= star;
 btn.textContent = filled ? '' : '';
 btn.style.color = filled ? '#f59e0b' : '#d1d5db';
 });

        // Update clear button
 const clearBtn = parent.querySelector(
 `button[data-action="clear-rating"][data-location-id="${locationId}"]`
 ) as HTMLButtonElement | null;

 if (currentRating > 0 && !clearBtn) {
 starButtons[starButtons.length - 1]?.insertAdjacentHTML(
 'afterend',
 `
 <button 
 class="popup-action-btn" 
 data-action="clear-rating" 
 data-location-id="${locationId}"
 style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
 title="Quitar valoración"
 ></button>
 `
 );
 }

 if (currentRating === 0 && clearBtn) {
 clearBtn.remove();
 }
 }
 };

 const handleVisitedUpdated = (e: Event) => {
 const customEvent = e as CustomEvent<{
 locationId: string;
 visited: boolean;
 distance?: number;
 customData?: Record<string, unknown>;
 }>;
 const { locationId, visited, customData } = customEvent.detail;

 const visitedBtn = document.querySelector(
 `[data-action="toggle-visited"][data-location-id="${locationId}"]`
 ) as HTMLElement | null;

      // Update the location ref for future popup regenerations
 const location = locationsRef.current.get(locationId);
 const newCustomData: Record<string, string> = customData
 ? Object.fromEntries(Object.entries(customData).map(([k, v]) => [k, String(v)]))
 : {
 ...(location?.customData || {}),
 visited: visited ? 'true' : 'false',
 };

 if (location) {
 locationsRef.current.set(locationId, {
 ...location,
 customData: newCustomData,
 updatedAt: new Date(),
 });
 }

 if (!visitedBtn) return;

      // Update visited button styles
 visitedBtn.style.background = visited ? '#dcfce7' : '#fff';
 visitedBtn.style.color = visited ? '#166534' : '#6b7280';
 visitedBtn.style.borderColor = visited ? '#86efac' : '#e5e7eb';
 visitedBtn.title = visited ? 'Click para desmarcar' : 'Marcar como visitado';

 const svg = visitedBtn.querySelector('svg');
 if (svg) svg.setAttribute('fill', visited ? 'currentColor' : 'none');

      // Update rating UI (show/hide + fill) without regenerating popup
 const parent = visitedBtn.parentElement as HTMLElement | null;
 if (parent) {
 const ratingValue = parseInt(newCustomData.user_rating || '0') || 0;
 const allowRating =
 canEnrichLocations ||
 !!newCustomData.visited_verified_at ||
 !!newCustomData.oldest_geotagged_photo_date;

 upsertRatingUi(parent, locationId, ratingValue, allowRating);
 }
 };

 window.addEventListener('visited-updated', handleVisitedUpdated);
 return () => window.removeEventListener('visited-updated', handleVisitedUpdated);
 }, [canEnrichLocations]);

  // Handle rating-updated event to update stars in-place (without full regeneration)
 useEffect(() => {
 const handleRatingUpdated = (e: Event) => {
 const customEvent = e as CustomEvent<{
 locationId: string;
 rating: string;
 customData?: Record<string, unknown>;
 }>;
 const { locationId, rating, customData } = customEvent.detail;

 const ratingValue = parseInt(rating || '0') || 0;

      // Update stars (if visible)
 const starButtons = Array.from(
 document.querySelectorAll(`button[data-action="set-rating"][data-location-id="${locationId}"]`)
 ) as HTMLButtonElement[];

 starButtons.forEach((btn) => {
 const star = Number(btn.getAttribute('data-rating') || '0');
 const filled = ratingValue >= star;
 btn.textContent = filled ? '' : '';
 btn.style.color = filled ? '#f59e0b' : '#d1d5db';
 });

      // Toggle clear button
 const parent = starButtons[0]?.parentElement as HTMLElement | undefined;
 if (parent) {
 const clearBtn = parent.querySelector(
 `button[data-action="clear-rating"][data-location-id="${locationId}"]`
 ) as HTMLButtonElement | null;

 if (ratingValue > 0 && !clearBtn) {
 starButtons[starButtons.length - 1]?.insertAdjacentHTML(
 'afterend',
 `
 <button 
 class="popup-action-btn" 
 data-action="clear-rating" 
 data-location-id="${locationId}"
 style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
 title="Quitar valoración"
 ></button>
 `
 );
 }

 if (ratingValue === 0 && clearBtn) {
 clearBtn.remove();
 }
 }

      // Update location ref
 const location = locationsRef.current.get(locationId);
 if (location) {
 const cd = customData
 ? Object.fromEntries(Object.entries(customData).map(([k, v]) => [k, String(v)]))
 : { ...(location.customData || {}), user_rating: rating || '' };

 locationsRef.current.set(locationId, {
 ...location,
 customData: cd,
 updatedAt: new Date(),
 });
 }
 };

 window.addEventListener('rating-updated', handleRatingUpdated);
 return () => window.removeEventListener('rating-updated', handleRatingUpdated);
 }, []);

 useEffect(() => {
 if (!mapContainerRef.current || mapRef.current) return;

    // Define world bounds to prevent map from repeating
 const worldBounds = L.latLngBounds(
 L.latLng(-85, -180), // Southwest corner
 L.latLng(85, 180) // Northeast corner
 );

 mapRef.current = L.map(mapContainerRef.current, {
 center: [20, 0],
 zoom: 2,
 minZoom: 2, // Prevent zooming out too far
 maxBounds: worldBounds,
 maxBoundsViscosity: 1.0, // Completely restrict panning outside bounds
 scrollWheelZoom: true,
 worldCopyJump: false, // Prevent world from wrapping
 });

    // Add tile layer
 const tileConfig = MAP_TILE_LAYERS[mapTheme];
 tileLayerRef.current = L.tileLayer(tileConfig.url, {
 attribution: tileConfig.attribution,
 maxZoom: 19,
 noWrap: true, // Prevent tiles from repeating
 }).addTo(mapRef.current);

    // Scale control removed - using custom MapScaleBar component instead

    // Initialize marker cluster group
 markerClusterRef.current = L.markerClusterGroup({
 maxClusterRadius: 50,
 spiderfyOnMaxZoom: true,
 showCoverageOnHover: false,
 zoomToBoundsOnClick: true,
 disableClusteringAtZoom: 16,
 chunkedLoading: true,
 iconCreateFunction: (cluster) => {
 const count = cluster.getChildCount();
 let size = 'small';
 if (count > 50) size = 'large';
 else if (count > 10) size = 'medium';
 
 return L.divIcon({
 html: `<div><span>${count}</span></div>`,
 className: `marker-cluster marker-cluster-${size}`,
 iconSize: L.point(40, 40),
 });
 },
 });

    // Cluster layer not added by default anymore

 return () => {
 if (mapRef.current) {
 mapRef.current.remove();
 mapRef.current = null;
 }
 };
 }, []);

  // Update tile layer when theme changes
 useEffect(() => {
 if (!mapRef.current || !tileLayerRef.current) return;
 
 const tileConfig = MAP_TILE_LAYERS[mapTheme];
 tileLayerRef.current.setUrl(tileConfig.url);
 }, [mapTheme]);

  // Track pending popup to open after marker updates
 const pendingPopupRef = useRef<string | null>(null);

  // Only recreate markers when location list changes (add/remove), not on enrichment updates
 const locationIds = React.useMemo(() => locations.map(l => l.id).sort().join(','), [locations]);
 
 useEffect(() => {
 if (!mapRef.current || !markerClusterRef.current) return;

    // Clear existing markers from map
 markersRef.current.forEach(marker => marker.remove());
 markersRef.current.clear();
 locationsRef.current.clear();

 if (locations.length === 0) return;

 const markersToAdd: L.Marker[] = [];

    // Add new markers
 locations.forEach((location) => {
 const isSelected = selectedLocations.has(location.id);
 const isFocused = focusedLocationId === location.id;
 const isEnriched = !!location.enrichedData;
 const ownership = getLocationOwnership(location.id, currentUserId);

 const marker = L.marker([location.coordinates.lat, location.coordinates.lng], {
 icon: createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, false, ownership.isOwn, { ownerName: ownership.ownerName, ownerId: ownership.ownerId, curatorId: ownership.curatorId, curatorIcon: ownership.curatorIcon, curatorColor: ownership.curatorColor }),
 });

      // Create popup with content including ownership info
 const popupContent = createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations);
 marker.bindPopup(popupContent, {
 maxWidth: 380,
 minWidth: 280,
 className: 'custom-popup',
 closeButton: true,
 autoPan: true,
 autoPanPadding: L.point(50, 50),
 });

 marker.on('click', function (this: L.Marker) {
 this.openPopup();
 
        // Wait for popup to render, then pan to center it vertically
 setTimeout(() => {
 const map = mapRef.current;
 if (!map) return;
 
 const popup = this.getPopup();
 if (!popup || !popup.isOpen()) return;
 
          // Get popup element and its actual height
 const popupElement = popup.getElement();
 if (!popupElement) return;
 
 const popupRect = popupElement.getBoundingClientRect();
 const popupHeight = popupRect.height;
 
          // Get map container dimensions
 const container = map.getContainer();
 const containerRect = container.getBoundingClientRect();
 const viewportHeight = containerRect.height;
 
          // Get marker position in container coordinates
 const markerLatLng = this.getLatLng();
 const markerPoint = map.latLngToContainerPoint(markerLatLng);
 
          // The popup appears ABOVE the marker
          // We want the popup to be vertically centered in the viewport
          // So the marker should be positioned at: viewportCenter + popupHeight/2
 const idealMarkerY = (viewportHeight / 2) + (popupHeight / 2);
 
          // Calculate how much to pan
 const offsetY = markerPoint.y - idealMarkerY;
 
          // Only pan if the offset is significant
 if (Math.abs(offsetY) > 30) {
 map.panBy([0, offsetY], { animate: true, duration: 0.35 });
 }
 }, 100);
 });

 marker.on('dblclick', () => {
 toggleLocationSelection(location.id);
 });

 marker.on('popupclose', () => {
 if (focusedLocationId === location.id) {
 setFocusedLocation(null);
 }
 });

 markersRef.current.set(location.id, marker);
 locationsRef.current.set(location.id, location);
 
      // Add marker to map — hide if heat is currently visible
 marker.addTo(mapRef.current!);
 const currentMode = userViewModeRef.current;
 if ((currentMode === 'heatmap' || currentMode === 'hybrid') && heatVisibleRef.current) {
   // In heatmap mode hide all; in hybrid show own markers only
   const shouldShow = currentMode === 'hybrid' && ownership.isOwn;
   marker.setOpacity(shouldShow ? 1 : 0);
 }
 });

    // Fit bounds only on initial load
 if (locations.length > 0 && prevLocationsCountRef.current === 0) {
 const bounds = L.latLngBounds(
 locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
 );
 mapRef.current.fitBounds(bounds, { 
 padding: [50, 50], 
 maxZoom: 12 
 });
 }
 }, [locationIds, toggleLocationSelection, setFocusedLocation, viewMode]);

  // Cache marker ownership to avoid recalculating on every zoom toggle
  const markerOwnershipRef = useRef<Map<string, boolean>>(new Map());
  const heatVisibleRef = useRef(true);

  // Build heat layers when locations change (expensive, runs rarely)
  useEffect(() => {
    if (!mapRef.current) return;
    const userMode = userViewModeRef.current;

    // Clear old layers
    heatLayersRef.current.forEach(layer => {
      if (mapRef.current?.hasLayer(layer)) mapRef.current.removeLayer(layer);
    });
    heatLayersRef.current = [];
    markerOwnershipRef.current.clear();

    if (userMode !== 'heatmap' && userMode !== 'hybrid') {
      markersRef.current.forEach(marker => marker.setOpacity(1));
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
      const data: [number, number, number][] = locs.map(l => [l.coordinates.lat, l.coordinates.lng, intensity]);
      return L.heatLayer(data, { radius, blur, maxZoom: 18, max, minOpacity: 0.4, gradient });
    };

    // Pre-cache ownership and group locations by owner for heat layers
    const groups = new Map<string, GeoLocation[]>();
    locations.forEach(loc => {
      const ownership = getLocationOwnership(loc.id, currentUserId);
      markerOwnershipRef.current.set(loc.id, ownership.isOwn);
      const key = ownership.isOwn ? '_own' : (ownership.curatorId || ownership.ownerId || '_unknown');
      const arr = groups.get(key) || [];
      arr.push(loc);
      groups.set(key, arr);
    });

    // Default gradient for own locations
    const ownGradient: Record<number, string> = {
      0.0: '#60a5fa', 0.2: '#22c55e', 0.4: '#84cc16',
      0.6: '#eab308', 0.8: '#f97316', 1.0: '#dc2626'
    };

    groups.forEach((locs, ownerId) => {
      const gradient = ownerId === '_own' ? ownGradient : hueToGradient(getUserHue(ownerId));
      const layer = createHeatLayer(locs, gradient);
      if (layer) heatLayersRef.current.push(layer);
    });

    // Apply initial visibility based on zoom threshold
    const zoom = mapRef.current.getZoom();
    const showHeat = zoom < heatmapZoomThreshold;
    heatVisibleRef.current = showHeat;

    if (showHeat) {
      heatLayersRef.current.forEach(layer => layer.addTo(mapRef.current!));
      // In heatmap mode hide all; in hybrid show own markers
      markersRef.current.forEach((marker, id) => {
        marker.setOpacity(userMode === 'hybrid' && markerOwnershipRef.current.get(id) ? 1 : 0);
      });
    } else {
      markersRef.current.forEach(marker => marker.setOpacity(1));
    }
  }, [locations, getLocationOwnership, currentUserId, viewMode]);

  // Lightweight zoom toggle — just show/hide cached layers, no recreation
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const onZoom = () => {
      const userMode = userViewModeRef.current;
      if (userMode !== 'hybrid' && userMode !== 'heatmap') return;
      if (heatLayersRef.current.length === 0) return;

      // Both heatmap and hybrid: toggle based on zoom threshold
      const shouldShowHeat = map.getZoom() < heatmapZoomThreshold;
      if (shouldShowHeat === heatVisibleRef.current) return;
      heatVisibleRef.current = shouldShowHeat;

      if (shouldShowHeat) {
        heatLayersRef.current.forEach(layer => {
          if (!map.hasLayer(layer)) layer.addTo(map);
        });
        // In heatmap mode hide all markers; in hybrid show own markers
        markersRef.current.forEach((marker, id) => {
          marker.setOpacity(userMode === 'hybrid' && markerOwnershipRef.current.get(id) ? 1 : 0);
        });
      } else {
        heatLayersRef.current.forEach(layer => {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        });
        markersRef.current.forEach(marker => marker.setOpacity(1));
      }
    };

    map.on('zoomend', onZoom);
    return () => { map.off('zoomend', onZoom); };
  }, [heatmapZoomThreshold]);

  // React to user changing viewMode from toolbar
  useEffect(() => {
    if (!mapRef.current) return;
    userViewModeRef.current = viewMode;
    if (viewMode === 'markers') {
      heatLayersRef.current.forEach(layer => {
        if (mapRef.current?.hasLayer(layer)) mapRef.current.removeLayer(layer);
      });
      heatLayersRef.current = [];
      markersRef.current.forEach(marker => marker.setOpacity(1));
    }
  }, [viewMode]);

  // Update popup content and icons when enrichment data changes (without recreating markers)
 useEffect(() => {
 if (!mapRef.current) return;
 
 locations.forEach(location => {
 const marker = markersRef.current.get(location.id);
 if (!marker) return;
 
      // Verify location has valid data before updating popup
 if (!location || !location.id) return;
 
      // Update the stored location reference
 locationsRef.current.set(location.id, location);
 
      // Update popup content - with safety check and ownership info
 try {
 const ownership = getLocationOwnership(location.id, currentUserId);
 const popupContent = createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations);
 marker.setPopupContent(popupContent);
 } catch (e) {
 console.warn('Error updating popup content for location:', location.id, e);
 }
 
      // Update icon
 const isSelected = selectedLocations.has(location.id);
 const isFocused = focusedLocationId === location.id;
 const isEnriched = !!location.enrichedData;
 const isRecentlyEnriched = recentlyEnrichedIds.has(location.id);
 const ownership = getLocationOwnership(location.id, currentUserId);
 marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched, ownership.isOwn, { ownerName: ownership.ownerName, ownerId: ownership.ownerId, curatorId: ownership.curatorId, curatorIcon: ownership.curatorIcon, curatorColor: ownership.curatorColor }));
 });
 
    // Open pending popup if any
 if (pendingPopupRef.current) {
 const marker = markersRef.current.get(pendingPopupRef.current);
 if (marker) {
 marker.openPopup();
 }
 pendingPopupRef.current = null;
 }
 }, [enrichmentKey, selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, getLocationOwnership, currentUserId, canEnrichLocations]);

  // Initialize the previous enrichment state on first load (to avoid false positives)
 const isInitializedRef = useRef(false);
 
 useEffect(() => {
    // On first render, populate the ref with current enrichment states without triggering animations
 if (!isInitializedRef.current && allLocations.length > 0) {
 allLocations.forEach(loc => {
        // Store description length: 0 = not enriched, >0 = enriched
 previousEnrichmentStateRef.current.set(loc.id, loc.enrichedData?.descripcion?.length || 0);
 });
 isInitializedRef.current = true;
 console.log('Initialized enrichment state tracking for', allLocations.length, 'locations');
 }
 }, [allLocations]); // Use allLocations instead of just length to detect reference changes

  // Detect newly enriched locations and trigger animation + open popup
 useEffect(() => {
    // Skip if not initialized yet
 if (!isInitializedRef.current) return;
 
 console.log('Checking for enrichment changes, allLocations count:', allLocations.length);
 
 const newlyEnriched: string[] = [];
 
    // Use allLocations (not filtered) to detect any enrichment changes
 allLocations.forEach(loc => {
 const prevDescLength = previousEnrichmentStateRef.current.get(loc.id) ?? -1;
 const currentDescLength = loc.enrichedData?.descripcion?.length || 0;
 
      // If this location wasn't tracked before (-1), add it now
 if (prevDescLength === -1) {
 previousEnrichmentStateRef.current.set(loc.id, currentDescLength);
 console.log('New location tracked:', loc.name, 'desc length:', currentDescLength);
 return; // Don't trigger animation for newly tracked locations
 }
 
      // Detect NEW enrichment (from 0 to >0) OR significant content update
 const wasNotEnriched = prevDescLength === 0;
 const isNowEnriched = currentDescLength > 0;
 const hasSignificantChange = currentDescLength > prevDescLength + 50; // More than 50 chars added
 
 if ((wasNotEnriched && isNowEnriched) || hasSignificantChange) {
 newlyEnriched.push(loc.id);
 console.log('Newly enriched location detected:', loc.name, loc.id, 
 'prev:', prevDescLength, 'current:', currentDescLength);
 }
 
      // Update previous state
 previousEnrichmentStateRef.current.set(loc.id, currentDescLength);
 });
 
 if (newlyEnriched.length > 0) {
 console.log(' Triggering celebration for:', newlyEnriched.length, 'locations');
 
      // Play celebration sound
 playEnrichmentComplete();
 
      // Show toast for each enriched location
 newlyEnriched.forEach(id => {
 const loc = allLocations.find(l => l.id === id);
 if (loc) {
 toast.success(`${loc.name}`, {
 description: 'Enriquecimiento completado',
 duration: 3000,
 });
 }
 });
 
 setRecentlyEnrichedIds(prev => {
 const next = new Set(prev);
 newlyEnriched.forEach(id => next.add(id));
 return next;
 });
 
      // Open popup for the most recently enriched location and pan to it
 const lastEnrichedId = newlyEnriched[newlyEnriched.length - 1];
 const location = allLocations.find(l => l.id === lastEnrichedId);
 
 if (location && mapRef.current) {
        // Pan to the location
 mapRef.current.setView(
 [location.coordinates.lat, location.coordinates.lng],
 Math.max(mapRef.current.getZoom(), 10),
 { animate: true, duration: 0.5 }
 );
 
        // Open popup directly after a short delay to allow marker icon update
 setTimeout(() => {
 const marker = markersRef.current.get(lastEnrichedId);
 if (marker) {
 marker.openPopup();
 console.log('Opened popup for enriched location:', location.name);
 }
 }, 600); // Wait for pan animation + marker update
 }
 
      // Clear the animation after 4 seconds (matching longer animation)
 setTimeout(() => {
 setRecentlyEnrichedIds(prev => {
 const next = new Set(prev);
 newlyEnriched.forEach(id => next.delete(id));
 return next;
 });
 }, 4000);
 }
 }, [allLocations, enrichmentKey]);

  // Update marker icons when selection or focus changes
 useEffect(() => {
 markersRef.current.forEach((marker, locationId) => {
 const location = locationsRef.current.get(locationId);
 const isSelected = selectedLocations.has(locationId);
 const isFocused = focusedLocationId === locationId;
 const isEnriched = !!location?.enrichedData;
 const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
 const ownership = getLocationOwnership(locationId, currentUserId);
 marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched, ownership.isOwn, { ownerName: ownership.ownerName, ownerId: ownership.ownerId, curatorId: ownership.curatorId, curatorIcon: ownership.curatorIcon, curatorColor: ownership.curatorColor }));
 });
 }, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, getLocationOwnership, currentUserId]);

  // Curator visibility based on zoom level
 useEffect(() => {
 if (!mapRef.current || curatorVisibilityZooms.size === 0) return;
 
 const updateCuratorVisibility = () => {
 const map = mapRef.current;
 if (!map) return;
 
 try {
 const currentZoom = map.getZoom();
 
 markersRef.current.forEach((marker, locationId) => {
 const location = locationsRef.current.get(locationId);
 if (!location) return;
 
 const ownership = getLocationOwnership(locationId, currentUserId);
 
          // Only apply visibility zoom to curator points
 if (ownership.curatorId) {
 const minZoom = curatorVisibilityZooms.get(ownership.curatorId);
            // Access Leaflet marker's icon element
 const markerElement = (marker as any)._icon as HTMLElement | undefined;
 
            // If null (no limit), always show
 if (minZoom === null || minZoom === undefined) {
 marker.setOpacity(1);
 if (markerElement) markerElement.style.pointerEvents = '';
 return;
 }
 
            // Show if current zoom is >= minZoom, hide otherwise
 if (currentZoom >= minZoom) {
 marker.setOpacity(1);
 if (markerElement) markerElement.style.pointerEvents = '';
 } else {
 marker.setOpacity(0);
 if (markerElement) markerElement.style.pointerEvents = 'none';
 }
 }
 });
 } catch (e) {
        // Map not ready, ignore
 }
 };
 
    // Initial update
 updateCuratorVisibility();
 
    // Update on zoom change
 mapRef.current.on('zoomend', updateCuratorVisibility);
 
 return () => {
 if (mapRef.current) {
 mapRef.current.off('zoomend', updateCuratorVisibility);
 }
 };
 }, [curatorVisibilityZooms, getLocationOwnership, currentUserId]);

  // Handle focused location - pan and open popup
 useEffect(() => {
 if (!focusedLocationId || !mapRef.current) return;

 const marker = markersRef.current.get(focusedLocationId);
 const location = locationsRef.current.get(focusedLocationId);
 
 if (marker && location) {
      // Pan to the location
 mapRef.current.setView(
 [location.coordinates.lat, location.coordinates.lng],
 Math.max(mapRef.current.getZoom(), 10),
 { animate: true, duration: 0.5 }
 );
 
      // Open the popup after a short delay to allow panning
 setTimeout(() => {
 marker.openPopup();
 }, 300);
 }
 }, [focusedLocationId]);

  // Show empty state message overlaying the map, not replacing it
 const showEmptyState = locations.length === 0;

 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 className="h-full w-full overflow-hidden relative"
 >
 <div ref={mapContainerRef} className="h-full w-full" />
 
 {/* Custom scale bar */}
 <MapScaleBar map={mapRef.current} units={measurementUnits} />
 
 {/* Floating zoom button */}
 <motion.div
 initial={{ opacity: 0, scale: 0.8 }}
 animate={{ 
 opacity: showZoomButton ? 1 : 0, 
 scale: showZoomButton ? 1 : 0.8,
 pointerEvents: showZoomButton ? 'auto' : 'none'
 }}
 className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[999]"
 >
 <Button
 onClick={() => zoomToBounds(false)}
 className="bg-white hover:bg-gray-50 text-gray-700 shadow-lg border gap-2"
 size="sm"
 >
 <Maximize2 className="w-4 h-4" />
 Ver {locations.length} ubicaciones
 </Button>
 </motion.div>

 {/* Map theme toggle - minimal, top right */}
 <div className="absolute top-4 right-4 z-[999]">
 <MapThemeToggle 
 theme={mapTheme} 
 onThemeChange={setMapTheme} 
 />
 </div>
 
 {/* Map Center Settings - now in UserProfileEditor */}

 {/* Legend and stats - single line bottom right */}
 <div className="absolute bottom-4 right-4 z-[999]">
 <div className={cn(
 "backdrop-blur-sm rounded-full px-4 py-2 shadow-md text-xs flex items-center gap-4",
 mapTheme === 'dark' ? 'bg-gray-900/95' : 'bg-white/95'
 )}>
 {/* Location count */}
 <div className="flex items-center gap-1.5 pr-3 border-r border-border/50">
 <MapPin className="w-3.5 h-3.5 text-primary" />
 <span className="font-semibold">{locations.length}</span>
 {locations.length !== totalLocations && (
 <span className={mapTheme === 'dark' ? 'text-gray-400' : 'text-muted-foreground'}>/ {totalLocations}</span>
 )}
 </div>
 
 {/* Legend items */}
 <div className="flex items-center gap-1.5">
 <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#22c55e" stroke="white" strokeWidth="2"/>
 <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
 </svg>
 <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Final</span>
 </div>
 <div className="flex items-center gap-1.5">
 <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#3b82f6" stroke="white" strokeWidth="2"/>
 <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
 </svg>
 <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Pendiente</span>
 </div>
 <div className="flex items-center gap-1.5">
 <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#9ca3af" stroke="white" strokeWidth="2"/>
 <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
 </svg>
 <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Importado</span>
 </div>
 <div className="flex items-center gap-1.5">
 <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#f97316" stroke="white" strokeWidth="2"/>
 <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
 </svg>
 <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Vacío</span>
 </div>
 </div>
 </div>

 {/* Empty state overlay */}
 {showEmptyState && (
 <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-[500]">
 <p className="text-muted-foreground bg-background/80 backdrop-blur-sm px-4 py-2 rounded-lg shadow">
 No hay ubicaciones para mostrar
 </p>
 </div>
 )}

 <style>{`
 .custom-popup .leaflet-popup-content-wrapper {
 border-radius: 12px;
 box-shadow: 0 10px 40px rgba(0,0,0,0.15);
 padding: 0;
 overflow: hidden;
 }
 .custom-popup .leaflet-popup-content {
 margin: 0;
 }
 .custom-popup .leaflet-popup-close-button {
 top: 8px;
 right: 8px;
 width: 24px;
 height: 24px;
 font-size: 18px;
 color: #6b7280;
 background: white;
 border-radius: 50%;
 display: flex;
 align-items: center;
 justify-content: center;
 box-shadow: 0 2px 4px rgba(0,0,0,0.1);
 }
 .custom-popup .leaflet-popup-close-button:hover {
 color: #1a1a1a;
 background: #f3f4f6;
 }
 .custom-popup .leaflet-popup-tip {
 box-shadow: 0 3px 10px rgba(0,0,0,0.1);
 }
 @keyframes pulse {
 0%, 100% { transform: scale(1); }
 50% { transform: scale(1.15); }
 }
 @keyframes enriched-celebrate {
 0% { 
 transform: scale(1);
 filter: drop-shadow(0 0 0 rgba(34, 197, 94, 0));
 }
 5% { 
 transform: scale(2.2);
 filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.9));
 }
 15% { 
 transform: scale(1.6);
 filter: drop-shadow(0 0 30px rgba(34, 197, 94, 0.7));
 }
 25% { 
 transform: scale(1.9);
 filter: drop-shadow(0 0 25px rgba(34, 197, 94, 0.6));
 }
 40% { 
 transform: scale(1.5);
 filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.5));
 }
 55% { 
 transform: scale(1.7);
 filter: drop-shadow(0 0 15px rgba(34, 197, 94, 0.4));
 }
 70% { 
 transform: scale(1.3);
 filter: drop-shadow(0 0 10px rgba(34, 197, 94, 0.3));
 }
 85% { 
 transform: scale(1.15);
 filter: drop-shadow(0 0 5px rgba(34, 197, 94, 0.15));
 }
 100% { 
 transform: scale(1);
 filter: drop-shadow(0 0 0 rgba(34, 197, 94, 0));
 }
 }
 .recently-enriched {
 z-index: 9999 !important;
 }
 `}</style>
 </motion.div>
 );
}
