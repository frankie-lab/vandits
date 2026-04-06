import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, List } from 'lucide-react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { LocationMap } from '@/components/LocationMap';
import { LocationList } from '@/components/LocationList';
import { FilterBar } from '@/components/FilterBar';
import { ExportPanel } from '@/components/ExportPanel';
import { GeocodeButton } from '@/components/GeocodeButton';
import { BatchEnrichmentPanel } from '@/components/BatchEnrichmentPanel';
import { BottomProgressBar } from '@/components/BottomProgressBar';
import { EnrichmentCriteriaConfig } from '@/components/EnrichmentCriteriaConfig';
import { FloatingPanel } from '@/components/FloatingPanel';
import { FloatingToolbar } from '@/components/FloatingToolbar';
import { GalleryView } from '@/components/GalleryView';
import { SemanticSearch } from '@/components/SemanticSearch';
import { DuplicatesList } from '@/components/DuplicatesList';
import { NotesEditor } from '@/components/NotesEditor';
import { UserProfileEditor } from '@/components/UserProfileEditor';
import { LocationPhotoMenu } from '@/components/LocationPhotoMenu';
import { IncompleteLocationsPanel } from '@/components/IncompleteLocationsPanel';
import { AdminPanel } from '@/components/AdminPanel';
import { UsersSidebar } from '@/components/UsersSidebar';
import { TrashPanel } from '@/components/TrashPanel';
import { CuratorEnrichmentSettings } from '@/components/CuratorEnrichmentSettings';
import { RouteBuilder } from '@/components/RouteBuilder';
import { RouteSettingsPanel } from '@/components/RouteSettingsPanel';
import { RoutesListPanel } from '@/components/RoutesListPanel';
import { Route as RouteType, useRoutes } from '@/hooks/use-routes';
import { useLocationsStore } from '@/store/locations-store';
import { useDatabaseSync } from '@/hooks/use-database-sync';
import { useRealtimeLocations } from '@/hooks/use-realtime-locations';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { GeoLocation } from '@/types/location';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import { AnimatePresence } from 'framer-motion';

