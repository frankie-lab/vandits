import React, { useState, useMemo, useEffect } from 'react';
import { Filter, List } from 'lucide-react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { LocationMap } from '@/components/LocationMap';
import { LocationList } from '@/components/LocationList';
import { FilterBar } from '@/components/FilterBar';
import { ExportPanel } from '@/components/ExportPanel';
import { GeocodeButton } from '@/components/GeocodeButton';
import { EnrichLocationPanel } from '@/components/EnrichLocationPanel';
import { BatchEnrichmentPanel } from '@/components/BatchEnrichmentPanel';
import { EnrichmentProgressIndicator } from '@/components/EnrichmentProgressIndicator';
import { EnrichmentCriteriaConfig } from '@/components/EnrichmentCriteriaConfig';
import { FloatingPanel } from '@/components/FloatingPanel';
import { FloatingToolbar } from '@/components/FloatingToolbar';
import { GalleryView } from '@/components/GalleryView';
import { useLocationsStore } from '@/store/locations-store';
import { useDatabaseSync } from '@/hooks/use-database-sync';
import { useRealtimeLocations } from '@/hooks/use-realtime-locations';
import { GeoLocation } from '@/types/location';
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
  const [criteriaVersion, setCriteriaVersion] = useState(0);

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
  
  const { selectedDocument, filters } = useLocationsStore();

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
        onUploadClick={() => setShowUploadDialog(true)}
        filtersOpen={showFiltersPanel}
        locationsOpen={showLocationsPanel}
        activeFilterCount={activeFilterCount}
        key={criteriaVersion}
      />

      {/* Geocode Button - floating bottom left */}
      <div className="fixed bottom-4 left-4 z-[1000]">
        <GeocodeButton />
      </div>

      {/* Enrichment Progress */}
      <EnrichmentProgressIndicator />

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
    </div>
  );
};

export default Index;
