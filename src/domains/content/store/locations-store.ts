// Domain: Content — main Zustand store for locations and documents
import { create } from 'zustand';
import { GeoLocation, KMLDocument, FilterCriteria, EnrichmentStatusFilter, OwnershipFilter, VisitedFilter } from '@/types/location';
import { deleteAllUserDocuments, deleteDocumentFromDatabase } from '@/domains/content/lib/db-operations';
import { toast } from 'sonner';
import { DuplicateMatch } from '@/lib/duplicate-detection';
import { loadPendingDuplicates, savePendingDuplicates, loadResolvedDuplicates, saveResolvedDuplicates } from './duplicates-helpers';
import { meetsCriteria, getLocationEnrichmentStatus } from './enrichment-helpers';
import { isLocationVisibleInGlobalMap, type DocumentLifecycleStatus } from '@/domains/content/lib/document-visibility';
import { compareLocationsHierarchical } from '@/shared/geography/hierarchy';
import { getEffectivePlaceType } from '@/domains/content/lib/effective-place-type';

function getPersistentFilters(filters: FilterCriteria): FilterCriteria {
  return {
    ownershipFilter: filters.ownershipFilter,
    hiddenFollowedUserIds: filters.hiddenFollowedUserIds,
  };
}

// Re-export for consumers that import from the store file
export { getLocationEnrichmentStatus } from './enrichment-helpers';

/** A location annotated with its document-level ownership metadata */
export interface AnnotatedLocation extends GeoLocation {
  _docId: string;
  _docUserId?: string;
  /** Explicit layer assignment — set when filterByDocumentId is active */
  _layerType?: import('@/hooks/use-layer-visibility').LayerType;
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

  /** Set of location IDs referenced by any of the user's route_waypoints.
   *  Workspace points belonging to a document are kept visible in the global
   *  map ONLY if their id is in this set. Refreshed via `setLinkedLocationIds`
   *  when routes change. See mem://logic/map/workspace-document-scoped-visibility */
  linkedLocationIds: Set<string>;
  setLinkedLocationIds: (ids: Set<string>) => void;

  // Cached flat array — rebuilt only when documents change
  _cachedAnnotated: AnnotatedLocation[];
  _cachedDocVersion: number;
  _docVersion: number;

  // Actions
  addDocument: (doc: KMLDocument) => void;
  removeDocument: (id: string) => Promise<void>;
  clearAllDocuments: () => Promise<void>;
  _resetStoreState: () => void;

  updateLocation: (locationId: string, updates: Partial<GeoLocation>) => void;
  updateDocumentLocations: (docId: string, locations: GeoLocation[]) => void;

  toggleLocationSelection: (id: string) => void;
  selectAllLocations: () => void;
  clearSelection: () => void;
  selectByFilter: (filter: FilterCriteria) => void;
  addLocationsToSelection: (ids: string[]) => void;
  removeLocationsFromSelection: (ids: string[]) => void;