const Index = () => {
 const navigate = useNavigate();
 const { user, loading: authLoading } = useAuth();
 const { isMaster } = usePermissions();
 
  // All hooks must be called before any conditional returns
 const [showUploadDialog, setShowUploadDialog] = useState(false);
 const [showBatchEnrichment, setShowBatchEnrichment] = useState(false);
 const [showFiltersPanel, setShowFiltersPanel] = useState(false);
 const [showLocationsPanel, setShowLocationsPanel] = useState(false);
 const [showExportPanel, setShowExportPanel] = useState(false);
 const [showCriteriaConfig, setShowCriteriaConfig] = useState(false);
 const [showGallery, setShowGallery] = useState(false);
 const [showSemanticSearch, setShowSemanticSearch] = useState(false);
 const [showDuplicates, setShowDuplicates] = useState(false);
 const [showIncomplete, setShowIncomplete] = useState(false);
 const [criteriaVersion, setCriteriaVersion] = useState(0);
 const [notesLocation, setNotesLocation] = useState<GeoLocation | null>(null);
 const [showNotesEditor, setShowNotesEditor] = useState(false);
 const [showProfileEditor, setShowProfileEditor] = useState(false);
 const [profileEditorTab, setProfileEditorTab] = useState<string | undefined>(undefined);
 const [showAdminPanel, setShowAdminPanel] = useState(false);
 const [showUsersSidebar, setShowUsersSidebar] = useState(false);
 const [showTrash, setShowTrash] = useState(false);
 const [showCuratorEnrichmentSettings, setShowCuratorEnrichmentSettings] = useState(false);
 const [showRoutesPanel, setShowRoutesPanel] = useState(false);
 const [showRouteSettings, setShowRouteSettings] = useState(false);
 const [showRouteBuilder, setShowRouteBuilder] = useState(false);
 const [editRouteId, setEditRouteId] = useState<string | undefined>(undefined);
 const [activeRouteSegments, setActiveRouteSegments] = useState<any[]>([]);
 const [visibleRouteIds, setVisibleRouteIds] = useState<Set<string>>(new Set());
 
 const [pendingValidationsCount, setPendingValidationsCount] = useState(0);
 const [pendingValidationNames, setPendingValidationNames] = useState<string[]>([]);
 const [photoUploadLocation, setPhotoUploadLocation] = useState<{ id: string; name: string; coordinates: { lat: number; lng: number } } | null>(null);
 const { selectedDocument, documents, updateLocation, filters } = useLocationsStore();
 const { routes: allRoutes } = useRoutes();

  // Load data from database on mount
 const { loadFromDatabase } = useDatabaseSync(user?.id);
 
  // Listen for realtime updates to refresh map instantly
 useRealtimeLocations();

  // Redirect to auth if not logged in
 useEffect(() => {
 if (!authLoading && !user) {
 navigate('/auth');
 }
 }, [user, authLoading, navigate]);

  // Listen for criteria changes to trigger re-render
 useEffect(() => {
 const handleCriteriaChange = () => {
 setCriteriaVersion(v => v + 1);
 };
 window.addEventListener('enrichment-criteria-changed', handleCriteriaChange);
 return () => window.removeEventListener('enrichment-criteria-changed', handleCriteriaChange);
 }, []);

  // Dispatch route segments to the map (visible saved routes + active builder route)
 useEffect(() => {
 const allSegments: any[] = [];

    // Add segments from persistently visible routes
  for (const routeId of visibleRouteIds) {
  const route = allRoutes.find(r => r.id === routeId);
  if (route && route.routeGeometry) {
     allSegments.push({
       geometry: route.routeGeometry,
       distance: route.totalDistance || 0,
       duration: route.totalDuration || 0,
       transportMode: route.transportMode || 'driving',
       routeId: route.id,
     });
   }
  }

    // Add segments from the active route builder, preserving metadata
  allSegments.push(...activeRouteSegments);
  // Forward stage metadata if present
  if ((activeRouteSegments as any)?._stageBreaks) {
    (allSegments as any)._stageBreaks = (activeRouteSegments as any)._stageBreaks;
  }
  if ((activeRouteSegments as any)?._stageStops) {
    (allSegments as any)._stageStops = (activeRouteSegments as any)._stageStops;
  }

    // Collect stops from all visible routes
    const allStops: any[] = [];
    for (const routeId of visibleRouteIds) {
      const route = allRoutes.find(r => r.id === routeId);
      if (route?.stops?.length) {
        allStops.push(...route.stops);
      }
    }

  if (allSegments.length > 0) {
 window.dispatchEvent(new CustomEvent('map-show-route', { detail: { segments: allSegments, stops: allStops } }));
 } else {
 window.dispatchEvent(new CustomEvent('map-clear-route'));
 }
 }, [activeRouteSegments, visibleRouteIds, allRoutes]);

  // Listen for route selection from map click
  useEffect(() => {
    const handleRouteSelected = (e: Event) => {
      const { routeId } = (e as CustomEvent).detail;
      if (routeId) {
        setEditRouteId(routeId);
        setShowRouteBuilder(true);
        setShowRoutesPanel(false);
        // Only show selected route
        setVisibleRouteIds(new Set([routeId]));
      }
    };
    window.addEventListener('map-route-selected', handleRouteSelected);
    return () => window.removeEventListener('map-route-selected', handleRouteSelected);
  }, []);


 useEffect(() => {
 const handleFollowChanged = async () => {
 console.log('[Index] Follow changed, refreshing map data...');
      // Small delay to ensure database has propagated the follow status
 await new Promise(resolve => setTimeout(resolve, 500));
 await loadFromDatabase();
 console.log('[Index] Map data refreshed after follow change');
 };
 window.addEventListener('lovable:follow-changed', handleFollowChanged);
 return () => window.removeEventListener('lovable:follow-changed', handleFollowChanged);
 }, [loadFromDatabase]);

  // Listen for curator mode activation
 useEffect(() => {
 const { setFilters, addDocument, clearAllDocuments } = useLocationsStore.getState();
 
 const handleCuratorFilter = async (e: CustomEvent) => {
 const { curatorId, curatorName } = e.detail;
 console.log('[Index] Curator mode activated:', curatorName);
 
 try {
        // Get documents linked to this curator
 const { data: curatorDocs, error: docsError } = await supabase
 .from('curator_documents')
 .select('document_id')
 .eq('curator_id', curatorId);
 
 if (docsError) throw docsError;
 
 if (!curatorDocs || curatorDocs.length === 0) {
 toast.info(`El curador "${curatorName}" no tiene documentos asignados`, {
 description: 'Puedes crear un nuevo documento para este curador',
 });
 return;
 }
 
        // Load the curator's documents and locations
 const docIds = curatorDocs.map(cd => cd.document_id);
 
 const { data: docs, error: fetchDocsError } = await supabase
 .from('documents')
 .select('*')
 .in('id', docIds);
 
 if (fetchDocsError) throw fetchDocsError;
 
 const { data: locations, error: locsError } = await supabase
 .from('locations')
 .select('*')
 .in('document_id', docIds)
 .is('deleted_at', null);
 
 if (locsError) throw locsError;
 
        // Clear current documents and load curator documents
 clearAllDocuments();
 
 docs?.forEach(doc => {
 const docLocations = (locations || [])
 .filter(l => l.document_id === doc.id)
 .map(l => ({
 id: l.id,
 name: l.name,
 description: l.description || '',
 coordinates: { lat: l.latitude, lng: l.longitude, altitude: l.altitude || undefined },
 continent: l.continent || undefined,
 country: l.country || undefined,
 region: l.region || undefined,
 zone: l.zone || undefined,
 placeType: l.place_type as any,
 visibility: l.visibility as any,
 customData: (l.custom_data as Record<string, string>) || {},
 enrichedData: l.enriched_data as any,
 createdAt: new Date(l.created_at),
 updatedAt: new Date(l.updated_at),
 _curatorId: curatorId, // Tag for filtering
 }));
 
 addDocument({
 id: doc.id,
 name: doc.name,
 fileName: doc.original_filename || doc.name,
 locations: docLocations,
 uploadedAt: new Date(doc.created_at),
 userId: doc.user_id || undefined,
 curatorId: curatorId, // Pass curator ID for filtering
 });
 });
 
        // Set the curator filter
 setFilters({
 filterByCuratorId: curatorId,
 filterByCuratorName: curatorName,
 });
 
 console.log('[Index] Curator documents loaded:', docs?.length, 'locations:', locations?.length);
 } catch (error) {
 console.error('[Index] Error loading curator data:', error);
 toast.error('Error al cargar datos del curador');
 }
 };
 
 const handleExitCuratorMode = () => {
 console.log('[Index] Exiting curator mode, reloading user data...');
 setFilters({});
 loadFromDatabase();
 };
 
 window.addEventListener('lovable:filter-by-curator', handleCuratorFilter as EventListener);
 window.addEventListener('lovable:exit-curator-mode', handleExitCuratorMode);
 
 return () => {
 window.removeEventListener('lovable:filter-by-curator', handleCuratorFilter as EventListener);
 window.removeEventListener('lovable:exit-curator-mode', handleExitCuratorMode);
 };
 }, [loadFromDatabase]);

  // Listen for druid mode activation
 useEffect(() => {
 const { setFilters, addDocument, clearAllDocuments } = useLocationsStore.getState();
 
 const handleDruidFilter = async (e: CustomEvent) => {
 const { druidId, druidName } = e.detail;
 console.log('[Index] Druid mode activated:', druidName);
 
 try {
        // Get druid data to retrieve icon and color
 const { data: druidData, error: druidError } = await supabase
 .from('druids')
 .select('icon, color, search_radius_km')
 .eq('id', druidId)
 .single();
 
 if (druidError) throw druidError;
 
        // Get locations from druid_locations table
 const { data: druidLocations, error: locsError } = await supabase
 .from('druid_locations')
 .select('*')
 .eq('druid_id', druidId);
 
 if (locsError) throw locsError;
 
 if (!druidLocations || druidLocations.length === 0) {
 toast.info(`El druida "${druidName}" no tiene puntos`, {
 description: 'Ejecuta una búsqueda para encontrar puntos',
 });
          // Still set the filter to show UI
 setFilters({
 filterByDruidId: druidId,
 filterByDruidName: druidName,
 });
 return;
 }
 
        // Clear current documents and create a virtual document for druid locations
 clearAllDocuments();
 
 const druidLocationsFormatted = druidLocations.map(l => ({
 id: l.id,
 name: l.name,
 description: (l.enriched_data as any)?.descripcion || '',
 coordinates: { lat: l.latitude, lng: l.longitude },
 placeType: l.place_type as any,
 customData: {},
 enrichedData: l.enriched_data as any,
 createdAt: new Date(l.created_at),
 updatedAt: new Date(l.updated_at),
 _druidId: druidId, // Tag for filtering
 }));
 
 addDocument({
 id: `druid-${druidId}`,
 name: `Druida: ${druidName}`,
 fileName: `druid-${druidId}.kml`,
 locations: druidLocationsFormatted,
 uploadedAt: new Date(),
 druidId: druidId,
 druidIcon: druidData?.icon || '',
 druidColor: druidData?.color || '#22c55e',
 });
 
        // Set the druid filter
 setFilters({
 filterByDruidId: druidId,
 filterByDruidName: druidName,
 });
 
 console.log('[Index] Druid locations loaded:', druidLocations.length);
 toast.success(`${druidLocations.length} puntos cargados`);
 } catch (error) {
 console.error('[Index] Error loading druid data:', error);
 toast.error('Error al cargar datos del druida');
 }
 };
 
 const handleExitDruidMode = () => {
 console.log('[Index] Exiting druid mode, reloading user data...');
 setFilters({});
 loadFromDatabase();
 };
 
 window.addEventListener('lovable:filter-by-druid', handleDruidFilter as EventListener);
 window.addEventListener('lovable:exit-druid-mode', handleExitDruidMode);
 
 return () => {
 window.removeEventListener('lovable:filter-by-druid', handleDruidFilter as EventListener);
 window.removeEventListener('lovable:exit-druid-mode', handleExitDruidMode);
 };
 }, [loadFromDatabase]);

  // Listen for pending validations count from CuratorEnrichmentSettings
 useEffect(() => {
 const handleValidationsUpdate = (e: CustomEvent<{ count: number; names: string[] }>) => {
 setPendingValidationsCount(e.detail.count);
 setPendingValidationNames(e.detail.names || []);
 };
 
 window.addEventListener('pending-validations-updated', handleValidationsUpdate as EventListener);
 return () => window.removeEventListener('pending-validations-updated', handleValidationsUpdate as EventListener);
 }, []);


 const handleToggleVisited = useCallback(async (location: GeoLocation, newVisited: boolean, distance?: number) => {
 try {
 const { data: dbLocation, error: fetchError } = await supabase
 .from('locations')
 .select('custom_data')
 .eq('id', location.id)
 .single();

 if (fetchError) throw fetchError;

 const currentCustomData = (dbLocation?.custom_data as Record<string, string>) || {};
 const updatedCustomData: Record<string, string> = {
 ...currentCustomData,
 visited: newVisited ? 'true' : 'false',
 };
 
      // Add verification data if marking as visited
 if (newVisited && distance !== undefined) {
 updatedCustomData.visited_verified_at = new Date().toISOString();
 updatedCustomData.visited_distance_m = Math.round(distance).toString();
 }

 const { error: updateError } = await supabase
 .from('locations')
 .update({ 
 custom_data: updatedCustomData,
 updated_at: new Date().toISOString(),
 })
 .eq('id', location.id);

 if (updateError) throw updateError;

      // Dispatch a specific event for visited update (to avoid full popup regeneration)
      // We intentionally do NOT call updateLocation here to prevent popup regeneration
 window.dispatchEvent(new CustomEvent('visited-updated', {
 detail: {
 locationId: location.id,
 visited: newVisited,
 distance,
 customData: updatedCustomData,
 }
 }));
 
 if (newVisited) {
 toast.success(` Visitado verificado${distance !== undefined ? ` (${Math.round(distance)}m)` : ''}`);
 } else {
 toast.success('Desmarcado como visitado');
 }
 } catch (error) {
 console.error('Toggle visited error:', error);
 toast.error('Error al actualizar estado');
 }
 }, [updateLocation]);

  // Handle popup action events (quick-classify, regenerate, rating, etc.)
 const handlePopupAction = useCallback(async (event: CustomEvent<{ action: string; locationId: string; rating?: string }>) => {
 const { action, locationId } = event.detail;
 
    // Find the location across ALL documents
 let location: GeoLocation | undefined;
 for (const doc of documents) {
 location = doc.locations.find(l => l.id === locationId);
 if (location) break;
 }
 
 if (!location) {
 toast.error('Ubicación no encontrada');
 return;
 }

 if (action === 'enrich' || action === 'quick-classify' || action === 'regenerate') {
      // Unified enrichment - generates full AI card including classification
 const toastId = toast.loading(`Enriqueciendo ${location.name}...`);
 
 try {
 const { data, error } = await supabase.functions.invoke('enrich-location', {
 body: { location }
 });
 
 if (error) throw error;
 if (!data?.success || !data?.data) {
 throw new Error(data?.error || 'Sin datos de enriquecimiento');
 }
 
 const enrichedData = data.data;
 
        // Save enriched data to database
 const geoData = enrichedData._geocoded || {};
 const { error: updateError } = await supabase
 .from('locations')
 .update({
 enriched_data: enrichedData,
 place_type: enrichedData.clasificacion?.codigo || location.placeType || null,
 continent: geoData.continent || location.continent || null,
 country: geoData.country || location.country || null,
 region: geoData.region || location.region || null,
 zone: geoData.zone || location.zone || null,
 updated_at: new Date().toISOString(),
 })
 .eq('id', locationId);
 
 if (updateError) {
 console.error('Error saving enriched data:', updateError);
 throw updateError;
 }
 
 toast.success('Ficha enriquecida', { id: toastId, icon: '' });
 
        // Reload data from database to ensure enriched status and ownership are correct
        // This is critical for adopted points which need to show the user's color + green status
 await loadFromDatabase();
 
        // Focus back on the enriched location after reload
 setTimeout(() => {
 useLocationsStore.getState().setFocusedLocation(locationId);
 }, 300);
 } catch (error) {
 console.error('Enrich error:', error);
 toast.error('Error al enriquecer', { id: toastId });
 }
 } else if (action === 'delete-location') {
      // Soft-delete: move to trash (set deleted_at)
 const locationName = (event.detail as any).locationName || location.name;
 const toastId = toast.loading(`Moviendo "${locationName}" a la papelera...`);
 
 try {
 const { error } = await supabase
 .from('locations')
 .update({ deleted_at: new Date().toISOString() })
 .eq('id', locationId);
 
 if (error) throw error;
 
 toast.success(`"${locationName}" movido a la papelera`, { id: toastId, icon: '' });
 
        // Close popup and reload data
 await loadFromDatabase();
 
        // Dispatch event to update trash count in UserMenu
 window.dispatchEvent(new CustomEvent('trash-updated'));
 } catch (error) {
 console.error('Delete location error:', error);
 toast.error('Error al eliminar', { id: toastId });
 }
 } else if (action === 'add-notes') {
      // Open the notes editor
 setNotesLocation(location);
 setShowNotesEditor(true);
 } else if (action === 'toggle-visited') {
      // Toggle visited status - requires proximity validation (except for masters)
      // If the point belongs to a followed user, adopt it first then mark as visited
 const currentVisited = location.customData?.visited === 'true';
 
      // If already visited, allow unmarking without validation
 if (currentVisited) {
 await handleToggleVisited(location, false);
 return;
 }
 
      // Check if this is someone else's location - if so, adopt first then mark as visited
 const { data: { user: currentUser } } = await supabase.auth.getUser();
 if (!currentUser) {
 toast.error('Debes iniciar sesión');
 return;
 }
 
 const ownership = useLocationsStore.getState().getLocationOwnership(locationId, currentUser.id);
 
 if (!ownership.isOwn) {
        // This is a followed user's point - adopt it first, then mark as visited
 const adoptToastId = toast.loading(`Añadiendo "${location.name}" a tu colección...`);
 
 try {
          // Get user's "Mi Colección" document or create it
 let userDocId: string;
 const { data: existingDoc } = await supabase
 .from('documents')
 .select('id')
 .eq('user_id', currentUser.id)
 .eq('name', 'Mi Colección')
 .single();

 if (existingDoc) {
 userDocId = existingDoc.id;
 } else {
            // Create the collection document
 const { data: newDoc, error: docError } = await supabase
 .from('documents')
 .insert({
 name: 'Mi Colección',
 original_filename: 'mi-coleccion.kml',
 user_id: currentUser.id,
 })
 .select('id')
 .single();

 if (docError) throw docError;
 userDocId = newDoc.id;
 }

          // Check if already adopted (by original location ID in custom_data)
 const { data: existingAdoption } = await supabase
 .from('locations')
 .select('id, name, custom_data')
 .eq('document_id', userDocId)
 .contains('custom_data', { adopted_from: locationId })
 .single();

 let targetLocationId: string;
 let targetLocation: GeoLocation;

 if (existingAdoption) {
            // Already adopted - use the existing adopted location
 toast.info(`Ya tienes "${existingAdoption.name}" en tu colección, marcando como visitado...`, { id: adoptToastId, icon: '' });
 targetLocationId = existingAdoption.id;
 
            // Create a minimal location object for the toggle function
 targetLocation = {
 ...location,
 id: existingAdoption.id,
 customData: existingAdoption.custom_data as Record<string, string> | undefined,
 };
 } else {
            // Clone the location with new ID and link to user's document
 targetLocationId = crypto.randomUUID();
 const { error: insertError } = await supabase
 .from('locations')
 .insert({
 id: targetLocationId,
 document_id: userDocId,
 name: location.name,
 description: location.description,
 latitude: location.coordinates.lat,
 longitude: location.coordinates.lng,
 altitude: location.coordinates.altitude,
 continent: location.continent,
 country: location.country,
 region: location.region,
 zone: location.zone,
 place_type: location.placeType,
 enriched_data: location.enrichedData as any,
 custom_data: {
 ...(location.customData || {}),
 adopted_from: locationId,
 adopted_at: new Date().toISOString(),
 },
 visibility: 'private',
 pioneer_user_id: currentUser.id,
 });

 if (insertError) throw insertError;
 
 toast.success(`"${location.name}" añadido a tu colección`, { id: adoptToastId, icon: '' });
 
            // Create a location object for the newly adopted point
 targetLocation = {
 ...location,
 id: targetLocationId,
 customData: {
 ...(location.customData || {}),
 adopted_from: locationId,
 adopted_at: new Date().toISOString(),
 },
 };
 }

          // Now proceed to mark the adopted location as visited
          // Masters can skip validation
 if (isMaster()) {
 await handleToggleVisited(targetLocation, true);
 toast.success('Marcado como visitado (Master)', { icon: '' });
 await loadFromDatabase();
 setTimeout(() => {
 useLocationsStore.getState().setFocusedLocation(targetLocationId);
 }, 300);
 return;
 }
 
          // Check if user has uploaded a geotagged photo for this location
 const hasGeotaggedPhoto = location.customData?.verified_visit_photo === 'true';
 
 if (hasGeotaggedPhoto) {
 await handleToggleVisited(targetLocation, true);
 await loadFromDatabase();
 setTimeout(() => {
 useLocationsStore.getState().setFocusedLocation(targetLocationId);
 }, 300);
 return;
 }
 
          // Check proximity via geolocation
 if (!navigator.geolocation) {
 toast.error('Tu navegador no soporta geolocalización. Sube una foto con datos GPS del lugar.');
 await loadFromDatabase();
 setTimeout(() => {
 useLocationsStore.getState().setFocusedLocation(targetLocationId);
 }, 300);
 return;
 }
 
 toast.loading('Verificando tu ubicación...', { id: 'verifying-location' });
 
 navigator.geolocation.getCurrentPosition(
 async (position) => {
 const userLat = position.coords.latitude;
 const userLng = position.coords.longitude;
 const locationLat = location.coordinates.lat;
 const locationLng = location.coordinates.lng;
 
              // Calculate distance using Haversine formula
 const R = 6371000; // Earth radius in meters
 const dLat = (locationLat - userLat) * Math.PI / 180;
 const dLng = (locationLng - userLng) * Math.PI / 180;
 const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
 Math.cos(userLat * Math.PI / 180) * Math.cos(locationLat * Math.PI / 180) *
 Math.sin(dLng / 2) * Math.sin(dLng / 2);
 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
 const distance = R * c;
 
 toast.dismiss('verifying-location');
 
 const MAX_DISTANCE = 500; // 500 meters
 
 if (distance <= MAX_DISTANCE) {
 await handleToggleVisited(targetLocation, true, distance);
 } else {
 const distanceText = distance < 1000 
 ? Math.round(distance) + ' metros' 
 : (distance / 1000).toFixed(1) + ' km';
 toast.error(`Estás a ${distanceText} del punto. Acércate o sube una foto con GPS.`);
 }
 
              // Reload and focus on the new location
 await loadFromDatabase();
 setTimeout(() => {
 useLocationsStore.getState().setFocusedLocation(targetLocationId);
 }, 300);
 },
 async (error) => {
 toast.dismiss('verifying-location');
 console.error('Geolocation error:', error);
 toast.error('No se pudo obtener tu ubicación. Sube una foto con datos GPS del lugar.');
              // Still reload and focus on the adopted point
 await loadFromDatabase();
 setTimeout(() => {
 useLocationsStore.getState().setFocusedLocation(targetLocationId);
 }, 300);
 },
 { enableHighAccuracy: true, timeout: 10000 }
 );
 } catch (error) {
 console.error('Adopt and visit error:', error);
 toast.error('Error al añadir a tu colección', { id: adoptToastId });
 }
 return;
 }
 
      // This is the user's own point - normal visited logic
      // Masters can mark any location as visited without validation
 if (isMaster()) {
 await handleToggleVisited(location, true);
 toast.success('Marcado como visitado (Master)', { icon: '' });
 return;
 }
 
      // Check if user has uploaded a geotagged photo for this location
 const hasGeotaggedPhoto = location.customData?.verified_visit_photo === 'true';
 
 if (hasGeotaggedPhoto) {
        // Already validated via photo upload
 await handleToggleVisited(location, true);
 return;
 }
 
      // Check proximity via geolocation
 if (!navigator.geolocation) {
 toast.error('Tu navegador no soporta geolocalización. Sube una foto con datos GPS del lugar.');
 return;
 }
 
 toast.loading('Verificando tu ubicación...', { id: 'verifying-location' });
 
 navigator.geolocation.getCurrentPosition(
 async (position) => {
 const userLat = position.coords.latitude;
 const userLng = position.coords.longitude;
 const locationLat = location.coordinates.lat;
 const locationLng = location.coordinates.lng;
 
          // Calculate distance using Haversine formula
 const R = 6371000; // Earth radius in meters
 const dLat = (locationLat - userLat) * Math.PI / 180;
 const dLng = (locationLng - userLng) * Math.PI / 180;
 const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
 Math.cos(userLat * Math.PI / 180) * Math.cos(locationLat * Math.PI / 180) *
 Math.sin(dLng / 2) * Math.sin(dLng / 2);
 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
 const distance = R * c;
 
 toast.dismiss('verifying-location');
 
 const MAX_DISTANCE = 500; // 500 meters
 
 if (distance <= MAX_DISTANCE) {
 await handleToggleVisited(location, true, distance);
 } else {
 const distanceText = distance < 1000 
 ? Math.round(distance) + ' metros' 
 : (distance / 1000).toFixed(1) + ' km';
 
            // Show warning in the popup
 const warningEl = document.getElementById(`visit-validation-warning-${location.id}`);
 const distanceEl = document.getElementById(`visit-distance-text-${location.id}`);
 if (warningEl && distanceEl) {
 distanceEl.textContent = `Estás a ${distanceText} del punto.`;
 warningEl.style.display = 'block';
              // Auto-hide after 8 seconds
 setTimeout(() => {
 warningEl.style.display = 'none';
 }, 8000);
 }
 }
 },
 (error) => {
 toast.dismiss('verifying-location');
 console.error('Geolocation error:', error);
 toast.error('No se pudo obtener tu ubicación. Sube una foto con datos GPS del lugar.');
 },
 { enableHighAccuracy: true, timeout: 10000 }
 );
 } else if (action === 'set-rating' || action === 'clear-rating') {
      // Set or clear user rating
 const rating = action === 'clear-rating' ? '' : (event.detail as any).rating || '';
 
 try {
 const { data: dbLocation, error: fetchError } = await supabase
 .from('locations')
 .select('custom_data')
 .eq('id', location.id)
 .single();

 if (fetchError) throw fetchError;

 const currentCustomData = (dbLocation?.custom_data as Record<string, string>) || {};
 const updatedCustomData = {
 ...currentCustomData,
 user_rating: rating,
 };

 const { error: updateError } = await supabase
 .from('locations')
 .update({ 
 custom_data: updatedCustomData,
 updated_at: new Date().toISOString(),
 })
 .eq('id', location.id);

 if (updateError) throw updateError;

        // Update local state
 updateLocation(location.id, {
 customData: updatedCustomData,
 updatedAt: new Date(),
 });

        // Dispatch a specific event for rating update (to avoid full popup regeneration)
 window.dispatchEvent(
 new CustomEvent('rating-updated', {
 detail: {
 locationId: location.id,
 rating,
 customData: updatedCustomData,
 },
 })
 );

 if (rating) {
 toast.success(`Valoración: ${''.repeat(parseInt(rating))}${''.repeat(5 - parseInt(rating))}`);
 } else {
 toast.success('Valoración eliminada');
 }
 } catch (error) {
 console.error('Rating error:', error);
 toast.error('Error al guardar valoración');
 }
 } else if (action === 'upload-photo') {
      // Open photo upload dialog
 const locationName = (event.detail as any).locationName || location.name;
 setPhotoUploadLocation({ 
 id: locationId, 
 name: locationName,
 coordinates: location.coordinates
 });
 } else if (action === 'delete-photo') {
      // Delete user photo and revert to AI image
 const toastId = toast.loading('Eliminando foto...');
 
 try {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 toast.error('Debes iniciar sesión', { id: toastId });
 return;
 }

 const currentImageUrl = location.customData?.user_image_url;
 
 if (currentImageUrl) {
 const urlParts = currentImageUrl.split('/location-photos/');
 if (urlParts.length > 1) {
 const filePath = urlParts[1];
 await supabase.storage.from('location-photos').remove([filePath]);
 }
 }

 await supabase
 .from('location_photos')
 .delete()
 .eq('location_id', locationId)
 .eq('user_id', user.id);

 const { error: updateError } = await supabase
 .from('locations')
 .update({
 user_image_url: null,
 user_image_visibility: null,
 updated_at: new Date().toISOString(),
 })
 .eq('id', locationId);

 if (updateError) throw updateError;

 const currentCustomData = { ...location.customData };
 delete currentCustomData.user_image_url;
 delete currentCustomData.user_image_visibility;
 
 updateLocation(locationId, {
 customData: Object.keys(currentCustomData).length ? currentCustomData : undefined,
 updatedAt: new Date(),
 });

 window.dispatchEvent(new CustomEvent('photo-updated', {
 detail: { locationId, imageUrl: null, visibility: null }
 }));
 window.dispatchEvent(new CustomEvent('store-updated'));
 toast.success('Foto eliminada, mostrando imagen IA', { id: toastId });
 } catch (error) {
 console.error('Delete photo error:', error);
 toast.error('Error al eliminar foto', { id: toastId });
 }
 } else if (action === 'add-to-collection') {
      // Clone a followed user's location to current user's collection
 const toastId = toast.loading(`Añadiendo "${location.name}" a tu colección...`);
 
 try {
 const { data: { user: currentUser } } = await supabase.auth.getUser();
 if (!currentUser) {
 toast.error('Debes iniciar sesión', { id: toastId });
 return;
 }

 let userDocId: string;
 const { data: existingDoc } = await supabase
 .from('documents')
 .select('id')
 .eq('user_id', currentUser.id)
 .eq('name', 'Mi Colección')
 .single();

 if (existingDoc) {
 userDocId = existingDoc.id;
 } else {
 const { data: newDoc, error: docError } = await supabase
 .from('documents')
 .insert({
 name: 'Mi Colección',
 original_filename: 'mi-coleccion.kml',
 user_id: currentUser.id,
 })
 .select('id')
 .single();

 if (docError) throw docError;
 userDocId = newDoc.id;
 }

 const { data: existingAdoption } = await supabase
 .from('locations')
 .select('id, name')
 .eq('document_id', userDocId)
 .contains('custom_data', { adopted_from: locationId })
 .single();

 if (existingAdoption) {
 toast.info(`Ya tienes "${existingAdoption.name}" en tu colección`, { id: toastId, icon: '' });
 useLocationsStore.getState().setFocusedLocation(existingAdoption.id);
 return;
 }

 const newLocationId = crypto.randomUUID();
 const { error: insertError } = await supabase
 .from('locations')
 .insert({
 id: newLocationId,
 document_id: userDocId,
 name: location.name,
 description: location.description,
 latitude: location.coordinates.lat,
 longitude: location.coordinates.lng,
 altitude: location.coordinates.altitude,
 continent: location.continent,
 country: location.country,
 region: location.region,
 zone: location.zone,
 place_type: location.placeType,
 enriched_data: location.enrichedData as any,
 custom_data: {
 ...(location.customData || {}),
 adopted_from: locationId,
 adopted_at: new Date().toISOString(),
 },
 visibility: 'private',
 pioneer_user_id: currentUser.id,
 });

 if (insertError) throw insertError;

 toast.success(`"${location.name}" añadido a tu colección`, { id: toastId, icon: '' });
 
 await loadFromDatabase();
 
 setTimeout(() => {
 useLocationsStore.getState().setFocusedLocation(newLocationId);
 }, 300);
 } catch (error) {
 console.error('Add to collection error:', error);
 toast.error('Error al añadir a tu colección', { id: toastId });
 }
 }
 }, [documents, updateLocation, isMaster, handleToggleVisited, loadFromDatabase]);

 useEffect(() => {
 const handler = (e: Event) => handlePopupAction(e as CustomEvent);
 window.addEventListener('popup-action', handler);
 return () => window.removeEventListener('popup-action', handler);
 }, [handlePopupAction]);

  // Focus on map when clicking a location from any list
 const handleLocationFocus = (location: GeoLocation) => {
 useLocationsStore.getState().setFocusedLocation(location.id);
 };

  // Count active filters
 const activeFilterCount = useMemo(() => {
 let count = 0;
 if (filters.continent) count++;
 if (filters.country) count++;
 if (filters.region) count++;
 if (filters.zone) count++;
 if (filters.tag) count++;
 if (filters.placeType) count++;
 if (filters.onlyEnriched) count++;
 if (filters.verified) count++;
 if (filters.searchTerm) count++;
 return count;
 }, [filters]);

  // Show loading skeleton while checking auth
 if (authLoading) {
 return (
 <div className="h-screen w-screen bg-background flex flex-col">
  {/* Header skeleton */}
  <div className="h-14 border-b border-border flex items-center px-4 gap-3">
   <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
   <div className="w-24 h-5 rounded bg-muted animate-pulse" />
   <div className="flex-1" />
   <div className="flex gap-2">
    <div className="w-16 h-5 rounded bg-muted animate-pulse" />
    <div className="w-16 h-5 rounded bg-muted animate-pulse" />
    <div className="w-16 h-5 rounded bg-muted animate-pulse" />
   </div>
   <div className="flex-1" />
   <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
   <div className="w-40 h-8 rounded-lg bg-muted animate-pulse" />
  </div>
  {/* Map skeleton */}
  <div className="flex-1 relative overflow-hidden bg-muted/30">
   <div className="absolute inset-0 flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
     <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
     <p className="text-sm text-muted-foreground animate-pulse">Cargando mapa...</p>
    </div>
   </div>
   {/* Fake map grid dots */}
   <div className="absolute inset-0 opacity-10">
    {Array.from({ length: 20 }).map((_, i) => (
     <div key={i} className="absolute w-2 h-2 rounded-full bg-muted-foreground animate-pulse"
      style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }} />
    ))}
   </div>
  </div>
  {/* Bottom bar skeleton */}
  <div className="h-8 border-t border-border flex items-center px-4 gap-4">
   <div className="w-12 h-3 rounded bg-muted animate-pulse" />
   <div className="w-12 h-3 rounded bg-muted animate-pulse" />
   <div className="w-12 h-3 rounded bg-muted animate-pulse" />
  </div>
 </div>
 );
 }
 
  // Don't render if not authenticated
 if (!user) {
 return null;
 }

 return (
 <div className="h-screen w-screen overflow-hidden relative">
 {/* Users Sidebar */}
 <UsersSidebar
 isOpen={showUsersSidebar}
 onClose={() => setShowUsersSidebar(false)}
 onOpen={() => setShowUsersSidebar(true)}
 />

 {/* Fullscreen Map */}
 <div className="absolute inset-0">
 <LocationMap />
 </div>

 {/* Floating Toolbar */}
 <FloatingToolbar
 onToggleFilters={() => setShowFiltersPanel(!showFiltersPanel)}
 onToggleLocations={() => setShowLocationsPanel(!showLocationsPanel)}
 onToggleExport={() => setShowExportPanel(true)}
 onToggleBatchEnrich={() => setShowBatchEnrichment(true)}
 onToggleCriteriaConfig={() => setShowCriteriaConfig(true)}
 onToggleGallery={() => setShowGallery(true)}
 onToggleSemanticSearch={() => setShowSemanticSearch(prev => !prev)}
 onToggleDuplicates={() => setShowDuplicates(true)}
 onToggleIncomplete={() => setShowIncomplete(prev => !prev)}
 onToggleValidations={() => setShowCuratorEnrichmentSettings(true)}
 onUploadClick={() => setShowUploadDialog(true)}
 onOpenProfile={() => { setProfileEditorTab(undefined); setShowProfileEditor(true); }}
 onOpenRouteSettings={() => setShowRouteSettings(true)}
 onOpenAdmin={() => setShowAdminPanel(true)}
 onOpenUsers={() => setShowUsersSidebar(true)}
 onOpenTrash={() => setShowTrash(true)}
 onToggleRoutes={() => setShowRoutesPanel(prev => !prev)}
 
 filtersOpen={showFiltersPanel}
 locationsOpen={showLocationsPanel}
 activeFilterCount={activeFilterCount}
 pendingValidationsCount={pendingValidationsCount}
 pendingValidationNames={pendingValidationNames}
 key={criteriaVersion}
 />

 {/* Geocode Button - floating bottom left */}
 <div className="fixed bottom-16 left-4 z-[999]">
 <GeocodeButton />
 </div>

 {/* Bottom Progress Bar for batch processes */}
 <BottomProgressBar />

 {/* Floating Filters Panel */}
 <FloatingPanel
 title="Filtros"
 icon={<Filter className="w-4 h-4 text-primary" />}
 isOpen={showFiltersPanel}
 onClose={() => setShowFiltersPanel(false)}
 position="left"
 >
 <div className="p-3">
 <FilterBar />
 </div>
 </FloatingPanel>

 {/* Floating Locations Panel - positions below search panel when both open */}
 <FloatingPanel
 title="Ubicaciones"
 icon={<List className="w-4 h-4 text-primary" />}
 isOpen={showLocationsPanel}
 onClose={() => setShowLocationsPanel(false)}
 position="right"
 topOffset={showSemanticSearch ? 'top-[calc(50vh+0.5rem)]' : undefined}
 >
 <LocationList />
 </FloatingPanel>

 {/* Upload Dialog */}
 <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
 <DialogContent className="sm:max-w-xl">
 <DialogHeader>
 <DialogTitle className="font-display">
 {filters.filterByCuratorId 
 ? `Subir archivo para curador: ${filters.filterByCuratorName}`
 : 'Subir archivo KML'
 }
 </DialogTitle>
 </DialogHeader>
 <FileUploadZone 
 curatorId={filters.filterByCuratorId}
 curatorName={filters.filterByCuratorName}
 onUploadComplete={() => {
 setShowUploadDialog(false);
              // If in curator mode, refresh curator data
 if (filters.filterByCuratorId) {
 window.dispatchEvent(new CustomEvent('lovable:filter-by-curator', {
 detail: { curatorId: filters.filterByCuratorId, curatorName: filters.filterByCuratorName }
 }));
 }
 }} 
 />
 </DialogContent>
 </Dialog>

 {/* Export Dialog */}
 <Dialog open={showExportPanel} onOpenChange={setShowExportPanel}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="font-display">Exportar datos</DialogTitle>
 </DialogHeader>
 <ExportPanel />
 </DialogContent>
 </Dialog>


 {/* Batch Enrichment Panel */}
 <BatchEnrichmentPanel
 open={showBatchEnrichment}
 onOpenChange={setShowBatchEnrichment}
 curatorId={filters.filterByCuratorId}
 />

 {/* Enrichment Criteria Config Panel */}
 <EnrichmentCriteriaConfig
 open={showCriteriaConfig}
 onOpenChange={setShowCriteriaConfig}
 />

 {/* Gallery View */}
 <AnimatePresence>
 {showGallery && (
 <GalleryView
 onClose={() => setShowGallery(false)}
 onLocationClick={handleLocationFocus}
 />
 )}
 </AnimatePresence>

 {/* Semantic Search */}
 <AnimatePresence>
 {showSemanticSearch && (
 <SemanticSearch
 onClose={() => setShowSemanticSearch(false)}
 onLocationClick={handleLocationFocus}
 splitWithLocations={showLocationsPanel}
 />
 )}
 </AnimatePresence>

 {/* Duplicates List */}
 <AnimatePresence>
 {showDuplicates && (
 <DuplicatesList
 onClose={() => setShowDuplicates(false)}
 onLocationClick={handleLocationFocus}
 />
 )}
 </AnimatePresence>

 {/* Notes Editor */}
 <NotesEditor
 locationId={notesLocation?.id || null}
 locationName={notesLocation?.name || ''}
 initialNotes={notesLocation?.customData?.notes || ''}
 open={showNotesEditor}
 onOpenChange={setShowNotesEditor}
 onSaved={() => {
 window.dispatchEvent(new CustomEvent('store-updated'));
 }}
 />

 {/* Incomplete Locations Panel */}
 <IncompleteLocationsPanel
 isOpen={showIncomplete}
 onClose={() => setShowIncomplete(false)}
 onLocationClick={(locationId) => {
          // Could trigger map focus
 }}
 />

 {/* Route Settings Panel */}
 <AnimatePresence>
 {showRouteSettings && (
 <RouteSettingsPanel onClose={() => setShowRouteSettings(false)} />
 )}
 </AnimatePresence>

 {/* User Profile Editor */}
 <AnimatePresence>
 {showProfileEditor && (
 <UserProfileEditor onClose={() => { setShowProfileEditor(false); setProfileEditorTab(undefined); }} defaultTab={profileEditorTab} />
 )}
 </AnimatePresence>

 {/* Admin Panel */}
 <AnimatePresence>
 {showAdminPanel && (
 <AdminPanel onClose={() => setShowAdminPanel(false)} />
 )}
 </AnimatePresence>

 {/* Trash Panel */}
 <AnimatePresence>
 {showTrash && (
 <TrashPanel
 isOpen={showTrash}
 onClose={() => setShowTrash(false)}
 />
 )}
 </AnimatePresence>

 {/* Curator Enrichment Settings - for validations from toolbar */}
 {filters.filterByCuratorId && (
 <CuratorEnrichmentSettings
 curatorId={filters.filterByCuratorId}
 curatorName={filters.filterByCuratorName || 'Curador'}
 open={showCuratorEnrichmentSettings}
 onOpenChange={setShowCuratorEnrichmentSettings}
 />
 )}


 {photoUploadLocation && (
 <LocationPhotoMenu
 locationId={photoUploadLocation.id}
 locationName={photoUploadLocation.name}
 locationCoordinates={photoUploadLocation.coordinates}
 hasUserImage={false}
 isAdminOrMaster={isMaster()}
 onPhotoUpdated={() => {
 setPhotoUploadLocation(null);
 }}
 defaultVisibility="private"
 />
 )}

 {/* Routes Panel */}
 <FloatingPanel
 title="Itinerarios"
 icon={<List className="w-4 h-4 text-primary" />}
 isOpen={showRoutesPanel && !showRouteBuilder}
 onClose={() => setShowRoutesPanel(false)}
 position="right"
 >
 <RoutesListPanel
 onCreateNew={() => {
 setEditRouteId(undefined);
 setShowRouteBuilder(true);
 setShowRoutesPanel(false);
 }}
  onEditRoute={(route: RouteType) => {
  setEditRouteId(route.id);
  setShowRouteBuilder(true);
  setShowRoutesPanel(false);
  // Only show selected route
  setVisibleRouteIds(new Set([route.id]));
  }}
  visibleRouteIds={visibleRouteIds}
  onToggleVisibility={(route: RouteType) => {
  setVisibleRouteIds(prev => {
  if (prev.has(route.id)) {
  // Deselect: hide it
  const next = new Set(prev);
  next.delete(route.id);
  return next;
  } else {
  // Select exclusively: only show this route
  return new Set([route.id]);
  }
  });
  }}
 />
 </FloatingPanel>

 {/* Route Builder Panel */}
 <FloatingPanel
 title={editRouteId ? "Editar Itinerario" : "Crear Itinerario"}
 icon={<List className="w-4 h-4 text-primary" />}
 isOpen={showRouteBuilder}
 onClose={() => {
 setShowRouteBuilder(false);
 setEditRouteId(undefined);
 setActiveRouteSegments([]);
 }}
 position="right"
 >
 <RouteBuilder
 editRouteId={editRouteId}
 onClose={() => {
 setShowRouteBuilder(false);
 setEditRouteId(undefined);
 setActiveRouteSegments([]);
 }}
 onRouteCalculated={(segments) => setActiveRouteSegments(segments)}
 />
 </FloatingPanel>
 </div>
 );
};

export default Index;
