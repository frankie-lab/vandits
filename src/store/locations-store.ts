import { create } from 'zustand';
import { GeoLocation, KMLDocument, FilterCriteria, EnrichedLocationData, EnrichmentStatusFilter, OwnershipFilter } from '@/types/location';
import { supabase } from '@/integrations/supabase/client';

// Helper to load enrichment criteria timestamp from localStorage
function loadCriteriaTimestamp(): number {
  try {
    const stored = localStorage.getItem('geodata-enrichment-criteria');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed._updatedAt || 0;
    }
  } catch (e) {}
  return 0;
}

// Check if a location meets the current criteria (based on update date)
function meetsCriteria(loc: GeoLocation): boolean {
  // Debe tener ficha IA
  if (!loc.enrichedData?.descripcion) return false;
  
  // Cargar timestamp de criterios
  const criteriaTimestamp = loadCriteriaTimestamp();
  
  // Si no hay timestamp guardado, todas las fichas con enrichedData son "current"
  if (criteriaTimestamp === 0) return true;
  
  // Comparar fecha de actualización de la location con fecha de criterios
  const locationUpdatedAt = loc.updatedAt instanceof Date 
    ? loc.updatedAt.getTime() 
    : new Date(loc.updatedAt).getTime();
  
  return locationUpdatedAt >= criteriaTimestamp;
}

// Get the enrichment status of a location - exported for use in components
export function getLocationEnrichmentStatus(loc: GeoLocation): EnrichmentStatusFilter {
  // Verde: tiene ficha IA y cumple criterios actuales
  if (loc.enrichedData?.descripcion && meetsCriteria(loc)) {
    return 'current';
  }
  // Azul: tiene ficha IA pero no cumple criterios actuales
  if (loc.enrichedData?.descripcion) {
    return 'previous';
  }
  // Naranja: tiene descripción original pero sin ficha IA
  if (loc.description && loc.description.trim().length > 0) {
    return 'unknown';
  }
  // Rojo: sin ficha IA ni descripción
  return 'new';
}

interface LocationsState {
  documents: KMLDocument[];
  selectedLocations: Set<string>;
  focusedLocationId: string | null;
  filters: FilterCriteria;
  viewMode: 'map' | 'list' | 'split';
  currentUserId: string | null; // Cache del usuario actual para filtros
  
  // Actions
  addDocument: (doc: KMLDocument) => void;
  removeDocument: (id: string) => void;
  clearAllDocuments: () => void;
  
  updateLocation: (locationId: string, updates: Partial<GeoLocation>) => void;
  updateDocumentLocations: (docId: string, locations: GeoLocation[]) => void;
  
  toggleLocationSelection: (id: string) => void;
  selectAllLocations: () => void;
  clearSelection: () => void;
  selectByFilter: (filter: FilterCriteria) => void;
  
  setFocusedLocation: (id: string | null) => void;
  
  setFilters: (filters: FilterCriteria) => void;
  setViewMode: (mode: 'map' | 'list' | 'split') => void;
  setCurrentUserId: (userId: string | null) => void;
  
  // Helpers - consolidated view
  getAllLocations: () => GeoLocation[];
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
  getLocationOwnership: (locationId: string, currentUserId?: string | null) => { isOwn: boolean; ownerName?: string };
  
  // For compatibility - returns a virtual "consolidated document"
  selectedDocument: KMLDocument | null;
}

