import React, { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

import { useLocationsStore } from '@/domains/content';
import { useLayerVisibility, LAYER_VISIBILITY_EVENT, type LayerType } from '@/hooks/use-layer-visibility';
import { useFilteredLocations } from '@/domains/content/hooks/use-filtered-locations';
import {
  applyViewportCulling,
  getLocationSubsetSignature,
} from '@/components/map/viewport-culling';
import { getBucketStats } from '@/domains/content/lib/location-bucket';
import { useDiscoveryStore } from '@/domains/discovery';
import { resetAllFilters } from '@/domains/content/lib/filter-presets';
import { GeoLocation } from '@/types/location';
import { motion } from 'framer-motion';
import { Maximize2, MapPin, Home, Upload, Compass, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MapThemeToggle, MapTheme, MAP_TILE_LAYERS } from './MapThemeToggle';
import { MapScaleBar } from './MapScaleBar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMapCenterConfig, MapCenterConfig } from './MapCenterSettings';
import { ZOOM_THRESHOLDS } from '@/design-system/map/rules/zoom-thresholds';

// Zoom de arranque polaroid: leemos del canon (richMin del design system) para
// no romper si el token cambia. Hoy = 12.
const INITIAL_GEOLOCATION_ZOOM = ZOOM_THRESHOLDS.richMin;
// Opciones GPS únicas compartidas por arranque y botón "Centrar mi ubicación".
// maximumAge:60_000 permite reutilizar la lectura del arranque al pulsar el botón.
const GEOLOCATION_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60_000,
};
import { toast } from 'sonner';
import { playEnrichmentComplete } from '@/lib/sounds';
import { usePermissions } from '@/domains/identity';
import { useSocialStats } from '@/domains/social';
import { useMapTheme } from '@/hooks/use-map-theme';
import { CatalogLoadingCard, useActiveLoadings } from '@/shared/loading';
import { clearBottomSafeInset, setBottomSafeInset } from '@/shared/layout/overlay-safe-area';
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
import { createCustomIcon, getRenderModeForZoom, setCurrentRenderMode, setCurrentZoom, syncRenderModeFromMap, type MarkerRenderMode } from './map/map-icons';
import { buildHoverTooltipHtml } from './map/map-tooltip';
import { onMarkerSizeConfigChange, getMarkerSizeConfig } from './map/useMarkerSizeConfig';
import {
  prewarmEnrichmentFailures,
  subscribeFailureChange,
} from '@/domains/content/lib/enrichment-failure-state';

