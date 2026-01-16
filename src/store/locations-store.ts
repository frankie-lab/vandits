import { create } from 'zustand';
import { GeoLocation, KMLDocument, FilterCriteria, EnrichedLocationData } from '@/types/location';

// Helper to load enrichment criteria from localStorage
function loadCriteria() {
  try {
    const stored = localStorage.getItem('geodata-enrichment-criteria');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {}
  return {
    minDescriptionLength: 1000,
    requireImage: false,
    requireWebReference: false,
    requireTags: false,
    minTagsCount: 3,
    requireType: true,
    requireAccess: false,
    requireProtection: false,
    requireFullGeography: false,
  };
}

// Check if a location meets the current enrichment criteria
function meetsCriteria(loc: GeoLocation): boolean {
  const criteria = loadCriteria();
  const ed = loc.enrichedData;
  
  if (!ed?.descripcion) return false;
  
  // Check description length
  if ((ed.descripcion?.length || 0) < criteria.minDescriptionLength) return false;
  
  // Check image
  if (criteria.requireImage && !ed.imagen) return false;
  
  // Check web reference
  if (criteria.requireWebReference && !ed.datos_clave?.web_referencia) return false;
  
  // Check tags
  if (criteria.requireTags && (ed.etiquetas?.length || 0) < criteria.minTagsCount) return false;
  
  // Check type
  if (criteria.requireType && !ed.datos_clave?.tipo) return false;
  
  // Check access
  if (criteria.requireAccess && !ed.datos_clave?.acceso) return false;
  
  // Check protection
  if (criteria.requireProtection && !ed.datos_clave?.estado_proteccion) return false;
  
  // Check geography
  if (criteria.requireFullGeography) {
    if (!loc.continent || !loc.country || !loc.region) return false;
  }
  
  return true;
}

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
  getEnrichedStats: () => { 
    total: number; 
    enriched: number; 
    verified: number; 
    outdated: number;
    byCriteria: { current: number; previous: number; unknown: number; new: number };
  };
  getLocationsByCriteria: (criteria: 'current' | 'previous' | 'unknown' | 'new') => GeoLocation[];
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
      
      // Handle "Sin clasificar" special filter
      if (continent === '__unclassified__') {
        if (loc.continent && loc.country) return false; // Skip classified locations
      } else {
        if (continent && loc.continent !== continent) return false;
        if (country && loc.country !== country) return false;
        if (region && loc.region !== region) return false;
        if (zone && loc.zone !== zone) return false;
      }
      
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
    if (!state.selectedDocument) return { 
      total: 0, enriched: 0, verified: 0, outdated: 0,
      byCriteria: { current: 0, previous: 0, unknown: 0, new: 0 }
    };
    
    const total = state.selectedDocument.locations.length;
    const enriched = state.selectedDocument.locations.filter(l => l.enrichedData).length;
    const verified = state.selectedDocument.locations.filter(l => l.enrichedData?.verified).length;
    
    // Threshold for "new" locations (24 hours)
    const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Clasificar por criterio de enriquecimiento usando los criterios configurables
    let current = 0;   // Verde: Estado final (cumple criterio actual)
    let previous = 0;  // Azul: Pendiente de nuevo criterio
    let unknown = 0;   // Naranja: Desconocido (sin ficha IA, no reciente)
    let newCount = 0;  // Rojo: Nuevo (añadido recientemente)
    
    state.selectedDocument.locations.forEach(loc => {
      if (loc.enrichedData?.descripcion) {
        if (meetsCriteria(loc)) {
          current++;
        } else {
          previous++;
        }
      } else {
        // Sin ficha IA - determinar si es nuevo o desconocido
        const createdTime = loc.createdAt ? new Date(loc.createdAt).getTime() : 0;
        const isRecent = createdTime > 0 && (now - createdTime) < RECENT_THRESHOLD_MS;
        
        if (isRecent) {
          newCount++;
        } else {
          unknown++;
        }
      }
    });
    
    const outdated = previous; // Para compatibilidad
    
    return { 
      total, enriched, verified, outdated,
      byCriteria: { current, previous, unknown, new: newCount }
    };
  },

  // Obtener ubicaciones por estado de criterio
  getLocationsByCriteria: (criteria: 'current' | 'previous' | 'unknown' | 'new') => {
    const state = get();
    if (!state.selectedDocument) return [];
    
    const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    return state.selectedDocument.locations.filter(loc => {
      if (criteria === 'current') {
        return loc.enrichedData?.descripcion && meetsCriteria(loc);
      } else if (criteria === 'previous') {
        return loc.enrichedData?.descripcion && !meetsCriteria(loc);
      } else if (criteria === 'new') {
        if (loc.enrichedData?.descripcion) return false;
        const createdTime = loc.createdAt ? new Date(loc.createdAt).getTime() : 0;
        return createdTime > 0 && (now - createdTime) < RECENT_THRESHOLD_MS;
      } else {
        // unknown
        if (loc.enrichedData?.descripcion) return false;
        const createdTime = loc.createdAt ? new Date(loc.createdAt).getTime() : 0;
        const isRecent = createdTime > 0 && (now - createdTime) < RECENT_THRESHOLD_MS;
        return !isRecent;
      }
    });
  },
}));
