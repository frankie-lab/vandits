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
import { LocationPhotoUpload } from '@/components/LocationPhotoUpload';
import { IncompleteLocationsPanel } from '@/components/IncompleteLocationsPanel';
import { AdminPanel } from '@/components/AdminPanel';
import { UsersSidebar } from '@/components/UsersSidebar';
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
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showUsersSidebar, setShowUsersSidebar] = useState(false);
  const [photoUploadLocation, setPhotoUploadLocation] = useState<{ id: string; name: string; coordinates: { lat: number; lng: number } } | null>(null);
  const { selectedDocument, documents, updateLocation, filters } = useLocationsStore();

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

  // Helper function to toggle visited status
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
        toast.success(`✓ Visitado verificado${distance !== undefined ? ` (${Math.round(distance)}m)` : ''}`);
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
        
        toast.success('Ficha enriquecida', { id: toastId, icon: '✨' });
        
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
    } else if (action === 'add-notes') {
      // Open the notes editor
      setNotesLocation(location);
      setShowNotesEditor(true);
    } else if (action === 'toggle-visited') {
      // Toggle visited status - requires proximity validation (except for masters)
      const currentVisited = location.customData?.visited === 'true';
      
      // If already visited, allow unmarking without validation
      if (currentVisited) {
        await handleToggleVisited(location, false);
        return;
      }
      
      // Masters can mark any location as visited without validation
      if (isMaster()) {
        await handleToggleVisited(location, true);
        toast.success('Marcado como visitado (Master)', { icon: '👑' });
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
          toast.success(`Valoración: ${'★'.repeat(parseInt(rating))}${'☆'.repeat(5 - parseInt(rating))}`);
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

        // Get current user_image_url to extract file path
        const currentImageUrl = location.customData?.user_image_url;
        
        if (currentImageUrl) {
          // Extract file path from URL (format: .../location-photos/userId/locationId/timestamp.ext)
          const urlParts = currentImageUrl.split('/location-photos/');
          if (urlParts.length > 1) {
            const filePath = urlParts[1];
            // Delete from storage (ignore errors if file doesn't exist)
            await supabase.storage.from('location-photos').remove([filePath]);
          }
        }

        // Delete from location_photos table
        await supabase
          .from('location_photos')
          .delete()
          .eq('location_id', locationId)
          .eq('user_id', user.id);

        // Clear user_image_url from location
        const { error: updateError } = await supabase
          .from('locations')
          .update({
            user_image_url: null,
            user_image_visibility: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', locationId);

        if (updateError) throw updateError;

        // Update local state - remove user image fields
        const currentCustomData = { ...location.customData };
        delete currentCustomData.user_image_url;
        delete currentCustomData.user_image_visibility;
        
        updateLocation(locationId, {
          customData: Object.keys(currentCustomData).length ? currentCustomData : undefined,
          updatedAt: new Date(),
        });

        // Dispatch event to refresh popup with AI image
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
          .select('id, name')
          .eq('document_id', userDocId)
          .contains('custom_data', { adopted_from: locationId })
          .single();

        if (existingAdoption) {
          toast.info(`Ya tienes "${existingAdoption.name}" en tu colección`, { id: toastId, icon: '📍' });
          // Focus on the existing owned location
          useLocationsStore.getState().setFocusedLocation(existingAdoption.id);
          return;
        }

        // Clone the location with new ID and link to user's document
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

        toast.success(`"${location.name}" añadido a tu colección`, { id: toastId, icon: '✅' });
        
        // Reload full data from database to get the new owned location
        // This ensures the adopted point appears with the user's color (not followed color)
        await loadFromDatabase();
        
        // Small delay to let the store update, then focus on the new point
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

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
        onUploadClick={() => setShowUploadDialog(true)}
        onOpenProfile={() => setShowProfileEditor(true)}
        onOpenAdmin={() => setShowAdminPanel(true)}
        onOpenUsers={() => setShowUsersSidebar(true)}
        filtersOpen={showFiltersPanel}
        locationsOpen={showLocationsPanel}
        activeFilterCount={activeFilterCount}
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
            <DialogTitle className="font-display">Subir archivo KML</DialogTitle>
          </DialogHeader>
          <FileUploadZone onUploadComplete={() => setShowUploadDialog(false)} />
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

      {/* User Profile Editor */}
      <AnimatePresence>
        {showProfileEditor && (
          <UserProfileEditor onClose={() => setShowProfileEditor(false)} />
        )}
      </AnimatePresence>

      {/* Admin Panel */}
      <AnimatePresence>
        {showAdminPanel && (
          <AdminPanel onClose={() => setShowAdminPanel(false)} />
        )}
      </AnimatePresence>

      {/* Location Photo Upload */}
      {photoUploadLocation && (
        <LocationPhotoUpload
          locationId={photoUploadLocation.id}
          locationName={photoUploadLocation.name}
          locationCoordinates={photoUploadLocation.coordinates}
          isOpen={!!photoUploadLocation}
          onClose={() => setPhotoUploadLocation(null)}
          onPhotoUploaded={(imageUrl, visibility, exifData) => {
            // Update local store with new image and visit data
            const currentLocation = documents.find(d => d.locations.some(l => l.id === photoUploadLocation.id))
              ?.locations.find(l => l.id === photoUploadLocation.id);
            
            const updatedCustomData: Record<string, string> = {
              ...currentLocation?.customData,
              user_image_url: imageUrl,
              user_image_visibility: visibility,
            };
            
            // If photo had valid GPS, update visit status
            if (exifData?.latitude && exifData?.longitude) {
              updatedCustomData.visited = 'true';
              updatedCustomData.verified_visit_photo = 'true';
            }
            
            updateLocation(photoUploadLocation.id, {
              customData: updatedCustomData,
              updatedAt: new Date(),
            });
            // Dispatch event to refresh popup immediately
            window.dispatchEvent(new CustomEvent('photo-updated', {
              detail: { locationId: photoUploadLocation.id, imageUrl, visibility }
            }));
            window.dispatchEvent(new CustomEvent('store-updated'));
          }}
          defaultVisibility="private"
        />
      )}
    </div>
  );
};

export default Index;
