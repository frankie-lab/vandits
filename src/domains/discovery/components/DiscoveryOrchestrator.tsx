/**
 * DiscoveryOrchestrator — Manages map, filters, and exploration panels.
 *
 * Right-side panels share a single slot via `useRightPanel` (mutual exclusion).
 */
import React, { useMemo, useCallback, useEffect } from 'react';
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
import { useRightPanel } from '@/hooks/use-right-panel';
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
  const { isOpen, toggle, close } = useRightPanel();

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

  // ─── Derived flags ───────────────────────────────────────────
  const filtersOpen = isOpen('filters');
  const locationsOpen = isOpen('locations');
  const semanticSearchOpen = isOpen('semanticSearch');

  // ─── Controls exposed to parent ──────────────────────────────
  const controls: DiscoveryControls = useMemo(() => ({
    toggleFilters: () => toggle('filters'),
    toggleLocations: () => toggle('locations'),
    toggleGallery: () => toggle('gallery'),
    toggleSemanticSearch: () => toggle('semanticSearch'),
    toggleDuplicates: () => toggle('duplicates'),
    toggleIncomplete: () => toggle('incomplete'),
    toggleLayers: () => toggle('layers'),
    filtersOpen,
    locationsOpen,
    activeFilterCount,
  }), [toggle, filtersOpen, locationsOpen, activeFilterCount]);

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
        isOpen={isOpen('layers')}
        onClose={() => close('layers')}
        position="right"
      >
        <LayersPanel />
      </FloatingPanel>

      {/* Filters panel — left side, doesn't conflict but still in registry */}
      <FloatingPanel
        title="Filtros"
        icon={<Filter className="w-4 h-4 text-primary" />}
        isOpen={filtersOpen}
        onClose={() => close('filters')}
        position="left"
      >
        <div className="p-3"><FilterBar /></div>
      </FloatingPanel>

      {/* Locations panel */}
      <FloatingPanel
        title="Ubicaciones"
        icon={<List className="w-4 h-4 text-primary" />}
        isOpen={locationsOpen}
        onClose={() => close('locations')}
        position="right"
        topOffset={semanticSearchOpen ? 'top-[calc(50vh+0.5rem)]' : undefined}
      >
        <LocationList />
      </FloatingPanel>

      {/* Gallery */}
      <AnimatePresence>
        {isOpen('gallery') && (
          <GalleryView
            onClose={() => close('gallery')}
            onLocationClick={handleLocationFocus}
          />
        )}
      </AnimatePresence>

      {/* Semantic search */}
      <AnimatePresence>
        {semanticSearchOpen && (
          <SemanticSearch
            onClose={() => close('semanticSearch')}
            onLocationClick={handleLocationFocus}
            splitWithLocations={locationsOpen}
          />
        )}
      </AnimatePresence>

      {/* Duplicates */}
      <AnimatePresence>
        {isOpen('duplicates') && (
          <DuplicatesList
            onClose={() => close('duplicates')}
            onLocationClick={handleLocationFocus}
          />
        )}
      </AnimatePresence>

      {/* Incomplete & unresolved */}
      <IncompleteLocationsPanel
        isOpen={isOpen('incomplete')}
        onClose={() => close('incomplete')}
        onLocationClick={() => {}}
      />
      <UnresolvedLocationsPanel
        isOpen={isOpen('unresolved')}
        onClose={() => close('unresolved')}
        onLocationClick={() => {}}
      />
    </>
  );
}
