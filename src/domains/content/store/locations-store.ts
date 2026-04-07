// Domain: Content — main Zustand store for locations and documents
import { create } from 'zustand';
import { GeoLocation, KMLDocument, FilterCriteria, EnrichmentStatusFilter, OwnershipFilter, VisitedFilter } from '@/types/location';
import { DuplicateMatch } from '@/lib/duplicate-detection';
import { loadPendingDuplicates, savePendingDuplicates, loadResolvedDuplicates, saveResolvedDuplicates } from './duplicates-helpers';
import { meetsCriteria, getLocationEnrichmentStatus } from './enrichment-helpers';

// Re-export for consumers that import from the store file
export { getLocationEnrichmentStatus } from './enrichment-helpers';

/** A location annotated with its document-level ownership metadata */
export interface AnnotatedLocation extends GeoLocation {
  _docId: string;
  _docUserId?: string;
  _curatorId?: string;
}

interface LocationsState {
  documents: KMLDocument[];
  selectedLocations: Set<string>;
  focusedLocationId: string | null;
  filters: FilterCriteria;
  viewMode: 'map' | 'list' | 'split';
  currentUserId: string | null;
  pendingDuplicates: DuplicateMatch[];
  resolvedDuplicatePairIds: string[];

  // Cached flat array — rebuilt only when documents change
  _cachedAnnotated: AnnotatedLocation[];
  _cachedDocVersion: number;
  _docVersion: number;

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

  // Pending duplicates management
  addPendingDuplicates: (duplicates: DuplicateMatch[]) => void;
  removePendingDuplicate: (newLocationId: string) => void;
  clearPendingDuplicates: () => void;
  getPendingDuplicatesCount: () => number;

  // Resolved duplicates management
  addResolvedDuplicatePair: (pairId: string) => void;
  isResolvedDuplicatePair: (pairId: string) => boolean;
  clearResolvedDuplicates: () => void;

  // Helpers
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
  getLocationOwnership: (locationId: string, currentUserId?: string | null) => {
    isOwn: boolean; ownerName?: string; ownerId?: string;
    curatorId?: string; curatorIcon?: string; curatorColor?: string; curatorAvatar?: string;
  };
  updateCuratorInfo: (curatorId: string, updates: { icon?: string; color?: string; avatar?: string }) => void;
  selectedDocument: KMLDocument | null;
}