  setFocusedLocation: (id: string | null) => void;
  setFilters: (filters: FilterCriteria) => void;
  /** Navega por miga/jerarquía geo. Limpia la selección manual (modos mutuamente excluyentes). */
  navigateToGeoNode: (filters: FilterCriteria) => void;
  /** Alterna selección manual de un branch geo. Limpia migas geo (selección transversal). */
  toggleGeoBranchSelection: (ids: string[], checked: boolean) => void;
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
  _getAnnotated: () => AnnotatedLocation[];
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
    docStatus?: string;
  };
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
  linkedLocationIds: new Set<string>(),
  _cachedAnnotated: [],
  _cachedDocVersion: -1,
  _docVersion: 0,

  setLinkedLocationIds: (ids) => set((state) => ({
    linkedLocationIds: ids,
    // Bump version so memoized selectors (useMapData / useFilteredLocations) recompute
    _docVersion: state._docVersion + 1,
  })),

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

  addDocument: (doc) => set((state) => {
    // Prevent duplicate document IDs (upsert: replace if exists)
    const existing = state.documents.findIndex(d => d.id === doc.id);
    const documents = existing >= 0
      ? state.documents.map((d, i) => i === existing ? doc : d)
      : [...state.documents, doc];
    return { documents, _docVersion: state._docVersion + 1 };
  }),

  removeDocument: async (id) => {
    // Persist the deletion in the backend.
    // Imported points (locations) are preserved as manual user points
    // because the FK is ON DELETE SET NULL. The raw file and document_tracks
    // are removed (cascade + storage cleanup inside deleteDocumentFromDatabase).
    const success = await deleteDocumentFromDatabase(id);
    if (!success) return;

    set((state) => {
      // Detach locations from the deleted document so they remain visible
      // in the global map as manual workspace/catalog points.
      const updatedDocuments = state.documents
        .filter(d => d.id !== id)
        .map(d => d);
      // Note: we do NOT need to keep the deleted doc's locations in the local
      // store — they live in the DB and will be loaded by the realtime hook
      // / next reload via loadAllLocationsFromDatabase as orphan locations.
      return {
        documents: updatedDocuments,
        selectedLocations: new Set(),
        filters: getPersistentFilters(state.filters),
        _docVersion: state._docVersion + 1,
      };
    });

    toast.success('Documento eliminado. Los puntos importados se conservan.');
    // Notify other parts of the app (map, realtime) to refresh.
    window.dispatchEvent(new CustomEvent('document:deleted', { detail: { id } }));
  },

  _resetStoreState: () => set((state) => ({
    documents: [],
    selectedLocations: new Set(),
    focusedLocationId: null,
    filters: getPersistentFilters(state.filters),
    _docVersion: state._docVersion + 1,
  })),

  clearAllDocuments: async () => {
    const success = await deleteAllUserDocuments();
    if (!success) return;
    set((state) => ({
      documents: [],
      selectedLocations: new Set(),
      focusedLocationId: null,
      filters: getPersistentFilters(state.filters),
      _docVersion: state._docVersion + 1,
    }));
    toast.success('Todos los documentos han sido eliminados');
  },

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

  addLocationsToSelection: (ids) => set((state) => {
    const next = new Set(state.selectedLocations);
    ids.forEach(id => next.add(id));
    return { selectedLocations: next };
  }),

  removeLocationsFromSelection: (ids) => set((state) => {
    const next = new Set(state.selectedLocations);
    ids.forEach(id => next.delete(id));
    return { selectedLocations: next };
  }),

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
  setFilters: (filters) => set((state) => ({
    filters: {
      ...getPersistentFilters(state.filters),
      ...filters,
    },
  })),

  navigateToGeoNode: (filters) => set((state) => ({
    filters: {
      ...getPersistentFilters(state.filters),
      ...filters,
    },
    // Migas y selección manual son modos mutuamente excluyentes.
    selectedLocations: new Set<string>(),
  })),

  toggleGeoBranchSelection: (ids, checked) => set((state) => {
    const next = new Set(state.selectedLocations);
    if (checked) ids.forEach(id => next.add(id));
    else ids.forEach(id => next.delete(id));
    // Selección manual es transversal: limpiamos migas geo.
    const f = state.filters;
    const hasGeo = f.continent || f.country || f.region || f.zone ||
      (f as any).comarca || (f as any).localidad || (f as any).sublocalidad || (f as any).street;
    const newFilters = hasGeo ? {
      ...f,
      continent: undefined, country: undefined, region: undefined, zone: undefined,
      comarca: undefined, localidad: undefined, sublocalidad: undefined, street: undefined,
    } as FilterCriteria : f;
    return { selectedLocations: next, filters: newFilters };
  }),
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

    // Kill switch: if all points are hidden via layer visibility, return nothing
    if (state.filters.allPointsHidden) return [];

    const currentUserId = state.currentUserId;
    const {
      ownershipFilter, filterByUserId,
      hiddenFollowedUserIds,
      filterByDocumentId, hiddenDocumentIds,
    } = state.filters;

    // Use cached annotated array (rebuilt only when docs change)
    let source = (state as any)._getAnnotated() as AnnotatedLocation[];


    // --- Document-level filter: show only one document (including unapproved) + catalog matches ---
    if (filterByDocumentId) {
      const matchSet = state.filters.filterByDocumentMatchIds
        ? new Set(state.filters.filterByDocumentMatchIds)
        : null;
      source = source.filter(loc => {
        if (loc._docId === filterByDocumentId) {
          // Points approved (matching catalog) get catalog layer; others get workspace
          loc._layerType = loc.isApproved ? 'catalog' : 'workspace';
          return true;
        }
        if (matchSet && matchSet.has(loc.id)) {
          loc._layerType = 'catalog';
          return true;
        }
        return false;
      });
      return source;
    }

    // --- Workspace/catalog filtering is handled by layer groups (map-layer-groups.ts) ---
    // No longer filter by isApproved here; the layer visibility system controls this

    // --- Document-status-driven global visibility ---
    // (mem://logic/map/workspace-document-scoped-visibility, Option 3)
    // A point is visible in the global map iff:
    //   - it has no parent document (manual point), OR
    //   - its parent document is `published` (Catálogo).
    // Promotion is document-to-document (documents.status = 'published'),
    // not point-to-point (`is_approved` is no longer consulted here).
    // Linked-to-route points stay visible via the ItinErary layer (separate system).
    {
      const docStatusByDocId = new Map<string, DocumentLifecycleStatus | undefined>();
      for (const d of state.documents) {
        docStatusByDocId.set(d.id, d.status as DocumentLifecycleStatus | undefined);
      }
      source = source.filter(loc => isLocationVisibleInGlobalMap(loc, docStatusByDocId));
    }

    if (hiddenDocumentIds && hiddenDocumentIds.length > 0) {
      const hiddenSet = new Set(hiddenDocumentIds);
      source = source.filter(loc => !loc._docId || !hiddenSet.has(loc._docId));
    }

    // --- Early document-level pruning ---
    // When only showing own points, skip all non-own documents entirely
    if (!filterByUserId && ownershipFilter === 'mine' && currentUserId) {
      source = source.filter(loc => loc._docUserId === currentUserId);
    }

    const filtered = source.filter(loc => {
      const {
        continent, country, region, zone,
        comarca, localidad, sublocalidad, street,
        classificationCode,
        searchTerm, placeType, tag, onlyEnriched, verified, semanticResultIds,
        enrichmentStatus,
        visitedFilter,
      } = state.filters;

      // --- Step 1: Determine point ownership ---
      const isOwnPoint = currentUserId ? loc._docUserId === currentUserId : false;
      const isFollowedPoint = !isOwnPoint && !!loc._docUserId;

      // --- Step 2: Explicit user filter (overrides everything) ---
      if (filterByUserId) {
        if (loc._docUserId !== filterByUserId) return false;
      } else {
        // --- Step 3: Visibility toggles (only when no explicit filter) ---

        // Hide followed users' points (never hides own points)
        if (hiddenFollowedUserIds && hiddenFollowedUserIds.length > 0 && isFollowedPoint) {
          if (hiddenFollowedUserIds.includes(loc._docUserId!)) return false;
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

      // Geo breadcrumb filters (continent/country/region/...) se IGNORAN cuando
      // hay selección manual: la selección es transversal entre países/regiones.
      const hasSelection = state.selectedLocations && state.selectedLocations.size > 0;
      if (!hasSelection) {
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
        if (street && (gd as any)?.calle !== street) return false;
      }

      if (classificationCode) {
        const locCode = loc.enrichedData?.clasificacion?.codigo;
        if (classificationCode === '__unclassified__') {
          if (!loc.enrichedData || locCode) return false;
        } else {
          if (!locCode || !locCode.startsWith(classificationCode)) return false;
        }
      }

      if (placeType && getEffectivePlaceType(loc) !== placeType) return false;
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

    // --- Restrict to user-selected branch (Geography tree checkboxes) ---
    // Si el usuario marca ramas/puntos en "Buscar y Filtrar", el mapa muestra solo esos.
    const sel = state.selectedLocations;
    const restricted = sel && sel.size > 0
      ? filtered.filter(l => sel.has(l.id))
      : filtered;

    // Orden jerárquico geográfico por defecto (helper único). Otros modos
    // se gestionan aquí también vía filters.sortMode (alfabético / fecha).
    const mode = state.filters.sortMode ?? 'hierarchical';
    if (mode === 'hierarchical') {
      restricted.sort(compareLocationsHierarchical);
    } else if (mode === 'alphabetical') {
      restricted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
    } else if (mode === 'date') {
      restricted.sort((a, b) => +b.createdAt - +a.createdAt);
    }
    return restricted;
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
          docStatus: doc.status,
        };
      }
    }
    return { isOwn: true };
  },

}));
