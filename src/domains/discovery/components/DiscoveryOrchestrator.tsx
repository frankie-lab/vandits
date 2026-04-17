/**
 * DiscoveryOrchestrator — Manages map, filters, and exploration panels.
 *
 * Extracted from Index.tsx to isolate Discovery domain responsibilities.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Filter, List, Layers } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { LocationMap } from '@/components/LocationMap';
import { LocationList } from '@/components/LocationList';
import { FilterBar } from '@/components/FilterBar';
import { GeocodeButton } from '@/components/GeocodeButton';
import { BottomProgressBar } from '@/components/BottomProgressBar';
import { FloatingPanel } from '@/components/FloatingPanel';
import { GalleryView } from '@/components/GalleryView';
import { SemanticSearch } from '@/components/SemanticSearch';
import { DuplicatesList } from '@/components/DuplicatesList';
import { IncompleteLocationsPanel } from '@/components/IncompleteLocationsPanel';
import { UnresolvedLocationsPanel } from '@/components/UnresolvedLocationsPanel';
import { LayersPanel } from '@/components/LayersPanel';
import { useLocationsStore } from '@/domains/content';
import { useLayerVisibility } from '@/hooks/use-layer-visibility';
import type { GeoLocation } from '@/types/location';

// ── Public API exposed to parent (Index.tsx) ─────────────────
export interface DiscoveryControls {
  toggleFilters: () => void;
  toggleLocations: () => void;
  toggleGallery: () => void;
  toggleSemanticSearch: () => void;
  toggleDuplicates: () => void;
  toggleIncomplete: () => void;
  toggleLayers: () => void;
  filtersOpen: boolean;
  locationsOpen: boolean;
  activeFilterCount: number;
}

interface DiscoveryOrchestratorProps {
  /** Ref callback to expose controls to parent */
  onControlsReady: (controls: DiscoveryControls) => void;
  /** Criteria version for re-keying toolbar */
  criteriaVersion: number;
}

export function DiscoveryOrchestrator({ onControlsReady, criteriaVersion }: DiscoveryOrchestratorProps) {
  // ─── Panel states ────────────────────────────────────────────
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showLocationsPanel, setShowLocationsPanel] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showSemanticSearch, setShowSemanticSearch] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [showLayers, setShowLayers] = useState(false);

  const { filters } = useLocationsStore();

  // Initialize layer visibility
  useLayerVisibility();

  // ─── Computed ────────────────────────────────────────────────
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

  // ─── Controls exposed to parent ──────────────────────────────
  const controls: DiscoveryControls = useMemo(() => ({
    toggleFilters: () => setShowFiltersPanel(v => !v),
    toggleLocations: () => setShowLocationsPanel(v => !v),
    toggleGallery: () => setShowGallery(true),
    toggleSemanticSearch: () => setShowSemanticSearch(v => !v),
    toggleDuplicates: () => setShowDuplicates(true),
    toggleIncomplete: () => setShowIncomplete(v => !v),
    toggleLayers: () => setShowLayers(v => !v),
    filtersOpen: showFiltersPanel,
    locationsOpen: showLocationsPanel,
    activeFilterCount,
  }), [showFiltersPanel, showLocationsPanel, activeFilterCount]);

  useEffect(() => {
    onControlsReady(controls);
  }, [controls, onControlsReady]);

  // ─── Handlers ────────────────────────────────────────────────
  const handleLocationFocus = useCallback((location: GeoLocation) => {
    useLocationsStore.getState().setFocusedLocation(location.id);
  }, []);

  // ─── Render ──────────────────────────────────────────────────
  return (
    <>
      {/* Map (full-screen background) */}
      <div className="absolute inset-0">
        <LocationMap />
      </div>

      {/* Geocode button */}
      <div className="fixed bottom-16 left-4 z-[999]">
        <GeocodeButton />
      </div>

      {/* Progress bar */}
      <BottomProgressBar />

      {/* Layers panel */}
      <FloatingPanel
        title="Capas del mapa"
        icon={<Layers className="w-4 h-4 text-primary" />}
        isOpen={showLayers}
        onClose={() => setShowLayers(false)}
        position="right"
      >
        <LayersPanel />
      </FloatingPanel>

      {/* Filters panel */}
      <FloatingPanel
        title="Filtros"
        icon={<Filter className="w-4 h-4 text-primary" />}
        isOpen={showFiltersPanel}
        onClose={() => setShowFiltersPanel(false)}
        position="left"
      >
        <div className="p-3"><FilterBar /></div>
      </FloatingPanel>

      {/* Locations panel */}
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

      {/* Gallery */}
      <AnimatePresence>
        {showGallery && (
          <GalleryView
            onClose={() => setShowGallery(false)}
            onLocationClick={handleLocationFocus}
          />
        )}
      </AnimatePresence>

      {/* Semantic search */}
      <AnimatePresence>
        {showSemanticSearch && (
          <SemanticSearch
            onClose={() => setShowSemanticSearch(false)}
            onLocationClick={handleLocationFocus}
            splitWithLocations={showLocationsPanel}
          />
        )}
      </AnimatePresence>

      {/* Duplicates */}
      <AnimatePresence>
        {showDuplicates && (
          <DuplicatesList
            onClose={() => setShowDuplicates(false)}
            onLocationClick={handleLocationFocus}
          />
        )}
      </AnimatePresence>

      {/* Incomplete & unresolved */}
      <IncompleteLocationsPanel
        isOpen={showIncomplete}
        onClose={() => setShowIncomplete(false)}
        onLocationClick={() => {}}
      />
      <UnresolvedLocationsPanel
        isOpen={showUnresolved}
        onClose={() => setShowUnresolved(false)}
        onLocationClick={() => {}}
      />
    </>
  );
}
