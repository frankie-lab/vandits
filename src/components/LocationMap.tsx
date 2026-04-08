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
import { useMapViewMode } from '@/hooks/use-map-view-mode';
import { useHeatmapConfig } from '@/hooks/use-heatmap-config';
import { useMapTheme } from '@/hooks/use-map-theme';
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
import {
  setupFilterLinkHandler, setupActionClickHandler,
  setupVisitedUpdatedHandler, setupRatingUpdatedHandler,
  setupNotesUpdatedHandler, setupPhotoUpdatedHandler,
} from './map/map-popup-handlers';
import { useMapHeatmap } from './map/useMapHeatmap';
import { useEnrichmentTracker } from './map/useEnrichmentTracker';

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
 const [viewMode] = useMapViewMode();
 
 const { heatmapZoomThreshold } = useHeatmapConfig();
 const userViewModeRef = useRef<ViewMode>(viewMode);
 const { mapTheme, setMapTheme: _setMapTheme } = useMapTheme();
  // showCenterSettings removed - now in UserProfileEditor
 const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
 
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

 useEffect(() => {
  userViewModeRef.current = viewMode;
 }, [viewMode]);

 useEffect(() => {
 const handleCriteriaChanged = () => setCriteriaVersion((v) => v + 1);
 const handleRealtimeUpdate = () => setForceUpdateCount((v) => v + 1);
 // heatmap threshold now managed by useHeatmapConfig hook
 
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
 window.addEventListener('map-go-home', handleGoHome);
 window.addEventListener('map-set-theme', handleSetTheme);
 window.addEventListener('map-fit-bounds', handleFitBounds);
 window.addEventListener('curator-info-updated', handleRealtimeUpdate);
 window.addEventListener('curator-info-updated', handleCuratorVisibilityUpdate);
  window.addEventListener('measurement-units-changed', handleMeasurementUnitsChanged);
  // heatmap threshold event now handled by useHeatmapConfig hook
 
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
  mapRef.current?.on('click', handleMapRouteClickEvent);
  window.addEventListener('route-alternative-hover', handleAlternativeHoverEvent);

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
    
    window.removeEventListener('map-go-home', handleGoHome);
    window.removeEventListener('map-set-theme', handleSetTheme);
    window.removeEventListener('map-fit-bounds', handleFitBounds);
    window.removeEventListener('curator-info-updated', handleRealtimeUpdate);
    window.removeEventListener('curator-info-updated', handleCuratorVisibilityUpdate);
    window.removeEventListener('measurement-units-changed', handleMeasurementUnitsChanged);
    // heatmap threshold cleanup no longer needed (managed by hook)
    window.removeEventListener('map-show-route', handleShowRouteEvent);
    window.removeEventListener('map-clear-route', handleClearRouteEvent);
    window.removeEventListener('map-show-advisor-preview', handleShowAdvisorPreviewEvent);
    window.removeEventListener('map-clear-advisor-preview', handleClearAdvisorPreviewEvent);
    window.removeEventListener('map-show-journey-preview', handleShowJourneyPreviewEvent);
    window.removeEventListener('map-clear-journey-preview', handleClearJourneyPreviewEvent);
    window.removeEventListener('map-reset-view', handleResetView);
    window.removeEventListener('route-alternative-hover', handleAlternativeHoverEvent);
    window.removeEventListener('map-show-insert-preview', handleShowInsertPreview);
    window.removeEventListener('map-hide-insert-preview', handleHideInsertPreview);

    mapRef.current?.off('click', handleMapRouteClickEvent);
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
  const [druidVisibilityZooms, setDruidVisibilityZooms] = useState<Map<string, number | null>>(new Map());

  // Merged entity visibility zooms (curators + druids)
  const entityVisibilityZooms = React.useMemo(() => {
    const merged = new Map<string, number | null>();
    curatorVisibilityZooms.forEach((v, k) => merged.set(k, v));
    druidVisibilityZooms.forEach((v, k) => merged.set(k, v));
    return merged;
  }, [curatorVisibilityZooms, druidVisibilityZooms]);
  
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

       // Load all druids' visibility zoom levels
  supabase
  .from('druids')
  .select('id, min_visibility_zoom')
  .eq('is_active', true)
  .then(({ data }) => {
  if (data) {
  const zoomMap = new Map<string, number | null>();
  data.forEach(d => zoomMap.set(d.id, d.min_visibility_zoom));
  setDruidVisibilityZooms(zoomMap);
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
    return setupFilterLinkHandler(setFilters, () => filters);
  }, [setFilters, filters]);

  // Handle popup action button clicks
  useEffect(() => setupActionClickHandler(), []);

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

  // Heatmap hook (layer creation, zoom toggle, view mode switching)
  const { heatLayersRef, markerOwnershipRef, heatVisibleRef } = useMapHeatmap({
    mapRef, markersRef, locations, viewMode, heatmapZoomThreshold,
    getLocationOwnership, currentUserId, userViewModeRef, entityVisibilityZooms,
  });

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
  if (!mapRef.current || entityVisibilityZooms.size === 0) return;
 
 const updateCuratorVisibility = () => {
 const map = mapRef.current;
 if (!map) return;

  // Don't override opacity when heatmap is visible — heatmap hook owns opacity then
  const userMode = userViewModeRef.current;
  if ((userMode === 'heatmap' || userMode === 'hybrid') && heatVisibleRef.current) return;
 
 try {
 const currentZoom = map.getZoom();
 
 markersRef.current.forEach((marker, locationId) => {
 const location = locationsRef.current.get(locationId);
 if (!location) return;
 
 const ownership = getLocationOwnership(locationId, currentUserId);
 
          // Only apply visibility zoom to curator points
  const entityId = ownership.curatorId || ownership.druidId;
  if (entityId) {
  const minZoom = entityVisibilityZooms.get(entityId);
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

  // Also listen for heatmap transition events
  const handleHeatTransition = () => updateCuratorVisibility();
  window.addEventListener('heatmap-transition-complete', handleHeatTransition);

  return () => {
    if (mapRef.current) {
      mapRef.current.off('zoomend', updateCuratorVisibility);
    }
    window.removeEventListener('heatmap-transition-complete', handleHeatTransition);
  };
  }, [entityVisibilityZooms, getLocationOwnership, currentUserId]);

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