export const useLocationsStore = create<LocationsState>((set, get) => ({
  documents: [],
  selectedLocations: new Set(),
  focusedLocationId: null,
  filters: {},
  viewMode: 'split',
  currentUserId: null,
  pendingDuplicates: loadPendingDuplicates(),
  resolvedDuplicatePairIds: loadResolvedDuplicates(),
  _cachedAnnotated: [],
  _cachedDocVersion: -1,
  _docVersion: 0,

  get selectedDocument(): KMLDocument | null {
    const state = get();
    if (state.documents.length === 0) return null;
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
    _docVersion: state._docVersion + 1,
  })),

  removeDocument: (id) => set((state) => ({
    documents: state.documents.filter(d => d.id !== id),
    selectedLocations: new Set(),
    filters: {},
    _docVersion: state._docVersion + 1,
  })),

  clearAllDocuments: () => set((state) => ({
    documents: [],
    selectedLocations: new Set(),
    focusedLocationId: null,
    filters: {},
    _docVersion: state._docVersion + 1,
  })),

  updateLocation: (locationId, updates) => set((state) => ({
    documents: state.documents.map(doc => ({
      ...doc,
      locations: doc.locations.map(loc =>
        loc.id === locationId
          ? { ...loc, ...updates, updatedAt: new Date() }
          : loc
      ),
    })),
    _docVersion: state._docVersion + 1,
  })),

  updateDocumentLocations: (docId, locations) => set((state) => ({
    documents: state.documents.map(doc =>
      doc.id === docId ? { ...doc, locations } : doc
    ),
    _docVersion: state._docVersion + 1,
  })),

  toggleLocationSelection: (id) => set((state) => {
    const newSelection = new Set(state.selectedLocations);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
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

  // --- Duplicates ---
  addPendingDuplicates: (duplicates) => set((state) => {
    const newDuplicates = [...state.pendingDuplicates, ...duplicates];
    savePendingDuplicates(newDuplicates);
    return { pendingDuplicates: newDuplicates };
  }),

  removePendingDuplicate: (newLocationId) => set((state) => {
    const newDuplicates = state.pendingDuplicates.filter(d => d.newLocation.id !== newLocationId);
    savePendingDuplicates(newDuplicates);
    return { pendingDuplicates: newDuplicates };
  }),

  clearPendingDuplicates: () => set(() => {
    savePendingDuplicates([]);
    return { pendingDuplicates: [] };
  }),

  getPendingDuplicatesCount: () => get().pendingDuplicates.length,

  addResolvedDuplicatePair: (pairId) => set((state) => {
    const newResolved = [...state.resolvedDuplicatePairIds, pairId];
    saveResolvedDuplicates(newResolved);
    return { resolvedDuplicatePairIds: newResolved };
  }),

  isResolvedDuplicatePair: (pairId) => get().resolvedDuplicatePairIds.includes(pairId),

  clearResolvedDuplicates: () => set(() => {
    saveResolvedDuplicates([]);
    return { resolvedDuplicatePairIds: [] };
  }),

  // --- Computed helpers ---
  getAllLocations: () => get().documents.flatMap(doc => doc.locations),

  /** Lazily rebuild the annotated flat array only when _docVersion changes */
  _getAnnotated: (): AnnotatedLocation[] => {
    const state = get();
    if (state._cachedDocVersion === state._docVersion) return state._cachedAnnotated;

    const annotated: AnnotatedLocation[] = [];
    state.documents.forEach(doc => {
      doc.locations.forEach(loc => {
        (loc as AnnotatedLocation)._docId = doc.id;
        (loc as AnnotatedLocation)._docUserId = doc.userId;
        (loc as AnnotatedLocation)._curatorId = doc.curatorId;
        annotated.push(loc as AnnotatedLocation);
      });
    });

    // Mutate cache in-place to avoid triggering a re-render
    (state as any)._cachedAnnotated = annotated;
    (state as any)._cachedDocVersion = state._docVersion;
    return annotated;
  },

  getFilteredLocations: () => {
    const state = get();
    const currentUserId = state.currentUserId;
    const {
      ownershipFilter, filterByUserId, filterByCuratorId,
      hiddenCuratorIds, hiddenFollowedUserIds,
    } = state.filters;

    // Use cached annotated array (rebuilt only when docs change)
    let source = (state as any)._getAnnotated() as AnnotatedLocation[];

    // --- Early document-level pruning ---
    // When only showing own points, skip all non-own documents entirely
    if (!filterByUserId && !filterByCuratorId && ownershipFilter === 'mine' && currentUserId) {
      source = source.filter(loc => loc._docUserId === currentUserId);
    }

    return source.filter(loc => {
      const {
        continent, country, region, zone,
        comarca, localidad, sublocalidad,
        classificationCode,
        searchTerm, placeType, tag, onlyEnriched, verified, semanticResultIds,
        enrichmentStatus,
        visitedFilter,
      } = state.filters;

      // --- Step 1: Determine point ownership ---
      const isOwnPoint = currentUserId ? loc._docUserId === currentUserId : false;
      const isCuratorPoint = !!loc._curatorId;
      const isFollowedPoint = !isOwnPoint && !isCuratorPoint && !!loc._docUserId;

      // --- Step 2: Explicit user/curator filter (overrides everything) ---
      if (filterByCuratorId) {
        if ((loc as any)._curatorId !== filterByCuratorId) return false;
      } else if (filterByUserId) {
        // When filtering by a specific user, show ONLY their points (ignore hidden list)
        if (loc._docUserId !== filterByUserId) return false;
      } else {
        // --- Step 3: Visibility toggles (only when no explicit filter) ---
        
        // Hide curator points by curator ID
        if (hiddenCuratorIds && hiddenCuratorIds.length > 0 && isCuratorPoint) {
          if (hiddenCuratorIds.includes((loc as any)._curatorId)) return false;
        }

        // Hide followed users' points (never hides own points)
        if (hiddenFollowedUserIds && hiddenFollowedUserIds.length > 0 && isFollowedPoint) {
          if (hiddenFollowedUserIds.includes(loc._docUserId!)) return false;
        }

        // Ownership filter (mine/followed/all)
        if (ownershipFilter && ownershipFilter !== 'all' && currentUserId) {
          if (ownershipFilter === 'mine' && !isOwnPoint) return false;
          if (ownershipFilter === 'followed' && isOwnPoint) return false;
        }
      }

      if (visitedFilter && visitedFilter !== 'all') {
        const visitedValue = loc.customData?.visited;
        const isVisited = visitedValue === 'true' || String(visitedValue) === 'true';
        if (visitedFilter === 'visited' && !isVisited) return false;
        if (visitedFilter === 'pending' && isVisited) return false;
      }

      if (enrichmentStatus) {
        if (getLocationEnrichmentStatus(loc) !== enrichmentStatus) return false;
      }

      if (semanticResultIds && semanticResultIds.length > 0) {
        if (!semanticResultIds.includes(loc.id)) return false;
      }

      if (continent === '__unclassified__') {
        if (loc.continent && loc.country) return false;
      } else {
        if (continent && loc.continent !== continent) return false;
        if (country && loc.country !== country) return false;
        if (region && loc.region !== region) return false;
        if (zone && loc.zone !== zone) return false;
      }

      const gd = loc.enrichedData?.datos_geograficos;
      if (comarca && gd?.admin_nivel_3 !== comarca) return false;
      if (localidad && gd?.localidad !== localidad) return false;
      if (sublocalidad && gd?.sublocalidad !== sublocalidad) return false;

      if (classificationCode) {
        const locCode = loc.enrichedData?.clasificacion?.codigo;
        if (classificationCode === '__unclassified__') {
          if (!loc.enrichedData || locCode) return false;
        } else {
          if (!locCode || !locCode.startsWith(classificationCode)) return false;
        }
      }

      if (placeType && loc.placeType !== placeType) return false;
      if (onlyEnriched && !loc.enrichedData) return false;
      if (verified !== undefined && loc.enrichedData?.verified !== verified) return false;

      const activeTags = tag ? [tag] : (state.filters.tags || []);
      if (activeTags.length > 0) {
        if (!loc.enrichedData?.etiquetas) return false;
        const locTags = loc.enrichedData.etiquetas.map(t => t.toLowerCase().replace('#', ''));
        const hasAllTags = activeTags.every(filterTag =>
          locTags.some(locTag => locTag === filterTag.toLowerCase().replace('#', ''))
        );
        if (!hasAllTags) return false;
      }

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
    const allLocations = get().documents.flatMap(doc => doc.locations);
    const values = new Set<string>();
    allLocations.forEach(loc => {
      const value = loc[field];
      if (typeof value === 'string' && value) values.add(value);
    });
    return Array.from(values).sort();
  },

  getUniqueTags: () => {
    const allLocations = get().documents.flatMap(doc => doc.locations);
    const tags = new Set<string>();
    allLocations.forEach(loc => {
      loc.enrichedData?.etiquetas?.forEach(tag => {
        const cleanTag = tag.replace('#', '').toLowerCase();
        if (cleanTag) tags.add(cleanTag);
      });
    });
    return Array.from(tags).sort();
  },

  getEnrichedStats: () => {
    const allLocations = get().documents.flatMap(doc => doc.locations);
    if (allLocations.length === 0) return {
      total: 0, enriched: 0, verified: 0, outdated: 0,
      byCriteria: { current: 0, previous: 0, unknown: 0, new: 0 }
    };

    const total = allLocations.length;
    const enriched = allLocations.filter(l => l.enrichedData).length;
    const verified = allLocations.filter(l => l.enrichedData?.verified).length;
    let current = 0, previous = 0, unknown = 0, newCount = 0;

    allLocations.forEach(loc => {
      if (loc.enrichedData?.descripcion) {
        meetsCriteria(loc) ? current++ : previous++;
      } else if (loc.description && loc.description.trim().length > 0) {
        unknown++;
      } else {
        newCount++;
      }
    });

    return {
      total, enriched, verified, outdated: previous,
      byCriteria: { current, previous, unknown, new: newCount }
    };
  },

  getLocationsByCriteria: (criteria) => {
    const allLocations = get().documents.flatMap(doc => doc.locations);
    return allLocations.filter(loc => {
      if (criteria === 'current') return loc.enrichedData?.descripcion && meetsCriteria(loc);
      if (criteria === 'previous') return loc.enrichedData?.descripcion && !meetsCriteria(loc);
      if (criteria === 'unknown') return !loc.enrichedData?.descripcion && loc.description && loc.description.trim().length > 0;
      return !loc.enrichedData?.descripcion && (!loc.description || loc.description.trim().length === 0);
    });
  },

  getLocationOwnership: (locationId, currentUserId) => {
    const state = get();
    for (const doc of state.documents) {
      if (doc.locations.some(loc => loc.id === locationId)) {
        const isOwn = !!(currentUserId && doc.userId === currentUserId);
        return {
          isOwn,
          ownerName: isOwn ? undefined : doc.ownerName,
          ownerId: doc.userId,
          curatorId: doc.curatorId,
          curatorIcon: doc.curatorIcon,
          curatorColor: doc.curatorColor,
          curatorAvatar: doc.curatorAvatar,
        };
      }
    }
    return { isOwn: true };
  },

  updateCuratorInfo: (curatorId, updates) => set((state) => ({
    documents: state.documents.map(doc => {
      if (doc.curatorId === curatorId) {
        return {
          ...doc,
          curatorIcon: updates.icon !== undefined ? updates.icon : doc.curatorIcon,
          curatorColor: updates.color !== undefined ? updates.color : doc.curatorColor,
          curatorAvatar: updates.avatar !== undefined ? updates.avatar : doc.curatorAvatar,
        };
      }
      return doc;
    }),
  })),
}));
