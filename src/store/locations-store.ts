import { create } from 'zustand';
import { GeoLocation, KMLDocument, FilterCriteria } from '@/types/location';

interface LocationsState {
  documents: KMLDocument[];
  selectedDocument: KMLDocument | null;
  selectedLocations: Set<string>;
  filters: FilterCriteria;
  viewMode: 'map' | 'list' | 'split';
  
  // Actions
  addDocument: (doc: KMLDocument) => void;
  removeDocument: (id: string) => void;
  selectDocument: (id: string | null) => void;
  
  updateLocation: (docId: string, locationId: string, updates: Partial<GeoLocation>) => void;
  
  toggleLocationSelection: (id: string) => void;
  selectAllLocations: () => void;
  clearSelection: () => void;
  selectByFilter: (filter: FilterCriteria) => void;
  
  setFilters: (filters: FilterCriteria) => void;
  setViewMode: (mode: 'map' | 'list' | 'split') => void;
  
  getFilteredLocations: () => GeoLocation[];
  getUniqueValues: (field: keyof GeoLocation) => string[];
}

export const useLocationsStore = create<LocationsState>((set, get) => ({
  documents: [],
  selectedDocument: null,
  selectedLocations: new Set(),
  filters: {},
  viewMode: 'split',
  
  addDocument: (doc) => set((state) => ({ 
    documents: [...state.documents, doc],
    selectedDocument: doc,
  })),
  
  removeDocument: (id) => set((state) => ({
    documents: state.documents.filter(d => d.id !== id),
    selectedDocument: state.selectedDocument?.id === id ? null : state.selectedDocument,
  })),
  
  selectDocument: (id) => set((state) => ({
    selectedDocument: id ? state.documents.find(d => d.id === id) || null : null,
    selectedLocations: new Set(),
    filters: {},
  })),
  
  updateLocation: (docId, locationId, updates) => set((state) => ({
    documents: state.documents.map(doc => 
      doc.id === docId 
        ? {
            ...doc,
            locations: doc.locations.map(loc =>
              loc.id === locationId 
                ? { ...loc, ...updates, updatedAt: new Date() }
                : loc
            ),
          }
        : doc
    ),
    selectedDocument: state.selectedDocument?.id === docId
      ? {
          ...state.selectedDocument,
          locations: state.selectedDocument.locations.map(loc =>
            loc.id === locationId 
              ? { ...loc, ...updates, updatedAt: new Date() }
              : loc
          ),
        }
      : state.selectedDocument,
  })),
  
  toggleLocationSelection: (id) => set((state) => {
    const newSelection = new Set(state.selectedLocations);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    return { selectedLocations: newSelection };
  }),
  
  selectAllLocations: () => set((state) => ({
    selectedLocations: new Set(get().getFilteredLocations().map(l => l.id)),
  })),
  
  clearSelection: () => set({ selectedLocations: new Set() }),
  
  selectByFilter: (filter) => set((state) => {
    const filtered = state.selectedDocument?.locations.filter(loc => {
      if (filter.continent && loc.continent !== filter.continent) return false;
      if (filter.country && loc.country !== filter.country) return false;
      if (filter.region && loc.region !== filter.region) return false;
      if (filter.zone && loc.zone !== filter.zone) return false;
      return true;
    }) || [];
    return { selectedLocations: new Set(filtered.map(l => l.id)) };
  }),
  
  setFilters: (filters) => set({ filters }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  getFilteredLocations: () => {
    const state = get();
    if (!state.selectedDocument) return [];
    
    return state.selectedDocument.locations.filter(loc => {
      const { continent, country, region, zone, searchTerm } = state.filters;
      
      if (continent && loc.continent !== continent) return false;
      if (country && loc.country !== country) return false;
      if (region && loc.region !== region) return false;
      if (zone && loc.zone !== zone) return false;
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesName = loc.name.toLowerCase().includes(search);
        const matchesDesc = loc.description?.toLowerCase().includes(search);
        if (!matchesName && !matchesDesc) return false;
      }
      
      return true;
    });
  },
  
  getUniqueValues: (field) => {
    const state = get();
    if (!state.selectedDocument) return [];
    
    const values = new Set<string>();
    state.selectedDocument.locations.forEach(loc => {
      const value = loc[field];
      if (typeof value === 'string' && value) {
        values.add(value);
      }
    });
    
    return Array.from(values).sort();
  },
}));
