import { create } from 'zustand';
import { GeoLocation, KMLDocument, FilterCriteria } from '@/types/location';

interface LocationsState {
  documents: KMLDocument[];
  selectedDocument: KMLDocument | null;
  selectedLocations: Set<string>;
  focusedLocationId: string | null;
  filters: FilterCriteria;
  viewMode: 'map' | 'list' | 'split';
  
  // Actions
  addDocument: (doc: KMLDocument) => void;
  removeDocument: (id: string) => void;
  selectDocument: (id: string | null) => void;
  clearAllDocuments: () => void;
  
  updateLocation: (docId: string, locationId: string, updates: Partial<GeoLocation>) => void;
  updateDocumentLocations: (docId: string, locations: GeoLocation[]) => void;
  
  toggleLocationSelection: (id: string) => void;
  selectAllLocations: () => void;
  clearSelection: () => void;
  selectByFilter: (filter: FilterCriteria) => void;
  
  setFocusedLocation: (id: string | null) => void;
  
  setFilters: (filters: FilterCriteria) => void;
  setViewMode: (mode: 'map' | 'list' | 'split') => void;
  
  getFilteredLocations: () => GeoLocation[];
  getUniqueValues: (field: keyof GeoLocation) => string[];
  getUniqueTags: () => string[];
  getEnrichedStats: () => { total: number; enriched: number; verified: number };
}

export const useLocationsStore = create<LocationsState>((set, get) => ({
  documents: [],
  selectedDocument: null,
  selectedLocations: new Set(),
  focusedLocationId: null,
  filters: {},
  viewMode: 'split',
  
  addDocument: (doc) => set((state) => ({ 
    documents: [...state.documents, doc],
    selectedDocument: doc,
  })),
  
  removeDocument: (id) => set((state) => {
    const newDocuments = state.documents.filter(d => d.id !== id);
    return {
      documents: newDocuments,
      selectedDocument: state.selectedDocument?.id === id 
        ? (newDocuments.length > 0 ? newDocuments[0] : null)
        : state.selectedDocument,
      selectedLocations: new Set(),
      filters: {},
    };
  }),

  clearAllDocuments: () => set({
    documents: [],
    selectedDocument: null,
    selectedLocations: new Set(),
    focusedLocationId: null,
    filters: {},
  }),
  
  selectDocument: (id) => set((state) => ({
    selectedDocument: id ? state.documents.find(d => d.id === id) || null : null,
    selectedLocations: new Set(),
    focusedLocationId: null,
    filters: {},
  })),
  
  updateLocation: (docId, locationId, updates) => set((state) => {
    const newDocuments = state.documents.map(doc => 
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
    );
    
    const newSelectedDocument = state.selectedDocument?.id === docId
      ? newDocuments.find(d => d.id === docId) || null
      : state.selectedDocument;
    
    return {
      documents: newDocuments,
      selectedDocument: newSelectedDocument,
    };
  }),

  updateDocumentLocations: (docId, locations) => set((state) => {
    const newDocuments = state.documents.map(doc => 
      doc.id === docId 
        ? { ...doc, locations }
        : doc
    );
    
    const newSelectedDocument = state.selectedDocument?.id === docId
      ? newDocuments.find(d => d.id === docId) || null
      : state.selectedDocument;
    
    return {
      documents: newDocuments,
      selectedDocument: newSelectedDocument,
    };
  }),
  
  toggleLocationSelection: (id) => set((state) => {
    const newSelection = new Set(state.selectedLocations);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    return { selectedLocations: newSelection };
  }),
  
  selectAllLocations: () => set(() => ({
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
  
  setFocusedLocation: (id) => set({ focusedLocationId: id }),
  
  setFilters: (filters) => set({ filters }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  getFilteredLocations: () => {
    const state = get();
    if (!state.selectedDocument) return [];
    
    return state.selectedDocument.locations.filter(loc => {
      const { continent, country, region, zone, searchTerm, placeType, tag, onlyEnriched, verified } = state.filters;
      
      if (continent && loc.continent !== continent) return false;
      if (country && loc.country !== country) return false;
      if (region && loc.region !== region) return false;
      if (zone && loc.zone !== zone) return false;
      if (placeType && loc.placeType !== placeType) return false;
      
      // Filter by enriched status
      if (onlyEnriched && !loc.enrichedData) return false;
      
      // Filter by verified status
      if (verified !== undefined && loc.enrichedData?.verified !== verified) return false;
      
      // Filter by tag
      if (tag && loc.enrichedData?.etiquetas) {
        const hasTags = loc.enrichedData.etiquetas.some(t => 
          t.toLowerCase().replace('#', '') === tag.toLowerCase().replace('#', '')
        );
        if (!hasTags) return false;
      } else if (tag) {
        return false; // No enrichedData means no tags
      }
      
      // Search term - now includes enriched data
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesName = loc.name.toLowerCase().includes(search);
        const matchesDesc = loc.description?.toLowerCase().includes(search);
        const matchesEnrichedName = loc.enrichedData?.nombre_lugar?.toLowerCase().includes(search);
        const matchesEnrichedDesc = loc.enrichedData?.descripcion?.toLowerCase().includes(search);
        const matchesEnrichedHighlight = loc.enrichedData?.punto_destacado?.toLowerCase().includes(search);
        const matchesTags = loc.enrichedData?.etiquetas?.some(t => t.toLowerCase().includes(search));
        const matchesType = loc.enrichedData?.datos_clave?.tipo?.toLowerCase().includes(search);
        
        if (!matchesName && !matchesDesc && !matchesEnrichedName && !matchesEnrichedDesc && 
            !matchesEnrichedHighlight && !matchesTags && !matchesType) return false;
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

  getUniqueTags: () => {
    const state = get();
    if (!state.selectedDocument) return [];
    
    const tags = new Set<string>();
    state.selectedDocument.locations.forEach(loc => {
      if (loc.enrichedData?.etiquetas) {
        loc.enrichedData.etiquetas.forEach(tag => {
          const cleanTag = tag.replace('#', '').toLowerCase();
          if (cleanTag) tags.add(cleanTag);
        });
      }
    });
    
    return Array.from(tags).sort();
  },

  getEnrichedStats: () => {
    const state = get();
    if (!state.selectedDocument) return { total: 0, enriched: 0, verified: 0 };
    
    const total = state.selectedDocument.locations.length;
    const enriched = state.selectedDocument.locations.filter(l => l.enrichedData).length;
    const verified = state.selectedDocument.locations.filter(l => l.enrichedData?.verified).length;
    
    return { total, enriched, verified };
  },
}));
