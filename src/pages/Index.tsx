import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Filter, List } from 'lucide-react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { LocationMap } from '@/components/LocationMap';
import { LocationList } from '@/components/LocationList';
import { FilterBar } from '@/components/FilterBar';
import { ExportPanel } from '@/components/ExportPanel';
import { GeocodeButton } from '@/components/GeocodeButton';
import { EnrichLocationPanel } from '@/components/EnrichLocationPanel';
import { BatchEnrichmentPanel } from '@/components/BatchEnrichmentPanel';
import { BottomProgressBar } from '@/components/BottomProgressBar';
import { EnrichmentCriteriaConfig } from '@/components/EnrichmentCriteriaConfig';
import { FloatingPanel } from '@/components/FloatingPanel';
import { FloatingToolbar } from '@/components/FloatingToolbar';
import { GalleryView } from '@/components/GalleryView';
import { SemanticSearch } from '@/components/SemanticSearch';
import { DuplicatesList } from '@/components/DuplicatesList';
import { NotesEditor } from '@/components/NotesEditor';
import { useLocationsStore } from '@/store/locations-store';
import { useDatabaseSync } from '@/hooks/use-database-sync';
import { useRealtimeLocations } from '@/hooks/use-realtime-locations';
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
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [enrichLocation, setEnrichLocation] = useState<GeoLocation | null>(null);
  const [showEnrichPanel, setShowEnrichPanel] = useState(false);
  const [showBatchEnrichment, setShowBatchEnrichment] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showLocationsPanel, setShowLocationsPanel] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showCriteriaConfig, setShowCriteriaConfig] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showSemanticSearch, setShowSemanticSearch] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [criteriaVersion, setCriteriaVersion] = useState(0);
  const [notesLocation, setNotesLocation] = useState<GeoLocation | null>(null);
  const [showNotesEditor, setShowNotesEditor] = useState(false);

  const { selectedDocument, documents, updateLocation } = useLocationsStore();

  // Listen for criteria changes to trigger re-render
  useEffect(() => {
    const handleCriteriaChange = () => {
      setCriteriaVersion(v => v + 1);
    };
    window.addEventListener('enrichment-criteria-changed', handleCriteriaChange);
    return () => window.removeEventListener('enrichment-criteria-changed', handleCriteriaChange);
  }, []);
  
  // Load data from database on mount
  useDatabaseSync();
  
  // Listen for realtime updates to refresh map instantly
  useRealtimeLocations();
  
  const { filters } = useLocationsStore();

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

    if (action === 'quick-classify') {
      // Quick classify - only add classification
      const toastId = toast.loading(`Clasificando ${location.name}...`);
      
      try {
        const { data, error } = await supabase.functions.invoke('quick-classify', {
          body: {
            location: {
              id: location.id,
              name: location.name,
              description: location.description,
              coordinates: location.coordinates,
              country: location.country,
              region: location.region,
              enrichedData: location.enrichedData,
            }
          }
        });

        if (error) throw error;
        
        if (data?.clasificacion) {
          // Update local state
          updateLocation(location.id, {
            enrichedData: {
              ...location.enrichedData,
              clasificacion: data.clasificacion,
            } as any,
            updatedAt: new Date(),
          });
          // Notify map to update popups
          window.dispatchEvent(new CustomEvent('store-updated'));
          toast.success(data.message || 'Clasificación completada', { id: toastId });
        } else {
          throw new Error('No se recibió clasificación');
        }
      } catch (error) {
        console.error('Quick classify error:', error);
        toast.error('Error al clasificar', { id: toastId });
      }
    } else if (action === 'regenerate') {
      // Open the enrich panel
      setEnrichLocation(location);
      setShowEnrichPanel(true);
    } else if (action === 'add-notes') {
      // Open the notes editor
      setNotesLocation(location);
      setShowNotesEditor(true);
    } else if (action === 'toggle-visited') {
      // Toggle visited status
      const currentVisited = location.customData?.visited === 'true';
      const newVisited = !currentVisited;
      
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
          visited: newVisited ? 'true' : 'false',
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
        
        window.dispatchEvent(new CustomEvent('store-updated'));
        toast.success(newVisited ? 'Marcado como visitado' : 'Desmarcado como visitado');
      } catch (error) {
        console.error('Toggle visited error:', error);
        toast.error('Error al actualizar estado');
      }
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
        
        window.dispatchEvent(new CustomEvent('store-updated'));
        if (rating) {
          toast.success(`Valoración: ${'★'.repeat(parseInt(rating))}${'☆'.repeat(5 - parseInt(rating))}`);
        } else {
          toast.success('Valoración eliminada');
        }
      } catch (error) {
        console.error('Rating error:', error);
        toast.error('Error al guardar valoración');
      }
    }
  }, [documents, updateLocation]);

  useEffect(() => {
    const handler = (e: Event) => handlePopupAction(e as CustomEvent);
    window.addEventListener('popup-action', handler);
    return () => window.removeEventListener('popup-action', handler);
  }, [handlePopupAction]);

  const handleEnrichClick = (location: GeoLocation) => {
    setEnrichLocation(location);
    setShowEnrichPanel(true);
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

  return (
    <div className="h-screen w-screen overflow-hidden relative">
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
        onUploadClick={() => setShowUploadDialog(true)}
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

      {/* Floating Locations Panel */}
      <FloatingPanel
        title="Ubicaciones"
        icon={<List className="w-4 h-4 text-primary" />}
        isOpen={showLocationsPanel}
        onClose={() => setShowLocationsPanel(false)}
        position="right"
      >
        <LocationList onEnrichClick={handleEnrichClick} />
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

      {/* Enrich Location Panel */}
      <EnrichLocationPanel
        location={enrichLocation}
        open={showEnrichPanel}
        onOpenChange={setShowEnrichPanel}
      />

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
            onLocationClick={handleEnrichClick}
          />
        )}
      </AnimatePresence>

      {/* Semantic Search */}
      <AnimatePresence>
        {showSemanticSearch && (
          <SemanticSearch
            onClose={() => setShowSemanticSearch(false)}
            onLocationClick={handleEnrichClick}
          />
        )}
      </AnimatePresence>

      {/* Duplicates List */}
      <AnimatePresence>
        {showDuplicates && (
          <DuplicatesList
            onClose={() => setShowDuplicates(false)}
            onLocationClick={handleEnrichClick}
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
    </div>
  );
};

export default Index;
