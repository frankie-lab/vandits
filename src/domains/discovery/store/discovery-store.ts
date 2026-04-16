/**
 * Discovery Store — Manages filters, selection and viewport state for the Discovery domain.
 *
 * This store isolates Discovery's UI state from the Content monolith (locations-store).
 * Content data is accessed via read-only hooks, not stored here.
 */
import { create } from 'zustand';
import type { DiscoveryPanelState, MapViewport } from '../types';

interface DiscoveryState {
  /** Currently focused location ID (highlighted on map) */
  focusedLocationId: string | null;
  /** Currently selected location ID (open in detail panel) */
  selectedLocationId: string | null;
  /** Map viewport */
  viewport: MapViewport;
  /** Panel visibility */
  panels: DiscoveryPanelState;

  // Actions
  setFocusedLocation: (id: string | null) => void;
  setSelectedLocation: (id: string | null) => void;
  setViewport: (viewport: Partial<MapViewport>) => void;
  togglePanel: (panel: keyof DiscoveryPanelState) => void;
  setPanel: (panel: keyof DiscoveryPanelState, open: boolean) => void;
  closeAllPanels: () => void;
}

const DEFAULT_PANELS: DiscoveryPanelState = {
  showFilters: false,
  showLocations: false,
  showGallery: false,
  showSemanticSearch: false,
  showDuplicates: false,
  showIncomplete: false,
  showUnresolved: false,
  showLayers: false,
};

export const useDiscoveryStore = create<DiscoveryState>((set) => ({
  focusedLocationId: null,
  selectedLocationId: null,
  viewport: { center: [40.0, -3.7], zoom: 6 },
  panels: { ...DEFAULT_PANELS },

  setFocusedLocation: (id) => set({ focusedLocationId: id }),
  setSelectedLocation: (id) => set({ selectedLocationId: id }),
  setViewport: (viewport) => set((s) => ({ viewport: { ...s.viewport, ...viewport } })),

  togglePanel: (panel) =>
    set((s) => ({ panels: { ...s.panels, [panel]: !s.panels[panel] } })),

  setPanel: (panel, open) =>
    set((s) => ({ panels: { ...s.panels, [panel]: open } })),

  closeAllPanels: () => set({ panels: { ...DEFAULT_PANELS } }),
}));