export const useLocationsStore = create<LocationsState>((set, get) => ({
  documents: [],
  selectedLocations: new Set(),
  focusedLocationId: null,
  filters: {},
  viewMode: 'split',
  currentUserId: null,
  
  // Virtual consolidated document (computed property)
  get selectedDocument(): KMLDocument | null {
    const state = get();
    if (state.documents.length === 0) return null;
    
    // Return a virtual document with all locations from all documents
    const allLocations = state.documents.flatMap(doc => doc.locations);
    return {
      id: 'consolidated',
      name: 'Todos los documentos',
      fileName: 'consolidated.kml',
      locations: allLocations,
      uploadedAt: new Date(),
    };
  },
  
  addDocument: (doc) => set((state) => ({ 
    documents: [...state.documents, doc],
  })),
  
  removeDocument: (id) => set((state) => {
    const newDocuments = state.documents.filter(d => d.id !== id);
    return {
      documents: newDocuments,
      selectedLocations: new Set(),
      filters: {},
    };
  }),

  clearAllDocuments: () => set({
    documents: [],
    selectedLocations: new Set(),
    focusedLocationId: null,
    filters: {},
  }),
  
  updateLocation: (locationId, updates) => set((state) => {
    const newDocuments = state.documents.map(doc => ({
      ...doc,
      locations: doc.locations.map(loc =>
        loc.id === locationId 
          ? { ...loc, ...updates, updatedAt: new Date() }
          : loc
      ),
    }));
    
    return { documents: newDocuments };
  }),

  updateDocumentLocations: (docId, locations) => set((state) => {
    const newDocuments = state.documents.map(doc => 
      doc.id === docId 
        ? { ...doc, locations }
        : doc
    );
    
    return { documents: newDocuments };
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
    const allLocations = state.documents.flatMap(doc => doc.locations);
    const filtered = allLocations.filter(loc => {
      if (filter.continent && loc.continent !== filter.continent) return false;
      if (filter.country && loc.country !== filter.country) return false;
      if (filter.region && loc.region !== filter.region) return false;
      if (filter.zone && loc.zone !== filter.zone) return false;
      return true;
    });
    return { selectedLocations: new Set(filtered.map(l => l.id)) };
  }),
  
  setFocusedLocation: (id) => set({ focusedLocationId: id }),
  
  setFilters: (filters) => set({ filters }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  setCurrentUserId: (userId) => set({ currentUserId: userId }),
  
  // Get all locations from all documents
  getAllLocations: () => {
    const state = get();
    return state.documents.flatMap(doc => doc.locations);
  },
  
  getFilteredLocations: () => {
    const state = get();
    const currentUserId = state.currentUserId;
    const allLocationsWithDocId: Array<GeoLocation & { _docId: string; _docUserId?: string }> = [];
    
    // Flatten locations with document info
    state.documents.forEach(doc => {
      doc.locations.forEach(loc => {
        allLocationsWithDocId.push({
          ...loc,
          _docId: doc.id,
          _docUserId: doc.userId,
        });
      });
    });
    
    return allLocationsWithDocId.filter(loc => {
      const { 
        continent, country, region, zone, 
        comarca, localidad, sublocalidad,
        classificationCode,
        searchTerm, placeType, tag, onlyEnriched, verified, semanticResultIds,
        enrichmentStatus,
        ownershipFilter
      } = state.filters;
      
      // Ownership filter
      if (ownershipFilter && ownershipFilter !== 'all' && currentUserId) {
        const isOwn = loc._docUserId === currentUserId;
        if (ownershipFilter === 'mine' && !isOwn) return false;
        if (ownershipFilter === 'followed' && isOwn) return false;
      }
      
      // Enrichment status filter
      if (enrichmentStatus) {
        const locStatus = getLocationEnrichmentStatus(loc);
        if (locStatus !== enrichmentStatus) return false;
      }
      
      // Semantic search filter - if active, only show matching locations
      if (semanticResultIds && semanticResultIds.length > 0) {
        if (!semanticResultIds.includes(loc.id)) return false;
      }
      
      // Handle "Sin clasificar" special filter
      if (continent === '__unclassified__') {
        if (loc.continent && loc.country) return false; // Skip classified locations
      } else {
        if (continent && loc.continent !== continent) return false;
        if (country && loc.country !== country) return false;
        if (region && loc.region !== region) return false;
        if (zone && loc.zone !== zone) return false;
      }
      
      // Extended geographic filters from enrichedData.datos_geograficos
      const gd = loc.enrichedData?.datos_geograficos;
      if (comarca) {
        const locComarca = gd?.admin_nivel_3;
        if (locComarca !== comarca) return false;
      }
      if (localidad) {
        const locLocalidad = gd?.localidad;
        if (locLocalidad !== localidad) return false;
      }
      if (sublocalidad) {
        const locSublocalidad = gd?.sublocalidad;
        if (locSublocalidad !== sublocalidad) return false;
      }
      
      // Classification filter
      if (classificationCode) {
        const locCode = loc.enrichedData?.clasificacion?.codigo;
        if (classificationCode === '__unclassified__') {
          // Show only enriched locations without classification
          if (!loc.enrichedData || locCode) return false;
        } else {
          // Match exact code or any code that starts with this prefix
          if (!locCode || !locCode.startsWith(classificationCode)) return false;
        }
      }
      
      if (placeType && loc.placeType !== placeType) return false;
      
      // Filter by enriched status
      if (onlyEnriched && !loc.enrichedData) return false;
      
      // Filter by verified status
      if (verified !== undefined && loc.enrichedData?.verified !== verified) return false;
      
      // Filter by tags (supports multiple tags - location must have ALL selected tags)
      const activeTags = tag ? [tag] : (state.filters.tags || []);
      if (activeTags.length > 0) {
        if (!loc.enrichedData?.etiquetas) return false;
        const locTags = loc.enrichedData.etiquetas.map(t => t.toLowerCase().replace('#', ''));
        const hasAllTags = activeTags.every(filterTag => 
          locTags.some(locTag => locTag === filterTag.toLowerCase().replace('#', ''))
        );
        if (!hasAllTags) return false;
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
    }) as GeoLocation[];
  },
  
  getUniqueValues: (field) => {
    const state = get();
    const allLocations = state.documents.flatMap(doc => doc.locations);
    
    const values = new Set<string>();
    allLocations.forEach(loc => {
      const value = loc[field];
      if (typeof value === 'string' && value) {
        values.add(value);
      }
    });
    
    return Array.from(values).sort();
  },

  getUniqueTags: () => {
    const state = get();
    const allLocations = state.documents.flatMap(doc => doc.locations);
    
    const tags = new Set<string>();
    allLocations.forEach(loc => {
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
    const allLocations = state.documents.flatMap(doc => doc.locations);
    
    if (allLocations.length === 0) return { 
      total: 0, enriched: 0, verified: 0, outdated: 0,
      byCriteria: { current: 0, previous: 0, unknown: 0, new: 0 }
    };
    
    const total = allLocations.length;
    const enriched = allLocations.filter(l => l.enrichedData).length;
    const verified = allLocations.filter(l => l.enrichedData?.verified).length;
    
    // Clasificar por criterio de enriquecimiento
    let current = 0;   // Verde: Estado final (cumple criterio actual)
    let previous = 0;  // Azul: Pendiente de nuevo criterio
    let unknown = 0;   // Naranja: Desconocido (tiene descripción original pero sin ficha IA)
    let newCount = 0;  // Rojo: Importado sin actualizar (sin ficha IA ni descripción)
    
    allLocations.forEach(loc => {
      if (loc.enrichedData?.descripcion) {
        if (meetsCriteria(loc)) {
          current++;
        } else {
          previous++;
        }
      } else if (loc.description && loc.description.trim().length > 0) {
        unknown++;
      } else {
        newCount++;
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
    const allLocations = state.documents.flatMap(doc => doc.locations);
    
    return allLocations.filter(loc => {
      if (criteria === 'current') {
        return loc.enrichedData?.descripcion && meetsCriteria(loc);
      } else if (criteria === 'previous') {
        return loc.enrichedData?.descripcion && !meetsCriteria(loc);
      } else if (criteria === 'unknown') {
        return !loc.enrichedData?.descripcion && loc.description && loc.description.trim().length > 0;
      } else {
      // new = importado sin actualizar (sin ficha IA ni descripción)
      return !loc.enrichedData?.descripcion && (!loc.description || loc.description.trim().length === 0);
    }
  });
},

// Obtener info de propiedad de una ubicación
getLocationOwnership: (locationId: string, currentUserId?: string | null) => {
  const state = get();
  
  // Encontrar el documento que contiene esta location
  for (const doc of state.documents) {
    const hasLocation = doc.locations.some(loc => loc.id === locationId);
    if (hasLocation) {
      const isOwn = !!(currentUserId && doc.userId === currentUserId);
      return {
        isOwn,
        ownerName: isOwn ? undefined : doc.ownerName,
      };
    }
  }
  
  return { isOwn: true }; // Default: propio si no se encuentra
},
}));
