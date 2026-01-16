import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe2, MapPin, Sparkles, Filter, List } from 'lucide-react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { LocationMap } from '@/components/LocationMap';
import { LocationList } from '@/components/LocationList';
import { FilterBar } from '@/components/FilterBar';
import { ExportPanel } from '@/components/ExportPanel';
import { GeocodeButton } from '@/components/GeocodeButton';
import { EnrichLocationPanel } from '@/components/EnrichLocationPanel';
import { BatchEnrichmentPanel } from '@/components/BatchEnrichmentPanel';
import { EnrichmentProgressIndicator } from '@/components/EnrichmentProgressIndicator';
import { FloatingPanel } from '@/components/FloatingPanel';
import { FloatingToolbar } from '@/components/FloatingToolbar';
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

const Index = () => {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [enrichLocation, setEnrichLocation] = useState<GeoLocation | null>(null);
  const [showEnrichPanel, setShowEnrichPanel] = useState(false);
  const [showBatchEnrichment, setShowBatchEnrichment] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showLocationsPanel, setShowLocationsPanel] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  
  // Load data from database on mount
  useDatabaseSync();
  
  // Listen for realtime updates to refresh map instantly
  useRealtimeLocations();
  
  const { selectedDocument, filters } = useLocationsStore();

  const hasDocument = !!selectedDocument;

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
      <AnimatePresence mode="wait">
        {!hasDocument ? (
          // Welcome screen
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen surface-gradient flex flex-col items-center justify-center gap-8 p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center space-y-4"
            >
              <div className="relative inline-block">
                <div className="p-6 ocean-gradient rounded-3xl shadow-xl">
                  <Globe2 className="w-16 h-16 text-primary-foreground" />
                </div>
                <motion.div
                  className="absolute -top-2 -right-2 p-2 bg-secondary rounded-full shadow-lg"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Sparkles className="w-5 h-5 text-secondary-foreground" />
                </motion.div>
              </div>
              
              <h2 className="font-display text-3xl font-bold text-foreground">
                Bienvenido a GeoData Manager
              </h2>
              <p className="text-lg text-muted-foreground max-w-md">
                Sube tus archivos KML, organiza tus ubicaciones por continente, 
                país o región, y enriquécelas con IA.
              </p>
            </motion.div>

            <FileUploadZone onUploadComplete={() => setShowUploadDialog(false)} />

            {/* Features */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 w-full max-w-3xl"
            >
              {[
                { icon: MapPin, title: '+2500 puntos', desc: 'Maneja miles de ubicaciones' },
                { icon: Globe2, title: 'Auto-geocoding', desc: 'Detecta país y región automáticamente' },
                { icon: Sparkles, title: 'Enriquecimiento IA', desc: 'Turismo, gastronomía y más' },
              ].map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex flex-col items-center gap-3 p-6 bg-card rounded-xl shadow-soft text-center"
                >
                  <feature.icon className="w-8 h-8 text-primary" />
                  <h3 className="font-display font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          // Fullscreen map with floating panels
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full w-full"
          >
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
              onUploadClick={() => setShowUploadDialog(true)}
              filtersOpen={showFiltersPanel}
              locationsOpen={showLocationsPanel}
              activeFilterCount={activeFilterCount}
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
          </motion.div>
        )}
      </AnimatePresence>

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
    </div>
  );
};

export default Index;
