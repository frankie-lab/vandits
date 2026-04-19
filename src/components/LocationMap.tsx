import React, { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

import { useLocationsStore } from '@/domains/content';
import { useLayerVisibility, LAYER_VISIBILITY_EVENT, type LayerType } from '@/hooks/use-layer-visibility';
import { useFilteredLocations } from '@/domains/content/hooks/use-filtered-locations';
import { GeoLocation } from '@/types/location';
import { motion } from 'framer-motion';
import { Maximize2, MapPin, Home, Upload, Compass, ArrowRight, LocateFixed, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MapThemeToggle, MapTheme, MAP_TILE_LAYERS } from './MapThemeToggle';
import { MapScaleBar } from './MapScaleBar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMapCenterConfig, MapCenterConfig } from './MapCenterSettings';
import { toast } from 'sonner';
import { playEnrichmentComplete } from '@/lib/sounds';
import { usePermissions } from '@/domains/identity';
import { useMapTheme } from '@/hooks/use-map-theme';
import { supabase } from '@/integrations/supabase/client';
import { getLucideSvgString, getMapMarkerHtml, getStopTypeIconKey } from '@/lib/icon-utils';
import { fetchIpGeolocation } from '@/lib/ip-geolocation';

// Refactored modules
import { computeColocatedOffsets } from './map/map-colocated-offset';
import { CriteriaStatus, CURATOR_ICON_PATHS } from './map/map-constants';
import {
  loadCriteriaTimestamp, meetsEnrichmentCriteria, getCriteriaColor,
  getUserHue, getOwnerInitials, adjustHslLightness,
  calculateDistance, toLeafletLatLng, createFlightArcCoords, calculateSegmentBearing,
  calculateVisitRelevance, formatTimeAgo, createFilterLink, parseLocalizacionToLinks,
  type VisitRelevanceInfo,
} from './map/map-utils';
import { createCustomIcon } from './map/map-icons';
import { onMarkerSizeConfigChange, getMarkerSizeConfig } from './map/useMarkerSizeConfig';

import { buildImageSection, createPopupContent, loadCardConfig } from './map/map-popups';
import {
  showRoute, clearRoute, showAdvisorPreview, clearAdvisorPreview,
  showJourneyPreview, clearJourneyPreview,
  handleMapRouteClick, handleAlternativeHover,
  highlightSelectedRouteById, clearRouteHighlight,
  showEditableWaypoints, clearEditableWaypoints,
  setupCorrectionMode, clearCorrectionMode,
  highlightItineraryPoint,
  type RouteRefs, type EditableWaypoint,
} from './map/map-routes';
import {
  setupFilterLinkHandler, setupActionClickHandler,
  setupVisitedUpdatedHandler, setupRatingUpdatedHandler,
  setupNotesUpdatedHandler, setupPhotoUpdatedHandler,
} from './map/map-popup-handlers';
import { useEnrichmentTracker } from './map/useEnrichmentTracker';
import { initPhotoLayer } from './map/map-photo-layer';
import { initLayerGroups, destroyLayerGroups, getOrCreateGroup, clearAllGroups, applyLayerVisibility } from './map/map-layer-groups';
import { useV2MapBridge } from '@/hooks/use-v2-map-bridge';
import { renderV2Features, clearV2Features } from './map/map-v2-renderer';


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

// Norma transversal (2026-04-19): el color/forma de cada punto se resuelve
// dentro de `createCustomIcon` mediante `getPointVisualState` (3 estados:
// enriched/imported/empty). Ya no existe la noción "catálogo = azul cielo".




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
     const previewMarkersGroupRef = useRef<L.LayerGroup | null>(null);
     const nearbyRefGroupRef = useRef<L.LayerGroup | null>(null);
  const v2MarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const [itineraryFocusIds, setItineraryFocusIds] = useState<Set<string> | null>(null);
 const prevFilterKeyRef = useRef<string>('');
  const [showZoomButton, setShowZoomButton] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
 const { mapTheme, setMapTheme: _setMapTheme } = useMapTheme();
  // showCenterSettings removed - now in UserProfileEditor
 const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number; source?: 'gps' | 'ip' } | null>(null);
  const [locating, setLocating] = useState(false);
 
  // Measurement units preference
 const [measurementUnits, setMeasurementUnits] = useState<'metric' | 'imperial' | 'auto'>(() => {
 const stored = localStorage.getItem('geodata-measurement-units');
 return (stored as 'metric' | 'imperial' | 'auto') || 'metric';
 });
 
  // Map center config from database/localStorage
 const { config: mapCenterConfig, loading: mapCenterLoading } = useMapCenterConfig();
 

  // Force marker refresh when the "Criterios de Actualización" change
 const [criteriaVersion, setCriteriaVersion] = useState(0);
 
  // Force update counter for realtime and store updates
 const [forceUpdateCount, setForceUpdateCount] = useState(0);
 
 // Map center config version to trigger re-centering
 const [centerConfigVersion, setCenterConfigVersion] = useState(0);

  const getDocumentFocusPanelWidth = useCallback(() => {
    const panel = document.querySelector<HTMLElement>('[data-document-focus-panel="true"]');
    if (!panel) return 0;

    const { width } = panel.getBoundingClientRect();
    return width > 0 ? width : 0;
  }, []);

  const centerOpenedPopupInVisibleMap = useCallback((marker: L.Marker, rightPanelWidth = 0) => {
    window.setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;

      const popup = marker.getPopup();
      if (!popup || !popup.isOpen()) return;

      const popupElement = popup.getElement();
      if (!popupElement) return;

      const popupRect = popupElement.getBoundingClientRect();
      const containerRect = map.getContainer().getBoundingClientRect();
      const markerPoint = map.latLngToContainerPoint(marker.getLatLng());
      const visibleWidth = Math.max(containerRect.width - rightPanelWidth, 240);
      const idealMarkerX = visibleWidth / 2;
      const idealMarkerY = (containerRect.height / 2) + (popupRect.height / 2);
      const offsetX = markerPoint.x - idealMarkerX;
      const offsetY = markerPoint.y - idealMarkerY;

      if (Math.abs(offsetX) > 20 || Math.abs(offsetY) > 30) {
        map.panBy([offsetX, offsetY], { animate: true, duration: 0.35 });
      }
    }, 100);
  }, []);


 useEffect(() => {
 const handleCriteriaChanged = () => setCriteriaVersion((v) => v + 1);
 const handleRealtimeUpdate = () => setForceUpdateCount((v) => v + 1);
 
 
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
 
 // map theme now managed by useMapTheme hook
 const handleSetTheme = (e: Event) => {
 const customEvent = e as CustomEvent<{ theme: MapTheme }>;
 if (customEvent.detail?.theme) {
 _setMapTheme(customEvent.detail.theme);
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
  
  
 window.addEventListener('enrichment-criteria-changed', handleCriteriaChanged);
 window.addEventListener('location-realtime-update', handleRealtimeUpdate);
 window.addEventListener('store-updated', handleRealtimeUpdate);
 window.addEventListener('map-go-home', handleGoHome);
 window.addEventListener('map-set-theme', handleSetTheme);
 window.addEventListener('map-fit-bounds', handleFitBounds);
  window.addEventListener('measurement-units-changed', handleMeasurementUnitsChanged);
  
 
 

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

   // Preview markers for post-import review
   const handleShowPreviewMarkers = (e: Event) => {
     const { locations: previewLocations } = (e as CustomEvent).detail || {};
     if (!mapRef.current || !Array.isArray(previewLocations) || previewLocations.length === 0) return;
     if (!previewMarkersGroupRef.current) {
       previewMarkersGroupRef.current = L.layerGroup().addTo(mapRef.current);
     }
     previewMarkersGroupRef.current.clearLayers();

     const bounds: [number, number][] = [];
     previewLocations.forEach((location: GeoLocation) => {
       const isFocused = focusedLocationId === location.id;
       const marker = L.marker([location.coordinates.lat, location.coordinates.lng], {
         icon: createCustomIcon(false, isFocused, !!location.enrichedData, location, criteriaTimestamp, false),
       });
       marker.bindTooltip(location.name, { direction: 'top', offset: [0, -12] });
       marker.on('click', () => setFocusedLocation(location.id));
       previewMarkersGroupRef.current?.addLayer(marker);
       bounds.push([location.coordinates.lat, location.coordinates.lng]);
     });

     if (bounds.length > 1) {
       mapRef.current.fitBounds(bounds, { padding: [80, 80], animate: true, maxZoom: 14 });
     } else if (bounds.length === 1) {
       mapRef.current.setView(bounds[0], Math.max(mapRef.current.getZoom(), 12), { animate: true });
     }
   };
    const handleClearPreviewMarkers = () => {
      previewMarkersGroupRef.current?.clearLayers();
    };

    // Nearby reference markers + radius circle for post-import review
    const handleShowNearbyRef = (e: Event) => {
      const { center, radius, points } = (e as CustomEvent).detail || {};
      if (!mapRef.current) return;
      if (!nearbyRefGroupRef.current) {
        nearbyRefGroupRef.current = L.layerGroup().addTo(mapRef.current);
      }
      nearbyRefGroupRef.current.clearLayers();

      if (center && radius) {
        const circle = L.circle([center.lat, center.lng], {
          radius,
          color: 'hsl(var(--primary))',
          fillColor: 'hsl(var(--primary))',
          fillOpacity: 0.06,
          weight: 1,
          dashArray: '6 4',
        });
        nearbyRefGroupRef.current.addLayer(circle);
      }

      if (Array.isArray(points)) {
        points.forEach((p: any) => {
          const nCfg = getMarkerSizeConfig();
          const nEntry = nCfg.nearby_result || { base_normal: 10, fill_color: '#6b7280' };
          const nSize = nEntry.base_normal;
          const icon = L.divIcon({
            className: 'nearby-ref-marker',
            html: `<div style="width:${nSize}px;height:${nSize}px;border-radius:50%;background:${nEntry.fill_color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
            iconSize: [nSize, nSize],
            iconAnchor: [5, 5],
          });
          const marker = L.marker([p.lat, p.lng], { icon });
          marker.bindTooltip(p.name, { direction: 'top', offset: [0, -8] });
          if (p.id) marker.on('click', () => {
            window.dispatchEvent(new CustomEvent('nearby-marker-clicked', { detail: { id: p.id } }));
          });
          nearbyRefGroupRef.current?.addLayer(marker);
        });
      }
    };
    // Highlight a specific nearby marker
    const handleHighlightNearbyMarker = (e: Event) => {
      const { id } = (e as CustomEvent).detail || {};
      if (!nearbyRefGroupRef.current) return;
      nearbyRefGroupRef.current.eachLayer((layer: any) => {
        if (!(layer instanceof L.Marker) || !layer.getIcon) return;
        // Find the matching marker by checking stored points aren't available,
        // so we compare tooltip content
        const tooltip = layer.getTooltip?.();
        // All nearby markers get reset first
        const el = layer.getElement?.();
        if (!el) return;
        const dot = el.querySelector('div');
        if (dot) {
          dot.style.background = 'hsl(var(--muted-foreground))';
          dot.style.width = '10px';
          dot.style.height = '10px';
          dot.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
        }
      });
    };
    const handleClearNearbyRef = () => {
      nearbyRefGroupRef.current?.clearLayers();
    };
     const handleShowImportPreviewRoutes = (e: Event) => {
       const detail = (e as CustomEvent).detail;
       const routes = detail?.routes as { name: string; coordinates: [number, number][] }[];
       if (!routes?.length) return;
       const importRouteRefs: RouteRefs = { mapRef, routeLayersRef, routeGroupRef, advisorPreviewGroupRef, journeyPreviewGroupRef };
       const segments = routes.map((route) => ({
         geometry: {
           type: 'LineString',
           coordinates: route.coordinates.map(([lat, lng]: [number, number]) => [lng, lat]),
         },
         transportMode: 'driving',
         distance: 0,
         duration: 0,
         stageNumber: 1,
       }));
       showRoute(importRouteRefs, segments, undefined, true);
     };
     const handleClearImportPreviewRoutes = () => {
       const importRouteRefs: RouteRefs = { mapRef, routeLayersRef, routeGroupRef, advisorPreviewGroupRef, journeyPreviewGroupRef };
       clearRoute(importRouteRefs);
     };
    const handleFlyTo = (e: Event) => {
      const { lat, lng, zoom } = (e as CustomEvent).detail || {};
      if (mapRef.current && typeof lat === 'number' && typeof lng === 'number') {
        mapRef.current.flyTo([lat, lng], zoom || 16, { duration: 0.8 });
      }
    };
     window.addEventListener('map-show-preview-markers', handleShowPreviewMarkers);
     window.addEventListener('map-clear-preview-markers', handleClearPreviewMarkers);
     window.addEventListener('map-show-nearby-ref', handleShowNearbyRef);
     window.addEventListener('map-clear-nearby-ref', handleClearNearbyRef);
     window.addEventListener('nearby-highlight-marker', handleHighlightNearbyMarker);
     window.addEventListener('map-show-import-preview-routes', handleShowImportPreviewRoutes);
     window.addEventListener('map-clear-import-preview-routes', handleClearImportPreviewRoutes);
      window.addEventListener('map-fly-to', handleFlyTo);

    // Itinerary focus: show only markers belonging to the selected itinerary
    const handleItineraryFocus = (e: Event) => {
      const { locationIds } = (e as CustomEvent).detail || {};
      if (locationIds && Array.isArray(locationIds) && locationIds.length > 0) {
        setItineraryFocusIds(new Set(locationIds));
      } else {
        setItineraryFocusIds(null);
      }
    };
    window.addEventListener('itinerary-focus', handleItineraryFocus);

   return () => {
     window.removeEventListener('enrichment-criteria-changed', handleCriteriaChanged);
     window.removeEventListener('location-realtime-update', handleRealtimeUpdate);
     window.removeEventListener('store-updated', handleRealtimeUpdate);
     
     window.removeEventListener('map-go-home', handleGoHome);
     window.removeEventListener('map-set-theme', handleSetTheme);
     window.removeEventListener('map-fit-bounds', handleFitBounds);
     window.removeEventListener('measurement-units-changed', handleMeasurementUnitsChanged);
     window.removeEventListener('map-reset-view', handleResetView);
     window.removeEventListener('map-show-insert-preview', handleShowInsertPreview);
     window.removeEventListener('map-hide-insert-preview', handleHideInsertPreview);
      window.removeEventListener('map-show-preview-markers', handleShowPreviewMarkers);
      window.removeEventListener('map-clear-preview-markers', handleClearPreviewMarkers);
      window.removeEventListener('map-show-nearby-ref', handleShowNearbyRef);
      window.removeEventListener('map-clear-nearby-ref', handleClearNearbyRef);
      window.removeEventListener('nearby-highlight-marker', handleHighlightNearbyMarker);
      window.removeEventListener('map-show-import-preview-routes', handleShowImportPreviewRoutes);
       window.removeEventListener('map-clear-import-preview-routes', handleClearImportPreviewRoutes);
        window.removeEventListener('map-fly-to', handleFlyTo);
        window.removeEventListener('itinerary-focus', handleItineraryFocus);
  };
  }, [mapCenterConfig]);

  // ─── Route event listeners (stable, independent of mapCenterConfig) ────────
  useEffect(() => {
    let lastRouteSegCount = 0;
    const routeRefs: RouteRefs = { mapRef, routeLayersRef, routeGroupRef, advisorPreviewGroupRef, journeyPreviewGroupRef };

    const handleShowRouteEvent = (e: Event) => {
      const segments = (e as CustomEvent).detail?.segments;
      const routeStops = (e as CustomEvent).detail?.stops as any[] | undefined;
      const isNewRoute = !segments || segments.length !== lastRouteSegCount;
      lastRouteSegCount = segments?.length || 0;
      showRoute(routeRefs, segments, routeStops, isNewRoute);
    };

    const handleClearRouteEvent = () => clearRoute(routeRefs);

    const handleShowAdvisorPreviewEvent = (e: Event) => {
      const { segments } = (e as CustomEvent).detail || {};
      showAdvisorPreview(routeRefs, segments);
    };
    const handleClearAdvisorPreviewEvent = () => clearAdvisorPreview(routeRefs);

    const handleShowJourneyPreviewEvent = (e: Event) => {
      const { days } = (e as CustomEvent).detail || {};
      showJourneyPreview(routeRefs, days);
    };
    const handleClearJourneyPreviewEvent = () => clearJourneyPreview(routeRefs);

    const handleMapRouteClickEvent = (e: L.LeafletMouseEvent) => {
      if (!mapRef.current) return;
      handleMapRouteClick(routeLayersRef.current, mapRef.current, e);
    };

    const handleAlternativeHoverEvent = (e: Event) => {
      const label = (e as CustomEvent).detail?.label;
      handleAlternativeHover(routeLayersRef.current, label);
    };

    window.addEventListener('map-show-route', handleShowRouteEvent);
    window.addEventListener('map-clear-route', handleClearRouteEvent);
    window.addEventListener('map-show-advisor-preview', handleShowAdvisorPreviewEvent);
    window.addEventListener('map-clear-advisor-preview', handleClearAdvisorPreviewEvent);
    window.addEventListener('map-show-journey-preview', handleShowJourneyPreviewEvent);
    window.addEventListener('map-clear-journey-preview', handleClearJourneyPreviewEvent);
    window.addEventListener('route-alternative-hover', handleAlternativeHoverEvent);

    // Also register the route click handler on the map when it's available
    const registerMapClick = () => {
      mapRef.current?.on('click', handleMapRouteClickEvent);
    };
    registerMapClick();

    const handleShowEditableWaypoints = (e: Event) => {
      const { waypoints } = (e as CustomEvent).detail || {};
      if (mapRef.current && waypoints) {
        showEditableWaypoints(mapRef.current, waypoints as EditableWaypoint[], routeLayersRef.current);
      }
    };
    const handleClearEditableWaypoints = () => {
      if (mapRef.current) clearEditableWaypoints(mapRef.current);
    };

    // Correction mode handler
    const handleCorrectionMode = (e: Event) => {
      const { active, transportMode } = (e as CustomEvent).detail || {};
      if (mapRef.current) {
        if (active) {
          setupCorrectionMode(mapRef.current, routeLayersRef.current, transportMode);
        } else {
          clearCorrectionMode(mapRef.current);
        }
      }
    };

    const handleItinerarySegmentSelected = (e: Event) => {
      const { routeId, selected } = (e as CustomEvent).detail || {};
      if (selected && routeId) {
        highlightSelectedRouteById(routeLayersRef.current, routeId);
      } else {
        clearRouteHighlight(routeLayersRef.current);
      }
    };

    window.addEventListener('map-show-editable-waypoints', handleShowEditableWaypoints);
    window.addEventListener('map-clear-editable-waypoints', handleClearEditableWaypoints);
    window.addEventListener('map-correction-mode', handleCorrectionMode);
    window.addEventListener('itinerary-segment-selected', handleItinerarySegmentSelected);

    // Itinerary point selected → fly + highlight
    const handleItineraryPointSelected = (e: Event) => {
      const { lat, lng } = (e as CustomEvent).detail || {};
      if (mapRef.current && typeof lat === 'number' && typeof lng === 'number') {
        mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 });
        highlightItineraryPoint(mapRef.current, lat, lng);
      }
    };
    window.addEventListener('itinerary-point-selected', handleItineraryPointSelected);

    return () => {
      window.removeEventListener('map-show-route', handleShowRouteEvent);
      window.removeEventListener('map-clear-route', handleClearRouteEvent);
      window.removeEventListener('map-show-advisor-preview', handleShowAdvisorPreviewEvent);
      window.removeEventListener('map-clear-advisor-preview', handleClearAdvisorPreviewEvent);
      window.removeEventListener('map-show-journey-preview', handleShowJourneyPreviewEvent);
      window.removeEventListener('map-clear-journey-preview', handleClearJourneyPreviewEvent);
      window.removeEventListener('route-alternative-hover', handleAlternativeHoverEvent);
      window.removeEventListener('map-show-editable-waypoints', handleShowEditableWaypoints);
      window.removeEventListener('map-clear-editable-waypoints', handleClearEditableWaypoints);
      window.removeEventListener('map-correction-mode', handleCorrectionMode);
      window.removeEventListener('itinerary-segment-selected', handleItinerarySegmentSelected);
      window.removeEventListener('itinerary-point-selected', handleItineraryPointSelected);
      mapRef.current?.off('click', handleMapRouteClickEvent);
    };
  }, []);

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

  // V2 Map Bridge — provides MapFeature[] when Phase D flag is active
  const { v2Features, shouldUseV2Render, v2Loading, refreshV2 } = useV2MapBridge({
    userId: currentUserId,
    documentId: selectedDocument?.id ?? null,
  });
  
   // Layer visibility arbiter
  const layerVis = useLayerVisibility();
  const getLayersRef = useRef(layerVis.getLayers);
  getLayersRef.current = layerVis.getLayers;
  
   // Get admin status for enrichment permissions (only master/admin can enrich)
  const { isAdmin } = usePermissions();
  const canEnrichLocations = isAdmin();
  
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);

  useEffect(() => {
    import('@/integrations/supabase/client').then(({ supabase }) => {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        const uid = session?.user?.id || null;
        setCurrentUserId(uid);
        if (session?.user?.last_sign_in_at) {
          setLastSeenAt(new Date(session.user.last_sign_in_at));
        }
        if (uid) {
          const { data } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('id', uid)
            .maybeSingle();
          if (data) {
            const name = (data.display_name?.trim() || data.username?.trim() || '').split(' ')[0] || null;
            setUserDisplayName(name);
          }
        }
      });
    });
  }, []);

  // Format a past date as a Spanish relative time string ("hace 3 días").
  const formatRelativeTime = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 5) return `hace ${diffWeeks} ${diffWeeks === 1 ? 'semana' : 'semanas'}`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `hace ${diffMonths} ${diffMonths === 1 ? 'mes' : 'meses'}`;
    const diffYears = Math.floor(diffDays / 365);
    return `hace ${diffYears} ${diffYears === 1 ? 'año' : 'años'}`;
  };
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

  // Enrichment tracker hook (animations, sounds, toasts)
  const { recentlyEnrichedIds } = useEnrichmentTracker({ allLocations, enrichmentKey, mapRef, markersRef });

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
      // Auto mode - zoom to show all points, or center on user GPS if empty
      if (locations.length > 0) {
        zoomToBounds(immediate, 1);
      } else if (navigator.geolocation) {
        // No points yet → center on user GPS so the new user sees themselves
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 11);
          },
          () => {
            /* keep default world view, no error toast */
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      }
    }
  }, [locations, zoomToBounds, mapCenterConfig]);

  // Create home marker icon
 const createHomeMarkerIcon = useCallback(() => {
 const cfg = getMarkerSizeConfig();
 const entry = cfg.home || { base_normal: 24, fill_color: '#16a34a' };
 const size = entry.base_normal;
 const color = entry.fill_color;
 const iconInner = Math.round(size * 0.5);
 return L.divIcon({
 className: 'home-marker-icon',
 html: `
 <div style="
 width: ${size}px;
 height: ${size}px;
 display: flex;
 align-items: center;
 justify-content: center;
 background: ${color};
 border-radius: 50%;
 border: 2px solid white;
 box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
 ">
 <svg width="${iconInner}" height="${iconInner}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
 <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
 <polyline points="9 22 9 12 15 12 15 22"/>
 </svg>
 </div>
 `,
 iconSize: [size, size],
 iconAnchor: [size / 2, size / 2],
 });
 }, []);

   // Create user location marker icon (static blue dot)
  const createUserLocationIcon = useCallback(() => {
  const cfg = getMarkerSizeConfig();
  const entry = cfg.user_gps || { base_normal: 14, fill_color: '#3b82f6' };
  const size = entry.base_normal;
  const color = entry.fill_color;
  return L.divIcon({
  className: 'user-location-icon',
  html: `
  <div style="
  width: ${size}px;
  height: ${size}px;
  background: ${color};
  border-radius: 50%;
  border: 3px solid white;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.5);
  "></div>
  `,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
 });
 }, []);

  // Get user's current location (GPS first, fallback to approximate IP location).
  useEffect(() => {
    let watchId: number | null = null;
    let ipFallbackUsed = false;
    let gotPosition = false;

    const fetchIpLocation = async (reason: string) => {
      if (ipFallbackUsed || gotPosition) return;
      ipFallbackUsed = true;
      console.log(`[geolocation] using IP fallback (${reason})`);
      const result = await fetchIpGeolocation();
      if (result && !gotPosition) {
        setUserLocation({
          lat: result.lat,
          lng: result.lng,
          accuracy: result.accuracy,
          source: 'ip',
        });
      } else if (!result) {
        console.warn('[geolocation] all IP providers failed');
      }
    };

    // ALWAYS schedule IP fallback after 3s — independent of geolocation API behaviour.
    const ipFallbackTimer = window.setTimeout(() => {
      void fetchIpLocation('timer-3s');
    }, 3000);

    const onSuccess = (position: GeolocationPosition) => {
      gotPosition = true;
      window.clearTimeout(ipFallbackTimer);
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        source: 'gps',
      });
    };

    const onError = (highAccuracy: boolean) => (error: GeolocationPositionError) => {
      console.log(`[geolocation] error (highAccuracy=${highAccuracy}, code=${error.code}):`, error.message);
      if (highAccuracy && error.code === error.TIMEOUT) {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        startWatch(false);
        return;
      }
      void fetchIpLocation(`error-code-${error.code}`);
    };

    const startWatch = (highAccuracy: boolean) => {
      if (!navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        onSuccess,
        onError(highAccuracy),
        {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 15000 : 30000,
          maximumAge: 60000,
        }
      );
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        onError(false),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
      startWatch(true);
    } else {
      void fetchIpLocation('no-geolocation-api');
    }

    return () => {
      window.clearTimeout(ipFallbackTimer);
      if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const handleLocateMe = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización');
      return;
    }
    setLocating(true);
    toast.info('Solicitando ubicación…');

    const fetchIpLocation = async () => {
      const result = await fetchIpGeolocation();
      if (result) {
        const loc = { lat: result.lat, lng: result.lng, accuracy: result.accuracy, source: 'ip' as const };
        setUserLocation(loc);
        toast.success('Ubicación aproximada obtenida');
        mapRef.current?.flyTo([loc.lat, loc.lng], 10, { duration: 0.8 });
        return true;
      }
      return false;
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'gps' as const,
        };
        setUserLocation(loc);
        setLocating(false);
        toast.success('Ubicación obtenida');
        mapRef.current?.flyTo([loc.lat, loc.lng], 13, { duration: 0.8 });
      },
      async (error) => {
        const usedFallback = error.code !== error.PERMISSION_DENIED && await fetchIpLocation();
        setLocating(false);
        if (usedFallback) return;
        const msg =
          error.code === error.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado por el navegador'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Ubicación no disponible'
              : error.code === error.TIMEOUT
                ? 'El navegador tardó demasiado en responder'
                : 'No se pudo obtener tu ubicación';
        toast.error(msg);
        console.warn('[geolocation] manual locate failed:', error);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

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
 ${userLocation.source === 'ip' ? 'Tu zona aproximada' : 'Tu ubicación'}
 </div>
 <div style="font-size: 11px; color: #6b7280;">
 ${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}
 </div>
 <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">
 ${userLocation.source === 'ip' ? 'Ubicación aproximada por red/IP' : `Precisión: ±${Math.round(userLocation.accuracy)}m`}
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

    // Always render home marker when a home location is configured,
    // independently of the map_center_mode (which only controls initial focus).
 if (mapCenterConfig.homeLocation) {
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
    if (!mapRef.current || mapCenterLoading) return;

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
    return setupFilterLinkHandler(setFilters, () => filters);
  }, [setFilters, filters]);

  // Handle popup action button clicks
  useEffect(() => { loadCardConfig(); return setupActionClickHandler(); }, []);

  // Handle notes-updated event to refresh popup
  useEffect(() => {
    return setupNotesUpdatedHandler(markersRef, locationsRef, getLocationOwnership, currentUserId, criteriaTimestamp, canEnrichLocations, createPopupContent);
  }, [criteriaTimestamp, getLocationOwnership, currentUserId, canEnrichLocations]);

  // Handle photo-updated event to refresh popup after photo upload/delete
  useEffect(() => {
    return setupPhotoUpdatedHandler(markersRef, locationsRef, getLocationOwnership, currentUserId, criteriaTimestamp, canEnrichLocations, createPopupContent);
  }, [criteriaTimestamp, getLocationOwnership, currentUserId, canEnrichLocations]);

  // Handle visited-updated event to update popup elements in-place
  useEffect(() => {
    return setupVisitedUpdatedHandler(locationsRef, canEnrichLocations);
  }, [canEnrichLocations]);

  // Handle rating-updated event to update stars in-place
  useEffect(() => {
    return setupRatingUpdatedHandler(locationsRef);
  }, []);

 useEffect(() => {
 if (!mapContainerRef.current || mapRef.current) return;

    // Define world bounds to prevent map from repeating
 const worldBounds = L.latLngBounds(
 L.latLng(-85, -180), // Southwest corner
 L.latLng(85, 180) // Northeast corner
 );

    // Calculate minimum zoom that fills the container (cover behaviour)
    const container = mapContainerRef.current;
    const coverMinZoom = Math.ceil(
      Math.max(
        Math.log2(container.clientWidth / 256),
        Math.log2(container.clientHeight / 170), // 170 ≈ 256 * (85*2/360) vertical tile span at z0
      )
    );
    const safeMinZoom = Math.max(coverMinZoom, 2);

 mapRef.current = L.map(mapContainerRef.current, {
 center: [20, 0],
 zoom: safeMinZoom,
 minZoom: safeMinZoom,
 maxBounds: worldBounds,
 maxBoundsViscosity: 1.0, // Completely restrict panning outside bounds
 scrollWheelZoom: true,
 worldCopyJump: false, // Prevent world from wrapping
    });

    // Dismiss welcome card when user clicks anywhere on the map
    mapRef.current.on('click', () => {
      setWelcomeDismissed(true);
    });
    const resizeObserver = new ResizeObserver(() => {
      const map = mapRef.current;
      if (!map || !container) return;
      const newMin = Math.max(
        Math.ceil(Math.max(
          Math.log2(container.clientWidth / 256),
          Math.log2(container.clientHeight / 170),
        )),
        2,
      );
      if (map.getMinZoom() !== newMin) {
        map.setMinZoom(newMin);
        if (map.getZoom() < newMin) map.setZoom(newMin);
      }
    });
    resizeObserver.observe(container);

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

    // Initialize layer groups system
    initLayerGroups(mapRef.current);

    // Initialize photo layer
    const cleanupPhotoLayer = initPhotoLayer(mapRef.current);

    // Photo focus from index panel
    const handlePhotoFocus = async (e: Event) => {
      const { latitude, longitude, name, onedriveId } = (e as CustomEvent).detail;
      if (!mapRef.current || !latitude || !longitude) return;
      
      mapRef.current.flyTo([latitude, longitude], 16, { duration: 1.2 });
      
      // Show popup with loading state, then fetch fresh thumbnail
      const popup = L.popup({ maxWidth: 320, minWidth: 220 })
        .setLatLng([latitude, longitude])
        .setContent(`<div style="padding:10px;text-align:center;">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;">📷 ${name}</div>
          <div style="font-size:11px;color:#6b7280;">Cargando miniatura...</div>
        </div>`)
        .openOn(mapRef.current);

      if (onedriveId) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const resp = await supabase.functions.invoke('browse-onedrive', {
            body: { action: 'get-thumbnail', folderId: onedriveId },
          });
          const thumbData = resp.data;
          const thumbUrl = thumbData?.large || thumbData?.medium || thumbData?.small;
          if (thumbUrl && popup.isOpen()) {
            popup.setContent(`<div style="min-width:220px;max-width:300px;">
              <img src="${thumbUrl}" style="width:100%;max-height:240px;object-fit:cover;border-radius:8px 8px 0 0;" />
              <div style="padding:8px 10px;">
                <div style="font-weight:600;font-size:12px;">📷 ${name}</div>
                <div style="font-size:10px;color:#9ca3af;margin-top:2px;">${latitude.toFixed(5)}, ${longitude.toFixed(5)}</div>
              </div>
            </div>`);
          }
        } catch (err) {
          console.error('Error fetching thumbnail:', err);
        }
      }
    };
    window.addEventListener('photo-focus', handlePhotoFocus);

 return () => {
      resizeObserver.disconnect();
      cleanupPhotoLayer.then(cleanup => cleanup?.());
      window.removeEventListener('photo-focus', handlePhotoFocus);
      destroyLayerGroups();
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

    // Clear existing markers from map and layer groups
 markersRef.current.forEach(marker => marker.remove());
 markersRef.current.clear();
 locationsRef.current.clear();
    clearAllGroups();

  if (locations.length === 0) return;

  // Compute micro-offsets for co-located markers
  const colocatedOffsets = computeColocatedOffsets(locations);

  const markersToAdd: L.Marker[] = [];

     // Add new markers
  locations.forEach((location) => {
  const isSelected = selectedLocations.has(location.id);
  const isFocused = focusedLocationId === location.id;
  const isEnriched = !!location.enrichedData;
  const ownership = getLocationOwnership(location.id, currentUserId);

  // Use offset coordinates if this marker is co-located with others
  const offset = colocatedOffsets.get(location.id);
  const markerLat = offset ? offset.lat : location.coordinates.lat;
  const markerLng = offset ? offset.lng : location.coordinates.lng;

  const marker = L.marker([markerLat, markerLng], {
  icon: createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, false),
  });

      // Create popup with content including ownership info
 const popupContent = createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations);
 const viewportHeight = window.innerHeight || 900;
 const popupMaxHeight = viewportHeight - 180;
 marker.bindPopup(popupContent, {
 maxWidth: 380,
 minWidth: 280,
 maxHeight: popupMaxHeight,
 className: 'custom-popup',
 closeButton: true,
 autoPan: true,
 autoPanPadding: L.point(50, 80),
 });

 marker.on('click', function (this: L.Marker) {
 this.openPopup();
 centerOpenedPopupInVisibleMap(this, getDocumentFocusPanelWidth());
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
 
      // Determine layer type and add marker to the correct LayerGroup
      const locLayerType = (location as any)?._layerType as import('@/hooks/use-layer-visibility').LayerType | undefined;
      let layerType: import('@/hooks/use-layer-visibility').LayerType;
      let entityId: string | undefined;
      // Use explicit _layerType when set (document focus mode)
      if (locLayerType) {
        layerType = locLayerType;
      } else if (ownership.isOwn) {
        // Points from published documents go to catalog; all others to workspace
        layerType = ownership.docStatus === 'published' ? 'catalog' : 'workspace';
      
      } else {
        layerType = 'followed';
        entityId = ownership.ownerId;
      }
      const group = getOrCreateGroup(layerType, entityId);
      group.addLayer(marker);
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
 }, [locationIds, toggleLocationSelection, setFocusedLocation]);

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
 marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched));
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


  // Update marker icons when selection or focus changes
 useEffect(() => {
 markersRef.current.forEach((marker, locationId) => {
 const location = locationsRef.current.get(locationId);
 const isSelected = selectedLocations.has(locationId);
 const isFocused = focusedLocationId === locationId;
 const isEnriched = !!location?.enrichedData;
 const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
 marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched));
 });
  }, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds]);

  useEffect(() => {
    const unsub = onMarkerSizeConfigChange(() => {
      markersRef.current.forEach((marker, locationId) => {
        const location = locationsRef.current.get(locationId);
        const isSelected = selectedLocations.has(locationId);
        const isFocused = focusedLocationId === locationId;
        const isEnriched = !!location?.enrichedData;
        const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
        marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched));
      });
    });
    return unsub;
  }, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds]);


  // ── Single Arbiter: apply visibility via LayerGroups (O(1) per group) ──
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const applyGroupVisibility = () => {
      if (!map) return;
      const zoom = map.getZoom();
      const layers = getLayersRef.current();
      applyLayerVisibility(layers, zoom);
    };

    // Apply now
    applyGroupVisibility();

    // Re-evaluate on zoom (for minVisibilityZoom) and layer changes
    map.on('zoomend', applyGroupVisibility);
    window.addEventListener(LAYER_VISIBILITY_EVENT, applyGroupVisibility);

    return () => {
      map.off('zoomend', applyGroupVisibility);
      window.removeEventListener(LAYER_VISIBILITY_EVENT, applyGroupVisibility);
    };
  }, [locationIds, getLocationOwnership, currentUserId]);

  // ── V2 Feature Rendering (Phase D) ──────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear previous V2 markers
    clearV2Features(map, v2MarkersRef.current);

    // Respect layer visibility kill switch
    const layers = getLayersRef.current();
    const pointsHidden = layers.points?.visible === false;
    if (!shouldUseV2Render || v2Features.length === 0 || pointsHidden) return;

    // Render V2 features as markers
    const newMarkers = renderV2Features(map, v2Features, (feature) => {
      if (feature.clickPayload.placeId) {
        setFocusedLocation(feature.clickPayload.placeId);
      }
    });

    v2MarkersRef.current = newMarkers;

    return () => {
      clearV2Features(map, v2MarkersRef.current);
    };
  }, [shouldUseV2Render, v2Features, setFocusedLocation]);

  // Handle focused location - pan and open popup
 useEffect(() => {
 if (!focusedLocationId || !mapRef.current) return;

 const marker = markersRef.current.get(focusedLocationId);
 const location = locationsRef.current.get(focusedLocationId);
 
  if (marker && location) {
  const rightPanelWidth = getDocumentFocusPanelWidth();

  mapRef.current.setView(
  [location.coordinates.lat, location.coordinates.lng],
  Math.max(mapRef.current.getZoom(), 10),
  { animate: true, duration: 0.5 }
  );

  setTimeout(() => {
  marker.openPopup();
  centerOpenedPopupInVisibleMap(marker, rightPanelWidth);
  }, 300);
  }
 }, [focusedLocationId]);

  // Welcome card visibility:
  //  - mode='onboarding' → CTAs Casa + Importar (primera visita, sin datos)
  //  - mode='summary'    → resumen del catálogo + CTAs secundarias, cierra al click fuera
  // El "ya mostrada" de summary se persiste en sessionStorage para no reaparecer
  // en la misma sesión salvo que se dispare `vandits:show-welcome`.
  // IMPORTANTE: hasImports lee del store SIN filtrar para no caer en falsos onboardings
  // cuando el usuario tiene catálogo pero hay filtros de mapa activos.
  const allLocationsCount = useLocationsStore(s => s.getAllLocations().length);
  const importedCount = allLocationsCount;
  const hasHome = !!mapCenterConfig?.homeLocation;
  const hasImports = documents.length > 0 || allLocationsCount > 0;
  const homeName = mapCenterConfig?.homeLocation?.name;

  // Catálogo stats — misma lógica que FloatingToolbar para coherencia visual.
  const catalogStats = React.useMemo(() => {
    let myCatalogCount = 0;
    let followedCatalogCount = 0;
    documents.forEach(doc => {
      if (doc.status !== 'published') return;
      if (doc.userId === currentUserId) {
        myCatalogCount += doc.locations.length;
      } else {
        followedCatalogCount += doc.locations.length;
      }
    });
    return {
      myCatalogCount,
      totalCatalogCount: myCatalogCount + followedCatalogCount,
    };
  }, [documents, currentUserId]);
  const documentsCount = documents.length;

  // Guard de hidratación: hasta que llegue señal real del store no decidimos modo.
  const dataReady = documents.length > 0 || allLocationsCount > 0;

  // Modo de la welcome card (solo válido cuando dataReady)
  const welcomeMode: 'onboarding' | 'summary' = hasImports ? 'summary' : 'onboarding';

  // Estado: la summary se muestra en cada carga de página.
  // El cierre solo persiste durante la vida del componente; al recargar vuelve a aparecer.
  // Limpiamos cualquier marca antigua de sessionStorage para no bloquear futuras apariciones.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem('vandits:welcome-shown');
    sessionStorage.removeItem('vandits:welcome-summary-shown');
  }, []);
  const [summaryShown, setSummaryShown] = useState<boolean>(false);

  // Ref al contenedor de la card para detectar clicks fuera.
  const welcomeCardRef = useRef<HTMLDivElement | null>(null);

  // Reabrir summary desde el menú/avatar mediante evento.
  useEffect(() => {
    const handler = () => {
      setSummaryShown(false);
      setWelcomeDismissed(false);
    };
    window.addEventListener('vandits:show-welcome', handler);
    return () => window.removeEventListener('vandits:show-welcome', handler);
  }, []);

  const showOnboardingCard = dataReady && welcomeMode === 'onboarding' && !welcomeDismissed;
  const showSummaryCard = dataReady && welcomeMode === 'summary' && !welcomeDismissed && !summaryShown;
  const showEmptyState = showOnboardingCard || showSummaryCard;

  // Cierre al click fuera de la card (solo cuando la summary está visible).
  useEffect(() => {
    if (!showSummaryCard) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = welcomeCardRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setSummaryShown(true);
      setWelcomeDismissed(true);
    };
    // Defer registration one tick to evitar capturar el click que abrió la card.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [showSummaryCard]);

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

 {/* Map theme toggle + locate-me — top right */}
 <div className="absolute top-4 right-4 z-[999] flex items-center gap-2">
   <Tooltip>
     <TooltipTrigger asChild>
       <button
         type="button"
         onClick={handleLocateMe}
         disabled={locating}
         aria-label="Localizarme"
         className={cn(
           "h-9 w-9 inline-flex items-center justify-center rounded-full backdrop-blur-sm shadow-md transition-colors",
           mapTheme === 'dark'
             ? 'bg-gray-900/95 text-white hover:bg-gray-800'
             : 'bg-white/95 text-foreground hover:bg-white',
           userLocation && 'text-primary'
         )}
       >
         {locating
           ? <Loader2 className="h-4 w-4 animate-spin" />
           : <LocateFixed className="h-4 w-4" />}
       </button>
     </TooltipTrigger>
     <TooltipContent side="left">
       {userLocation ? 'Centrar en mi ubicación' : 'Localizarme'}
     </TooltipContent>
   </Tooltip>
   <MapThemeToggle
     theme={mapTheme}
     onThemeChange={_setMapTheme}
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

      {/* Welcome card — onboarding o summary según estado del catálogo */}
      {showEmptyState && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[500] px-4 pointer-events-none w-full max-w-md">
          <div
            ref={welcomeCardRef}
            className="relative pointer-events-auto overflow-hidden rounded-2xl border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            {/* Decorative gradient halo */}
            <div className="pointer-events-none absolute inset-x-0 -top-20 h-40 bg-gradient-to-b from-primary/25 via-primary/10 to-transparent blur-2xl" />
            <div className="pointer-events-none absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />

            <div className="relative p-5">
              {/* Brand mark — same as Header for visual consistency */}
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient shadow-lg shadow-primary/30 ring-1 ring-primary/20">
                <Compass className="h-6 w-6 text-primary-foreground" />
              </div>

              <div className="text-center mb-4">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {userDisplayName ? `Hola, ${userDisplayName}` : 'Bienvenido a Vandits'}
                </h3>
                {(() => {
                  const showLastSeen =
                    !!userDisplayName && !!lastSeenAt && (Date.now() - lastSeenAt.getTime()) >= 60_000;
                  if (welcomeMode === 'onboarding') {
                    const stepsLeft = (hasHome ? 0 : 1) + (hasImports ? 0 : 1);
                    const stepsText =
                      stepsLeft === 0 ? 'Todo listo'
                      : stepsLeft === 1 ? 'Te queda un paso'
                      : 'Te quedan dos pasos';
                    return (
                      <>
                        {showLastSeen && (
                          <p className="text-xs text-muted-foreground mt-1">
                            No te vemos desde {formatRelativeTime(lastSeenAt!)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{stepsText}</p>
                      </>
                    );
                  }
                  // summary mode
                  const lastLoginText = lastSeenAt
                    ? `Último acceso: ${lastSeenAt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}`
                    : null;
                  return (
                    <>
                      <p className="text-xs text-muted-foreground mt-1">
                        {showLastSeen
                          ? `No te vemos desde ${formatRelativeTime(lastSeenAt!)}`
                          : 'Aquí tienes el estado de tu catálogo'}
                      </p>
                      {lastLoginText && (
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                          {lastLoginText}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {welcomeMode === 'onboarding' ? (
                <div className="space-y-2">
                  {/* Home location row */}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-profile', { detail: { tab: 'map' } }))}
                    className={cn(
                      "group w-full flex items-center gap-3 rounded-xl border transition-all p-3 text-left",
                      hasHome
                        ? "border-border/40 bg-transparent hover:bg-accent/40"
                        : "border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 shadow-sm ring-1 ring-primary/10"
                    )}
                  >
                    <div className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                      hasHome
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground group-hover:scale-105"
                    )}>
                      <Home className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {hasHome ? (
                        <>
                          <div className="text-sm font-semibold text-foreground leading-tight truncate">
                            {homeName?.trim() || 'Configurado'}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Centro de tu mapa
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-foreground leading-tight">
                            Define tu punto de origen
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Centra el mapa en tu casa o residencia
                          </div>
                        </>
                      )}
                    </div>
                    <ArrowRight className={cn(
                      "h-4 w-4 transition-all",
                      hasHome
                        ? "text-muted-foreground/60 group-hover:text-foreground"
                        : "text-primary group-hover:translate-x-0.5"
                    )} />
                  </button>

                  {/* Imported files row */}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-upload'))}
                    className={cn(
                      "group w-full flex items-center gap-3 rounded-xl border transition-all p-3 text-left",
                      hasImports
                        ? "border-border/40 bg-transparent hover:bg-accent/40"
                        : "border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 shadow-sm ring-1 ring-primary/10"
                    )}
                  >
                    <div className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                      hasImports
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground group-hover:scale-105"
                    )}>
                      <Upload className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {hasImports ? (
                        <>
                          <div className="text-sm font-semibold text-foreground leading-tight">
                            {documents.length.toLocaleString('es-ES')}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              {documents.length === 1 ? 'archivo' : 'archivos'}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {importedCount.toLocaleString('es-ES')} {importedCount === 1 ? 'punto' : 'puntos'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-foreground leading-tight">
                            Importar archivos
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            KML, KMZ, GPX o GeoJSON con tus puntos y rutas
                          </div>
                        </>
                      )}
                    </div>
                    <ArrowRight className={cn(
                      "h-4 w-4 transition-all",
                      hasImports
                        ? "text-muted-foreground/60 group-hover:text-foreground"
                        : "text-primary group-hover:translate-x-0.5"
                    )} />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Casa destacada solo si falta */}
                  {!hasHome && (
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-profile', { detail: { tab: 'map' } }))}
                      className="group w-full flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 shadow-sm ring-1 ring-primary/10 transition-all p-3 text-left"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground group-hover:scale-105 transition-colors">
                        <Home className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground leading-tight">
                          Define tu punto de origen
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Centra el mapa en tu casa o residencia
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-all" />
                    </button>
                  )}

                  {/* 2 cifras alineadas */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-background/40 p-3 text-center">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-lg font-bold text-foreground leading-none">
                          {catalogStats.myCatalogCount.toLocaleString('es-ES')}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                        Mi catálogo
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-background/40 p-3 text-center">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-sky-500" />
                        <span className="text-lg font-bold text-foreground leading-none">
                          {catalogStats.totalCatalogCount.toLocaleString('es-ES')}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                        Total accesible
                      </div>
                    </div>
                  </div>

                  {/* CTAs secundarias */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-locations'))}
                    >
                      <MapPin className="h-3.5 w-3.5 mr-1.5" />
                      Ir a mi catálogo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-upload'))}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Importar más
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
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