import { buildImageSection, createPopupContent, loadCardConfig } from './map/map-popups';
import { bindRecoveryMount } from './map/popup-recovery-mount';
import {
  primeCollectionsForLocations,
  subscribeLocationCollections,
} from '@/domains/content/store/location-collections-store';
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
import { useCoalescedRealtimeTick } from './map/use-coalesced-realtime-tick';
import { initPhotoLayer } from './map/map-photo-layer';
import { initLayerGroups, destroyLayerGroups, getOrCreateGroup, clearAllGroups, clearAllGroupsExcept, applyLayerVisibility } from './map/map-layer-groups';
import { useV2MapBridge } from '@/hooks/use-v2-map-bridge';
import { renderV2Features, clearV2Features, refreshV2Icons } from './map/map-v2-renderer';
import {
  COLLECTION_VISIBILITY_EVENT,
  COLLECTION_FIT_BOUNDS_EVENT,
  getCollectionVisibilityState,
  getTintForLocation,
  getTintForRoute,
} from '@/domains/content/lib/collection-visibility';
import { SUBSET_FIT_BOUNDS_EVENT, type SubsetFitDetail } from './map/subset-fit';


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
  // Ids actualmente permitidos como markers (subset visual). Se usa en el
  // handler `popupclose` a nivel de mapa para detectar markers preservados
  // como excepción visual y limpiarlos cuando ya no pertenezcan al subset.
  // Ver `mem://logic/map/popup-persist-on-rebuild`.
  const allowedMarkerIdsRef = useRef<Set<string>>(new Set());
 const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);
 const tileLayerRef = useRef<L.TileLayer | null>(null);
  const homeMarkerRef = useRef<L.Marker | null>(null);
  const userLocationMarkerRef = useRef<L.Marker | null>(null);
  const userLocationCircleRef = useRef<L.Circle | null>(null);
 const prevLocationsCountRef = useRef<number>(0);
  // Último zoom entero usado para repintar markers. byZoom (poi.renderScale.byZoom)
  // está indexado por zoom entero, así que disparamos `map-render-mode-changed`
  // en cada cambio de zoom entero, no solo cuando cambia la banda. Sin esto,
  // intra-banda (z12→z13→z14) los markers quedan congelados a la escala con la
  // que entraron. useRef para sobrevivir re-renders. Mismo redondeo que
  // `getModeScaleForZoom` (Math.round) en map-icons.ts.
  const lastIntZoomRef = useRef<number | null>(null);
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
   const [isCenteredOnUser, setIsCenteredOnUser] = useState(false);
 
  // Measurement units preference
 const [measurementUnits, setMeasurementUnits] = useState<'metric' | 'imperial' | 'auto'>(() => {
 const stored = localStorage.getItem('geodata-measurement-units');
 return (stored as 'metric' | 'imperial' | 'auto') || 'metric';
 });
 
  // Map center config from database/localStorage
 const { config: mapCenterConfig, loading: mapCenterLoading } = useMapCenterConfig();
 

  // Force marker refresh when the "Criterios de Actualización" change
 const [criteriaVersion, setCriteriaVersion] = useState(0);
 
  // Targeted realtime updates: collect the IDs touched since last flush and
  // bump `realtimeTick` once per coalescing window so only the affected markers
  // are refreshed (popup HTML + icon), not the whole 5k-marker set.
  // `pendingRealtimeIdsRef.current === null` means "invalidate all" (full sweep).
  const pendingRealtimeIdsRef = useRef<Set<string> | null>(new Set());
  const [realtimeTick, setRealtimeTick] = useState(0);

  useCoalescedRealtimeTick(({ ids }) => {
    if (ids === null) {
      pendingRealtimeIdsRef.current = null;
    } else if (pendingRealtimeIdsRef.current !== null) {
      ids.forEach((id) => pendingRealtimeIdsRef.current!.add(id));
    }
    setRealtimeTick((v) => v + 1);
  }, { delayMs: 350 });

 // Map center config version to trigger re-centering
 const [centerConfigVersion, setCenterConfigVersion] = useState(0);

  const getDocumentFocusPanelWidth = useCallback(() => {
    const panel = document.querySelector<HTMLElement>(
      '[data-document-focus-panel="true"], [data-collection-focus-panel="true"]'
    );
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
 // realtime/store updates are handled by `useCoalescedRealtimeTick` above
 
 
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

      // FIX TRANSVERSAL: sincronizar render mode con el zoom real ANTES de
      // crear los iconos. Sin esto, los preview markers entraban con el
      // singleton por defecto (`standard`) aunque el zoom real fuera global.
      syncRenderModeFromMap(mapRef.current);

      const bounds: [number, number][] = [];
      previewLocations.forEach((location: GeoLocation) => {
        const isFocused = focusedLocationId === location.id;
        const marker = L.marker([location.coordinates.lat, location.coordinates.lng], {
          icon: createCustomIcon(false, isFocused, !!location.enrichedData, location, criteriaTimestamp, false, getTintForLocation(location.id)),
        });
        marker.bindTooltip(buildHoverTooltipHtml(location), { direction: 'top', offset: [0, -12], className: 'poi-hover-tooltip-wrap', opacity: 1 });
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

  // ── Viewport Culling v1 ────────────────────────────────────────────
  // En z≥13 sólo construimos markers Leaflet para puntos dentro del
  // viewport ampliado. `keepIds` garantiza que focused / popup-abierto
  // sobreviven al culling. Ver `src/components/map/viewport-culling.ts`
  // y `mem://logic/map/viewport-culling-v1`.
  const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(null);
  const [zoomState, setZoomState] = useState<number>(6);
  const [openPopupLocationId, setOpenPopupLocationId] = useState<string | null>(null);
  
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
 // Stable signature of selectedLocations so the auto-zoom effect re-runs
 // whenever the user toggles checkboxes in the geography tree (Andalusia +
 // Catalonia, etc.). For large sets we hash to keep the key small.
 const selectionSignature = React.useMemo(() => {
   if (!selectedLocations || selectedLocations.size === 0) return '0:';
   const ids = Array.from(selectedLocations).sort();
   if (ids.length <= 64) return `${ids.length}:${ids.join(',')}`;
   let h = 0;
   for (const id of ids) {
     for (let i = 0; i < id.length; i++) {
       h = (h * 31 + id.charCodeAt(i)) | 0;
     }
   }
   return `${ids.length}:${h}`;
 }, [selectedLocations]);

 const filterKey = JSON.stringify({
 continent: filters.continent,
 country: filters.country,
 region: filters.region,
 zone: filters.zone,
 tag: filters.tag,
 placeType: filters.placeType,
 onlyEnriched: filters.onlyEnriched,
 searchTerm: filters.searchTerm,
 selection: selectionSignature,
 });

  // Lightweight key that only changes on structural shifts (criteria / source
  // length / focused document). Per-POI enrichment refreshes are handled by the
  // targeted `realtimeTick` effect below, so this no longer needs to iterate
  // thousands of locations on every realtime UPDATE (which was saturating the
  // main thread and preventing Leaflet from loading tiles during batch enrich).
  const enrichmentKey = React.useMemo(() => {
    const source = selectedDocument ? selectedDocument.locations : allLocations;
    return `${criteriaKey}-${selectedDocument?.id ?? 'global'}-${source?.length ?? 0}`;
  }, [selectedDocument, allLocations, criteriaKey]);

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

  // Single source of truth for "go to my location". Used by both the geolocation
  // startup path (applyMapCenter) and the LocateFixed button (handleLocateMe).
  // Returns true on success (GPS or button-IP fallback), false otherwise.
  // - 'startup': silent (no toasts, no setLocating). Never marks centered on failure.
  // - 'button': interactive (toasts + setLocating). IP fallback preserved as today.
  const centerOnUserLocation = useCallback(async (
    source: 'startup' | 'button',
    immediate: boolean = false,
  ): Promise<boolean> => {
    const map = mapRef.current;
    if (!map) return false;

    const applyView = (lat: number, lng: number) => {
      if (immediate) {
        map.setView([lat, lng], INITIAL_GEOLOCATION_ZOOM);
      } else {
        map.flyTo([lat, lng], INITIAL_GEOLOCATION_ZOOM, { duration: 0.8 });
      }
    };

    const fetchIpFallback = async (): Promise<boolean> => {
      const result = await fetchIpGeolocation();
      if (!result) return false;
      setUserLocation({ lat: result.lat, lng: result.lng, accuracy: result.accuracy, source: 'ip' });
      applyView(result.lat, result.lng);
      setIsCenteredOnUser(true);
      if (source === 'button') toast.success('Ubicación aproximada obtenida');
      return true;
    };

    if (!navigator.geolocation) {
      if (source === 'button') {
        toast.error('Tu navegador no soporta geolocalización');
      }
      return false;
    }

    if (source === 'button') {
      setLocating(true);
      toast.info('Solicitando ubicación…');
    }

    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude, accuracy, source: 'gps' });
          applyView(latitude, longitude);
          setIsCenteredOnUser(true);
          if (source === 'button') {
            setLocating(false);
            toast.success('Ubicación obtenida');
          }
          resolve(true);
        },
        async (error) => {
          if (source === 'startup') {
            console.warn('[centerOnUserLocation] startup GPS failed:', error);
            resolve(false);
            return;
          }
          // button: try IP fallback unless permission was explicitly denied
          const canFallback = error.code !== error.PERMISSION_DENIED;
          const ok = canFallback ? await fetchIpFallback() : false;
          setLocating(false);
          if (ok) {
            resolve(true);
            return;
          }
          const msg =
            error.code === error.PERMISSION_DENIED
              ? 'Permiso de ubicación denegado por el navegador'
              : error.code === error.POSITION_UNAVAILABLE
                ? 'Ubicación no disponible'
                : error.code === error.TIMEOUT
                  ? 'El navegador tardó demasiado en responder'
                  : 'No se pudo obtener tu ubicación';
          toast.error(msg);
          console.warn('[centerOnUserLocation] manual locate failed:', error);
          resolve(false);
        },
        GEOLOCATION_OPTS,
      );
    });
  }, []);

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
       // Use GPS via shared contract. Silent on startup; no auto zoomToBounds on success.
       void centerOnUserLocation('startup', immediate).then((ok) => {
         if (!ok && !navigator.geolocation && locations.length > 0) {
           zoomToBounds(immediate, 1);
         }
       });
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
    await centerOnUserLocation('button', false);
  }, [centerOnUserLocation]);

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

  // Track whether the map is currently centered on user's location
  // (proximity-based detection: <150m and zoom >= 13).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const recompute = () => {
      if (!userLocation) {
        setIsCenteredOnUser(false);
        return;
      }
      try {
        const center = map.getCenter();
        const dist = map.distance(center, [userLocation.lat, userLocation.lng]);
        // Umbral leído del canon (richMin del design system) para reconocer
        // el arranque polaroid en modo geolocation.
        setIsCenteredOnUser(dist < 150 && map.getZoom() >= INITIAL_GEOLOCATION_ZOOM);
      } catch {
        setIsCenteredOnUser(false);
      }
    };
    recompute();
    map.on('moveend zoomend', recompute);
    return () => {
      map.off('moveend zoomend', recompute);
    };
  }, [userLocation]);

  // Broadcast locate-me state so external UI (FloatingToolbar) can render the button.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('map-locate-state', {
      detail: {
        locating,
        isCenteredOnUser,
        hasUserLocation: !!userLocation,
        mapTheme,
      },
    }));
  }, [locating, isCenteredOnUser, userLocation, mapTheme]);

  // Listen for external toggle requests from FloatingToolbar.
  useEffect(() => {
    const onToggle = () => {
      if (isCenteredOnUser) {
        zoomToBounds(false);
      } else {
        void handleLocateMe();
      }
    };
    window.addEventListener('map-locate-toggle', onToggle);
    return () => window.removeEventListener('map-locate-toggle', onToggle);
  }, [isCenteredOnUser, handleLocateMe, zoomToBounds]);

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

    // Collection ring width adapts to zoom level (1px world → 3px street)
    const applyRingWidth = (zoom: number) => {
      let w = '2px';
      if (zoom <= 5) w = '1px';
      else if (zoom <= 9) w = '1.5px';
      else if (zoom <= 12) w = '2px';
      else if (zoom <= 15) w = '2.5px';
      else w = '3px';
      document.documentElement.style.setProperty('--collection-ring-width', w);
    };
    applyRingWidth(mapRef.current.getZoom());
    // Inicializa el render mode (Ola 1 — arquitectura visual por zoom).
    // En cada zoomend recalcula el modo; si cambia, emite un evento que un
    // useEffect con acceso al estado fresco (selección/focus/recent) consume
    // para repintar los markers. Mantiene los call-sites intactos: lo lee
    // `createCustomIcon` del módulo `map-icons`.
    // Fuerza el modo inicial y notifica para que cualquier marker creado
    // antes/después con un currentRenderMode obsoleto (módulo singleton entre
    // remounts) se repinte. Sin esto, en vista global los puntos se quedan
    // en 'standard' y no aplica la representación 'micro'.
    const applyZoomModeClass = (mode: MarkerRenderMode) => {
      const c = mapRef.current?.getContainer();
      if (!c) return;
      c.classList.toggle('map-zoom-micro', mode === 'micro');
      c.classList.toggle('map-zoom-compact', mode === 'compact');
      c.classList.toggle('map-zoom-standard', mode === 'standard');
      c.classList.toggle('map-zoom-rich', mode === 'rich');
    };
    const initialMode = getRenderModeForZoom(mapRef.current.getZoom());
    setCurrentZoom(mapRef.current.getZoom());
    setCurrentRenderMode(initialMode);
    applyZoomModeClass(initialMode);
    window.dispatchEvent(new CustomEvent('map-render-mode-changed'));
    // Viewport Culling v1: snapshot inicial de bounds + zoom.
    setZoomState(mapRef.current.getZoom());
    setViewportBounds(mapRef.current.getBounds());
    lastIntZoomRef.current = Math.round(mapRef.current.getZoom());
    mapRef.current.on('zoomend', () => {
      if (!mapRef.current) return;
      const zoom = mapRef.current.getZoom();
      const intZoom = Math.round(zoom); // mismo redondeo que getModeScaleForZoom
      applyRingWidth(zoom);
      setCurrentZoom(zoom);
      setZoomState(zoom);
      setViewportBounds(mapRef.current.getBounds());
      const mode = getRenderModeForZoom(zoom);
      const changed = setCurrentRenderMode(mode);
      applyZoomModeClass(mode);
      // Repintar siempre que cambie el zoom entero: byZoom se indexa por zoom,
      // no por banda. Sin esto la rampa intra-banda (compact 0.85→0.95,
      // standard 1.00→1.05→1.10, rich z15→z16) no se aplica y los markers
      // parecen "congelados" hasta saltar de banda.
      const zoomTickChanged = lastIntZoomRef.current !== intZoom;
      if (changed || zoomTickChanged) {
        window.dispatchEvent(new CustomEvent('map-render-mode-changed'));
      }
      lastIntZoomRef.current = intZoom;
    });
    // Viewport Culling v1: actualiza bounds tras pan (sin tocar zoom mode).
    mapRef.current.on('moveend', () => {
      if (!mapRef.current) return;
      setViewportBounds(mapRef.current.getBounds());
    });
    // Viewport Culling v1: rastrea popup abierto a nivel de mapa para keepIds.
    mapRef.current.on('popupopen', (e: L.PopupEvent) => {
      const id = (e.popup.options as { locationId?: string })?.locationId ?? null;
      setOpenPopupLocationId(id);
    });
    mapRef.current.on('popupclose', (e: L.PopupEvent) => {
      const closedId = (e.popup.options as { locationId?: string })?.locationId ?? null;
      setOpenPopupLocationId(null);
      // PR-POPUP-PERSIST: si el marker fue preservado como excepción visual
      // (POI fuera del subset actual), eliminarlo al cerrar el popup.
      if (closedId && !allowedMarkerIdsRef.current.has(closedId)) {
        const orphan = markersRef.current.get(closedId);
        if (orphan) {
          orphan.remove();
          markersRef.current.delete(closedId);
        }
      }
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
    //
    // CANVAS_BACKEND_TRIGGER (deferred — ver `.lovable/plan.md` y
    // `mem://architecture/canvas-backend-deferred`):
    //   El backend canvas para markers se considerará SOLO cuando, tras
    //   clustering, queden >5.000 markers individuales visibles en viewport
    //   simultáneamente. Con `maxClusterRadius: 50` esto ocurre muy tarde:
    //   medición 2026-05-11 → 5.073 puntos totales → 319 DOM nodes. El cluster
    //   ya hace ese trabajo. No introducir canvas como optimización prematura.
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

    // Panes de prioridad visual (Ola 2 — arquitectura visual por zoom).
    // `mine-pane` se dibuja SIEMPRE encima de `others-pane`; `selection-pane`
    // por encima de ambos. Asignamos `pane` por marker según ownership.
    // Z-index base de markerPane = 600 (Leaflet default). Mantenemos un
    // delta pequeño para no romper popups (z700) ni tooltips (z650).
    const _map = mapRef.current;
    if (!_map.getPane('others-pane')) {
      _map.createPane('others-pane');
      const p = _map.getPane('others-pane')!;
      p.style.zIndex = '590';
    }
    if (!_map.getPane('mine-pane')) {
      _map.createPane('mine-pane');
      const p = _map.getPane('mine-pane')!;
      p.style.zIndex = '610';
    }
    if (!_map.getPane('selection-pane')) {
      _map.createPane('selection-pane');
      const p = _map.getPane('selection-pane')!;
      p.style.zIndex = '630';
    }

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

  // Viewport Culling v1 — keepIds: fuentes que sobreviven al culling aunque
  // estén fuera del viewport ampliado. selectedLocations queda FUERA (riesgo
  // bulk). Cualquier panel nuevo que seleccione un POI debe registrar su id
  // aquí. Ver `mem://logic/map/viewport-culling-v1`.
  const keepIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (focusedLocationId) ids.add(focusedLocationId);
    if (openPopupLocationId) ids.add(openPopupLocationId);
    return ids;
  }, [focusedLocationId, openPopupLocationId]);

  // Subset visual renderizable. `locations` (filteredLocations) sigue siendo
  // verdad lógica para store, contadores, listas, exportación, fit-bounds
  // inicial y priming de colecciones. SOLO el path de cluster usa este subset.
  const markerLocations = React.useMemo(
    () => applyViewportCulling(locations, viewportBounds, zoomState, keepIds),
    [locations, viewportBounds, zoomState, keepIds],
  );

  // Firma barata del subset: evita reconstruir el cluster cuando un moveend no
  // cambia el conjunto de IDs visibles. Sustituye al antiguo locationIds.
  const locationIds = React.useMemo(
    () => getLocationSubsetSignature(markerLocations),
    [markerLocations],
  );

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.debug('[map-culling]', {
      zoom: zoomState,
      filtered: locations.length,
      rendered: markerLocations.length,
      kept: keepIds.size,
    });
  }, [locationIds, zoomState, locations.length, keepIds.size, markerLocations.length]);

  // Publica el subset visual al discovery-store para que features opt-in
  // (CTA "Sólo visibles" del eje Salud) puedan leerlo sin acceder al mapa.
  // No es la verdad lógica del filtro — sólo subset visual del viewport.
  const setVisibleLocationIds = useDiscoveryStore((s) => s.setVisibleLocationIds);
  React.useEffect(() => {
    setVisibleLocationIds(new Set<string>(markerLocations.map((l) => l.id)));
  }, [locationIds, setVisibleLocationIds]);
 
  useEffect(() => {
  if (!mapRef.current || !markerClusterRef.current) return;

    // PR-POPUP-PERSIST: preservar el marker dueño del popup abierto durante
    // un rebuild del mapa, aunque el POI haya salido del subset filtrado
    // tras una acción de recovery. Excepción visual estrictamente temporal:
    // el marker se elimina en `popupclose` si ya no pertenece al subset.
    // Ver `mem://logic/map/popup-persist-on-rebuild`.
    const preservedId = openPopupLocationId;
    const preservedMarker = preservedId ? markersRef.current.get(preservedId) : null;
    const preservedIsOpen = !!preservedMarker && preservedMarker.isPopupOpen();
    const preservedLocation = preservedIsOpen
      ? (locationsRef.current.get(preservedId!) ?? locations.find(l => l.id === preservedId) ?? null)
      : null;

    // Single source of truth para fit / popup refresh / fallback fuera de
    // viewport-culling: `locationsRef` debe contener SIEMPRE el universo
    // lógico actual (`locations`), no sólo `markerLocations`. Además, si
    // hay un POI preservado fuera del filtro, mantenemos su entry para que
    // el popup tenga datos coherentes hasta que se cierre.
    const nextLocationsRef = new Map(locations.map((location) => [location.id, location]));
    if (preservedLocation && !nextLocationsRef.has(preservedLocation.id)) {
      nextLocationsRef.set(preservedLocation.id, preservedLocation);
    }
    locationsRef.current = nextLocationsRef;

    // Clear markers — pero NO el preservado. `marker.remove()` y
    // `clearAllGroups()` cierran el popup; usamos `clearAllGroupsExcept`
    // y saltamos el `.remove()` del preservado.
    markersRef.current.forEach((marker, id) => {
      if (preservedIsOpen && id === preservedId) return;
      marker.remove();
    });
    const nextMarkers = new Map<string, L.Marker>();
    if (preservedIsOpen && preservedMarker) {
      nextMarkers.set(preservedId!, preservedMarker);
    }
    markersRef.current = nextMarkers;

    if (preservedIsOpen && preservedMarker) {
      clearAllGroupsExcept(preservedMarker);
    } else {
      clearAllGroups();
    }

  if (markerLocations.length === 0 && locations.length === 0) return;

  // Viewport Culling v1: usamos `markerLocations` (subset visual) para
  // construir markers Leaflet. `locations` (verdad lógica) se sigue
  // empleando para fit-bounds inicial y priming de colecciones.
  const colocatedOffsets = computeColocatedOffsets(markerLocations);

  const markersToAdd: L.Marker[] = [];

     // Add new markers
  markerLocations.forEach((location) => {
    // Skip recreating the preserved marker — ya está vivo en el mapa con
    // popup abierto. Solo refrescamos su icono al final del efecto.
    if (preservedIsOpen && location.id === preservedId) return;
  const isSelected = selectedLocations.has(location.id);
  const isFocused = focusedLocationId === location.id;
  const isEnriched = !!location.enrichedData;
  const ownership = getLocationOwnership(location.id, currentUserId);

  // Use offset coordinates if this marker is co-located with others
  const offset = colocatedOffsets.get(location.id);
  const markerLat = offset ? offset.lat : location.coordinates.lat;
  const markerLng = offset ? offset.lng : location.coordinates.lng;

  const marker = L.marker([markerLat, markerLng], {
  icon: createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, false, getTintForLocation(location.id), ownership.isOwn),
  pane: ownership.isOwn ? 'mine-pane' : 'others-pane',
  });

  // Hover preview tooltip (single helper). Visibility of the hero image is
  // gated by CSS classes on the map container (`map-zoom-standard`,
  // `map-zoom-rich`) set in the zoomend listener. The same tooltip works at
  // every zoom; CSS hides/shows the <img>.
  marker.bindTooltip(buildHoverTooltipHtml(location, ownership), {
    direction: 'top',
    offset: [0, -12],
    className: 'poi-hover-tooltip-wrap',
    opacity: 1,
  });

       // Create popup with content including ownership info
 const popupContent = createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations);
 marker.bindPopup(popupContent, {
 // Ancho fijo único — debe coincidir con CARD.maxWidth en card-style-tokens.
 // Mantiene el wrapper de Leaflet con el mismo ancho para popups enriquecidos
 // y no enriquecidos. No usar valores distintos aquí.
 maxWidth: 360,
 minWidth: 360,
 // No `maxHeight` here: the popup root owns its own scroll so the hero
 // image stays fixed while only the body scrolls.
 className: 'custom-popup',
 closeButton: true,
 autoPan: true,
 autoPanPadding: L.point(50, 80),
 // Viewport Culling v1: identifica el POI dueño del popup en map-level
 // popupopen/popupclose para mantenerlo en `keepIds`.
 locationId: location.id,
 } as L.PopupOptions & { locationId: string });

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

  // Hidrata <UnenrichedRecoveryBlock> dentro del popup cuando se abre.
   // Helper único. Solo se monta si el POI no está enriquecido (decidido por
   // el propio componente con getPointVisualState).
   bindRecoveryMount(marker, () => locationsRef.current.get(location.id));

   // Los hashtags de colección se pintan directamente en el HTML del popup
   // desde `location-collections-store` (fuente única, lectura síncrona).
   // Al abrir el popup, aseguramos que el store esté hidratado para este
   // punto; si llega después, el listener global regenera el HTML.
   marker.on('popupopen', () => {
     primeCollectionsForLocations([location.id]);
   });

 markersRef.current.set(location.id, marker);
 locationsRef.current.set(location.id, location);
 
      // Determine layer type and add marker to the correct LayerGroup
      // Single Source of Truth: location.isApproved decide Catálogo vs Mesa.
      // documents.status NO afecta a la asignación de capa.
      const locLayerType = (location as any)?._layerType as import('@/hooks/use-layer-visibility').LayerType | undefined;
      let layerType: import('@/hooks/use-layer-visibility').LayerType;
      let entityId: string | undefined;
      if (locLayerType) {
        layerType = locLayerType;
      } else if (ownership.isOwn) {
        layerType = location.isApproved ? 'catalog' : 'workspace';
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

    // Refresca el icono del marker preservado para reflejar el nuevo estado
    // (p. ej. recién enriquecido tras una acción del recovery block).
    if (preservedIsOpen && preservedMarker && preservedLocation) {
      try {
        const ownership = getLocationOwnership(preservedLocation.id, currentUserId);
        preservedMarker.setIcon(
          createCustomIcon(
            selectedLocations.has(preservedLocation.id),
            focusedLocationId === preservedLocation.id,
            !!preservedLocation.enrichedData,
            preservedLocation,
            criteriaTimestamp,
            false,
            getTintForLocation(preservedLocation.id),
            ownership.isOwn,
          ),
        );
      } catch { /* noop */ }
    }

    // Sincroniza set de ids "permitidos" para que el `popupclose` a nivel
    // de mapa pueda detectar markers preservados huérfanos (ids ya fuera
    // del subset filtrado) y limpiarlos al cerrar el popup.
    allowedMarkerIdsRef.current = new Set(markerLocations.map(l => l.id));

    // Prime collection chips store con todos los puntos visibles.
    primeCollectionsForLocations(locations.map((l) => l.id));
  }, [locationIds, toggleLocationSelection, setFocusedLocation]);

  // Regenera el HTML del popup cuando cambian las colecciones de un punto
  // (suscripción única al store transversal). Cubre puntos nuevos, recién
  // enriquecidos, y cambios de membership desde cualquier vista.
  useEffect(() => {
    const unsubscribe = subscribeLocationCollections((changed) => {
      const ids = changed ? Array.from(changed) : Array.from(markersRef.current.keys());
      ids.forEach((id) => {
        const marker = markersRef.current.get(id);
        const location = locationsRef.current.get(id);
        if (!marker || !location) return;
        try {
          const ownership = getLocationOwnership(location.id, currentUserId);
          marker.setPopupContent(
            createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations),
          );
          // FIX TRANSVERSAL: cambios de colección (alta/baja, toggle visibilidad,
          // profile editado) DEBEN repintar también el icono — antes solo se
          // refrescaba el popup, lo que dejaba el tinte/anillo de colección
          // desincronizado del estado real.
          const isSelected = selectedLocations.has(id);
          const isFocused = focusedLocationId === id;
          const isEnriched = !!location.enrichedData;
          const isRecentlyEnriched = recentlyEnrichedIds.has(id);
          marker.setIcon(
            createCustomIcon(
              isSelected,
              isFocused,
              isEnriched,
              location,
              criteriaTimestamp,
              isRecentlyEnriched,
              getTintForLocation(id),
              ownership.isOwn,
            ),
          );
        } catch { /* noop */ }
      });
      // Si fue un refresh completo (invalidateAll), volvemos a primear los
      // puntos visibles para que vuelvan a poblarse desde la BD.
      if (!changed) {
        primeCollectionsForLocations(Array.from(markersRef.current.keys()));
      }
    });
    return () => { unsubscribe(); };
  }, [getLocationOwnership, currentUserId, criteriaTimestamp, canEnrichLocations, selectedLocations, focusedLocationId, recentlyEnrichedIds]);

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
 marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched, getTintForLocation(location.id), getLocationOwnership(location.id, currentUserId).isOwn));
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

  // Targeted realtime refresh: update ONLY the markers that actually changed
  // during the last coalescing window. Avoids the previous full-sweep loop over
  // all 5k locations on every enrichment, which was saturating the main thread
  // and starving Leaflet's tile fetcher (the map went gray during batch enrich).
  useEffect(() => {
    if (!mapRef.current) return;
    if (realtimeTick === 0) return; // initial mount has nothing to refresh

    const pending = pendingRealtimeIdsRef.current;
    pendingRealtimeIdsRef.current = new Set();

    // pending === null  → invalidate all (rare: store-updated / delete)
    // pending.size > 0  → targeted refresh
    const targetIds: string[] | null = pending === null
      ? null
      : Array.from(pending);
    if (targetIds && targetIds.length === 0) return;

    const iter = targetIds ?? Array.from(markersRef.current.keys());
    iter.forEach((id) => {
      const marker = markersRef.current.get(id);
      if (!marker) return;
      // Find the up-to-date location from the rendered `locations` list so we
      // pick up store mutations (enriched_data, customData, etc.).
      const location = locations.find((l) => l.id === id) ?? locationsRef.current.get(id);
      if (!location) return;
      locationsRef.current.set(id, location);
      try {
        const ownership = getLocationOwnership(id, currentUserId);
        marker.setPopupContent(
          createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations),
        );
      } catch (e) {
        console.warn('Error updating popup content for location:', id, e);
      }
      const isSelected = selectedLocations.has(id);
      const isFocused = focusedLocationId === id;
      const isEnriched = !!location.enrichedData;
      const isRecentlyEnriched = recentlyEnrichedIds.has(id);
      const ownership2 = getLocationOwnership(id, currentUserId);
      marker.setIcon(
        createCustomIcon(
          isSelected,
          isFocused,
          isEnriched,
          location,
          criteriaTimestamp,
          isRecentlyEnriched,
          getTintForLocation(id),
          ownership2.isOwn,
        ),
      );
      // Rebuild hover tooltip so the Hero <img> reflects post-enrichment state.
      marker.unbindTooltip();
      marker.bindTooltip(buildHoverTooltipHtml(location, ownership2), {
        direction: 'top', offset: [0, -12],
        className: 'poi-hover-tooltip-wrap', opacity: 1,
      });
    });
  }, [realtimeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-POI immediate repaint: when a single location-realtime-update arrives
  // with a concrete locationId, repaint THAT marker right away (icon + popup),
  // without waiting for the 350ms coalescing tick. This gives the user a
  // continuous drip of markers turning green during batch enrich, instead of
  // perceiving "bursts" every coalescing window.
  //
  // Invalidations without a locationId (store-updated, deletes) keep using
  // the coalesced tick above for full-sweep refresh.
  useEffect(() => {
    if (!mapRef.current) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { locationId?: string; kind?: string } | undefined;
      const id = detail?.locationId;
      if (!id) return; // full-sweep path handled by realtimeTick effect
      const marker = markersRef.current.get(id);
      if (!marker) return; // marker not yet mounted; tick path will catch it
      // Pull latest location from store (single source of truth) so we don't
      // depend on this component having re-rendered yet.
      const docs = useLocationsStore.getState().documents;
      let fresh: GeoLocation | undefined;
      for (const d of docs) {
        const found = d.locations.find((l) => l.id === id);
        if (found) { fresh = found; break; }
      }
      const location = fresh ?? locationsRef.current.get(id);
      if (!location) return;
      locationsRef.current.set(id, location);
      try {
        const ownership = getLocationOwnership(id, currentUserId);
        marker.setPopupContent(
          createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations),
        );
      } catch (err) {
        console.warn('per-POI popup refresh failed', id, err);
      }
      const isSelected = selectedLocations.has(id);
      const isFocused = focusedLocationId === id;
      const isEnriched = !!location.enrichedData;
      const isRecentlyEnriched = recentlyEnrichedIds.has(id);
      const ownership3 = getLocationOwnership(id, currentUserId);
      marker.setIcon(
        createCustomIcon(
          isSelected,
          isFocused,
          isEnriched,
          location,
          criteriaTimestamp,
          isRecentlyEnriched,
          getTintForLocation(id),
          ownership3.isOwn,
        ),
      );
      marker.unbindTooltip();
      marker.bindTooltip(buildHoverTooltipHtml(location, ownership3), {
        direction: 'top', offset: [0, -12],
        className: 'poi-hover-tooltip-wrap', opacity: 1,
      });
    };
    window.addEventListener('location-realtime-update', handler);
    return () => window.removeEventListener('location-realtime-update', handler);
  }, [getLocationOwnership, currentUserId, criteriaTimestamp, canEnrichLocations, selectedLocations, focusedLocationId, recentlyEnrichedIds]);


  // Update marker icons when selection or focus changes
 useEffect(() => {
 markersRef.current.forEach((marker, locationId) => {
 const location = locationsRef.current.get(locationId);
 const isSelected = selectedLocations.has(locationId);
 const isFocused = focusedLocationId === locationId;
 const isEnriched = !!location?.enrichedData;
 const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
 marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched, getTintForLocation(locationId), getLocationOwnership(locationId, currentUserId).isOwn));
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
        marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched, getTintForLocation(locationId), getLocationOwnership(locationId, currentUserId).isOwn));
      });
    });
    return unsub;
  }, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds]);

  // Render-mode change (Ola 1): cuando zoomend cambia el modo en map-icons,
  // repintamos todos los markers con el estado React actual (selección/focus/
  // recent) para que el cambio de fidelidad sea atómico y no pierda highlights.
  useEffect(() => {
    const handler = () => {
      markersRef.current.forEach((marker, locationId) => {
        const location = locationsRef.current.get(locationId);
        const isSelected = selectedLocations.has(locationId);
        const isFocused = focusedLocationId === locationId;
        const isEnriched = !!location?.enrichedData;
        const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
        const ownership = getLocationOwnership(locationId, currentUserId);
        marker.setIcon(createCustomIcon(
          isSelected, isFocused, isEnriched, location, criteriaTimestamp,
          isRecentlyEnriched, getTintForLocation(locationId),
          ownership.isOwn,
        ));
        // Rebuild tooltip so the Hero <img> appears as soon as the marker
        // enters standard/rich, even if the location was enriched after the
        // marker was originally created. Same helper, no new logic.
        if (location) {
          marker.unbindTooltip();
          marker.bindTooltip(buildHoverTooltipHtml(location, ownership), {
            direction: 'top',
            offset: [0, -12],
            className: 'poi-hover-tooltip-wrap',
            opacity: 1,
          });
        }
      });
      // Refresh cluster icons so markers emerging from spiderfy inherit
      // the current band's icon.
      markerClusterRef.current?.refreshClusters();
    };
    window.addEventListener('map-render-mode-changed', handler);
    return () => window.removeEventListener('map-render-mode-changed', handler);
  }, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, currentUserId]);

  // Anillo rojo de error: pre-warm de fallos al montar el mapa y re-render
  // de iconos cuando el store de fallos invalida (realtime / location:enriched).
  // Ver mem://style/map/error-outline-rule.
  useEffect(() => {
    void prewarmEnrichmentFailures();
    const unsub = subscribeFailureChange(() => {
      markersRef.current.forEach((marker, locationId) => {
        const location = locationsRef.current.get(locationId);
        const isSelected = selectedLocations.has(locationId);
        const isFocused = focusedLocationId === locationId;
        const isEnriched = !!location?.enrichedData;
        const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
        marker.setIcon(createCustomIcon(
          isSelected, isFocused, isEnriched, location, criteriaTimestamp,
          isRecentlyEnriched, getTintForLocation(locationId),
          getLocationOwnership(locationId, currentUserId).isOwn,
        ));
      });
    });
    return unsub;
  }, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds]);


  // ── Collection visibility tint ──────────────────────────────────────────
  // El anillo de los markers vive DENTRO de createCustomIcon (sobrevive a
  // cluster/realtime/force-update). Aquí solo:
  //  1) recomponemos el icono cuando cambia la visibilidad de colecciones,
  //  2) aplicamos el color al setStyle de las rutas miembros.
  // Fuente única: collection-visibility (ADR 004).
  useEffect(() => {
    const applyTint = () => {
      // Markers: re-render del icono con el nuevo tint.
      markersRef.current.forEach((marker, locationId) => {
        const location = locationsRef.current.get(locationId);
        if (!location) return;
        const isSelected = selectedLocations.has(locationId);
        const isFocused = focusedLocationId === locationId;
        const isEnriched = !!location.enrichedData;
        const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
        marker.setIcon(createCustomIcon(
          isSelected, isFocused, isEnriched, location, criteriaTimestamp,
          isRecentlyEnriched, getTintForLocation(locationId),
          getLocationOwnership(locationId, currentUserId).isOwn,
        ));
      });

      // Rutas: setStyle con el color de la colección visible (o restaurar).
      routeLayersRef.current.forEach((layer: any) => {
        if (!layer || typeof layer.setStyle !== 'function') return;
        const rid = layer._routeId;
        if (!rid) return;
        const tint = getTintForRoute(rid);
        if (tint) {
          if (layer._originalColor == null) layer._originalColor = layer.options?.color || '#3b82f6';
          layer.setStyle({ color: tint, opacity: 1, weight: (layer._baseWeight || 4) + 1 });
        } else if (layer._originalColor != null) {
          layer.setStyle({ color: layer._originalColor, weight: layer._baseWeight, opacity: layer._baseOpacity });
          layer._originalColor = null;
        }
      });
    };

    applyTint();
    window.addEventListener(COLLECTION_VISIBILITY_EVENT, applyTint);
    return () => window.removeEventListener(COLLECTION_VISIBILITY_EVENT, applyTint);
  }, [locationIds, selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds]);

  // Auto-fit centralizado al añadir/quitar/togglear/mutar una colección visible.
  useEffect(() => {
    const handler = (e: Event) => {
      const map = mapRef.current;
      if (!map) return;
      const detail = (e as CustomEvent).detail || {};
      const { collectionId, mode = 'if-outside' } = detail as { collectionId: string; mode?: 'always' | 'if-outside' };
      const entry = getCollectionVisibilityState().visible[collectionId];
      if (!entry) return;
      const pts: [number, number][] = [];
      entry.locationIds.forEach((id) => {
        const marker = markersRef.current.get(id);
        if (marker) {
          const ll = marker.getLatLng();
          pts.push([ll.lat, ll.lng]);
        }
      });
      if (pts.length === 0) return;
      if (pts.length === 1) {
        const [lat, lng] = pts[0];
        const viewport = map.getBounds();
        const inside = viewport.contains(L.latLng(lat, lng));
        if (mode === 'always' || !inside) {
          map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
        }
        return;
      }
      const bounds = L.latLngBounds(pts);
      if (mode === 'always') {
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 14, duration: 0.6 });
        return;
      }
      // 'if-outside': mover si <30% de los puntos están dentro del viewport actual.
      const viewport = map.getBounds();
      const insideCount = pts.reduce((n, [lat, lng]) => n + (viewport.contains(L.latLng(lat, lng)) ? 1 : 0), 0);
      const insideRatio = insideCount / pts.length;
      if (insideRatio < 0.3) {
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 14, duration: 0.6 });
      }
    };
    window.addEventListener(COLLECTION_FIT_BOUNDS_EVENT, handler);
    return () => window.removeEventListener(COLLECTION_FIT_BOUNDS_EVENT, handler);
  }, []);

  // ── Subset-fit canónico (PR-4A.1) ───────────────────────────────────────
  // Cooldown de "intención manual del usuario": si ha movido/zoomeado/dragueado
  // en los últimos 4s, abortamos el fit silenciosamente. El guard
  // `e.originalEvent != null` distingue gestos reales de fits programáticos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const COOLDOWN_MS = 4000;
    const FIT_CLAMP_ZOOM = ZOOM_THRESHOLDS.richMin; // ~ z12
    const INSIDE_RATIO_THRESHOLD = 0.4;
    let lastUserInteractionAt = 0;

    const onUserGesture = (e: any) => {
      // Solo gestos reales: flyTo/flyToBounds programáticos no traen originalEvent.
      if (e?.originalEvent != null) {
        lastUserInteractionAt = Date.now();
      }
    };
    map.on('movestart', onUserGesture);
    map.on('zoomstart', onUserGesture);
    map.on('dragstart', onUserGesture);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SubsetFitDetail>).detail;
      if (!detail || !Array.isArray(detail.locationIds) || detail.locationIds.length === 0) return;
      if (Date.now() - lastUserInteractionAt < COOLDOWN_MS) return;

      const mode = detail.mode ?? 'if-outside';
      const pts: [number, number][] = [];
      for (const id of detail.locationIds) {
        // 1) marker montado (rápido)
        const marker = markersRef.current.get(id);
        if (marker) {
          const ll = marker.getLatLng();
          pts.push([ll.lat, ll.lng]);
          continue;
        }
        // 2) fallback: store de locations (puede no estar montado por culling)
        const loc = locationsRef.current.get(id);
        if (loc?.coordinates?.lat != null && loc.coordinates.lng != null) {
          pts.push([loc.coordinates.lat, loc.coordinates.lng]);
        }
      }
      if (pts.length === 0) return;

      const minZoomFloor =
        typeof detail.minZoom === 'number' && Number.isFinite(detail.minZoom)
          ? detail.minZoom
          : null;

      const applyMinZoomFloor = () => {
        if (minZoomFloor == null) return;
        if (map.getZoom() < minZoomFloor) {
          map.setZoom(minZoomFloor);
        }
      };

      if (pts.length === 1) {
        const [lat, lng] = pts[0];
        const viewport = map.getBounds();
        const inside = viewport.contains(L.latLng(lat, lng));
        if (mode === 'always' || !inside) {
          const target = Math.max(map.getZoom(), FIT_CLAMP_ZOOM, minZoomFloor ?? 0);
          map.flyTo([lat, lng], target, { duration: 0.6 });
        } else {
          applyMinZoomFloor();
        }
        return;
      }

      const bounds = L.latLngBounds(pts);
      const fitOpts: L.FitBoundsOptions = { padding: [60, 60], maxZoom: FIT_CLAMP_ZOOM };
      if (mode === 'always') {
        map.flyToBounds(bounds, { ...fitOpts, duration: 0.6 });
        if (minZoomFloor != null) {
          // Tras la animación, asegurar piso de zoom.
          map.once('moveend', applyMinZoomFloor);
        }
        return;
      }
      // 'if-outside': mover si <40% de los puntos están dentro del viewport actual.
      const viewport = map.getBounds();
      const insideCount = pts.reduce(
        (n, [lat, lng]) => n + (viewport.contains(L.latLng(lat, lng)) ? 1 : 0),
        0,
      );
      const insideRatio = insideCount / pts.length;
      if (insideRatio < INSIDE_RATIO_THRESHOLD) {
        map.flyToBounds(bounds, { ...fitOpts, duration: 0.6 });
        if (minZoomFloor != null) {
          map.once('moveend', applyMinZoomFloor);
        }
      } else {
        applyMinZoomFloor();
      }
    };

    window.addEventListener(SUBSET_FIT_BOUNDS_EVENT, handler);
    return () => {
      map.off('movestart', onUserGesture);
      map.off('zoomstart', onUserGesture);
      map.off('dragstart', onUserGesture);
      window.removeEventListener(SUBSET_FIT_BOUNDS_EVENT, handler);
    };
  }, []);

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

    // Refresca icons V2 en cada zoomend para que sigan el canon de bandas
    // (micro/compact/standard/rich). Sin esto, los markers V2 quedarían
    // congelados en el render mode del zoom inicial.
    const onZoomEnd = () => {
      refreshV2Icons(map, v2MarkersRef.current, v2Features);
    };
    map.on('zoomend', onZoomEnd);

    return () => {
      map.off('zoomend', onZoomEnd);
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

  // Catálogo stats — Single Source of Truth: location.isApproved.
  // documents.status no afecta. Ver src/domains/content/lib/location-bucket.ts
  const catalogStats = React.useMemo(() => {
    const allLocs = useLocationsStore.getState().getAllLocations();
    const stats = getBucketStats(allLocs as any, currentUserId);
    return {
      myCatalogCount: stats.myCatalog,
      totalCatalogCount: stats.catalogTotal,
    };
  }, [allLocationsCount, currentUserId]);
  const documentsCount = documents.length;

  // Stats sociales (seguidos / seguidores)
  const { stats: socialStats } = useSocialStats();

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
  const bottomLegendRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const measureFooterSafeInset = () => {
      const el = bottomLegendRef.current;
      if (!el) {
        clearBottomSafeInset('footer');
        return;
      }

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const bottomInset = Math.max(0, viewportHeight - rect.top);
      setBottomSafeInset('footer', bottomInset);
    };

    measureFooterSafeInset();
    const ro = new ResizeObserver(measureFooterSafeInset);
    if (bottomLegendRef.current) ro.observe(bottomLegendRef.current);
    window.addEventListener('resize', measureFooterSafeInset);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureFooterSafeInset);
      clearBottomSafeInset('footer');
    };
  }, [locations.length, totalLocations, mapTheme, showZoomButton]);

  // Reabrir summary desde el menú/avatar mediante evento.
  useEffect(() => {
    const handler = () => {
      setSummaryShown(false);
      setWelcomeDismissed(false);
    };
    window.addEventListener('vandits:show-welcome', handler);
    return () => window.removeEventListener('vandits:show-welcome', handler);
  }, []);

  const loadingTasks = useActiveLoadings();
  const isCatalogLoading = loadingTasks.some((t) => t.id === 'db-sync');
  const showOnboardingCard = dataReady && !isCatalogLoading && welcomeMode === 'onboarding' && !welcomeDismissed;
  const showSummaryCard = dataReady && !isCatalogLoading && welcomeMode === 'summary' && !welcomeDismissed && !summaryShown;
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
 
 {/* "Ver N ubicaciones" — integrado en la pill inferior derecha (ver bloque legend) */}
   {/* Locate-me button moved to FloatingToolbar (top bar). State broadcast via 'map-locate-state'. */}

 {/* Map Center Settings - now in UserProfileEditor */}

 {/* Legend and stats - single line bottom right */}
  <div ref={bottomLegendRef} className="absolute bottom-4 right-4 z-[999]">
 <div className={cn(
 "backdrop-blur-sm rounded-full px-4 py-2 shadow-md text-xs flex items-center gap-4",
 mapTheme === 'dark' ? 'bg-gray-900/95' : 'bg-white/95'
 )}>
 {/* Location count + zoom-to-fit */}
 <div className="flex items-center gap-2 pr-3 border-r border-border/50">
 <MapPin className="w-3.5 h-3.5 text-primary" />
 <span className="font-semibold">{locations.length}</span>
 {locations.length !== totalLocations && (
 <span className={mapTheme === 'dark' ? 'text-gray-400' : 'text-muted-foreground'}>/ {totalLocations}</span>
 )}
 {showZoomButton && (
 <button
 type="button"
 onClick={() => zoomToBounds(false)}
 title={`Ver ${locations.length} ubicaciones`}
 aria-label={`Ver ${locations.length} ubicaciones`}
 className={cn(
 "ml-1 inline-flex items-center justify-center h-6 w-6 rounded-full transition-colors",
 mapTheme === 'dark'
 ? 'text-gray-300 hover:bg-gray-800'
 : 'text-gray-600 hover:bg-gray-100'
 )}
 >
 <Maximize2 className="w-3.5 h-3.5" />
 </button>
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

      {/* Catalog loading card — replaces welcome popup while initial sync is in flight */}
      <CatalogLoadingCard userDisplayName={userDisplayName} lastSeenAt={lastSeenAt} />

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
                    ? `Último acceso: ${lastSeenAt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} ${lastSeenAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`
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

                  {/* 4 cifras alineadas */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-background/40 p-3 text-center">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-base font-bold text-foreground leading-none">
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
                        <span className="text-base font-bold text-foreground leading-none">
                          {catalogStats.totalCatalogCount.toLocaleString('es-ES')}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                        Total accesible
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-background/40 p-3 text-center">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-violet-500" />
                        <span className="text-base font-bold text-foreground leading-none">
                          {socialStats.followingCount.toLocaleString('es-ES')}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                        Seguidos
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-background/40 p-3 text-center">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span className="text-base font-bold text-foreground leading-none">
                          {socialStats.followersCount.toLocaleString('es-ES')}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                        Seguidores
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
                      onClick={() => {
                        setWelcomeDismissed(true);
                        setFilters(resetAllFilters(filters));
                        window.dispatchEvent(new CustomEvent('map-reset-view'));
                      }}
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
