// Domain: Content — main Zustand store for locations and documents
import { create } from 'zustand';
import { GeoLocation, KMLDocument, FilterCriteria, EnrichmentStatusFilter, OwnershipFilter, VisitedFilter } from '@/types/location';
import { deleteAllUserDocuments, deleteDocumentFromDatabase } from '@/domains/content/lib/db-operations';
import { toast } from 'sonner';
import { DuplicateMatch } from '@/lib/duplicate-detection';
import { loadPendingDuplicates, savePendingDuplicates, loadResolvedDuplicates, saveResolvedDuplicates } from './duplicates-helpers';
import { meetsCriteria, getLocationEnrichmentStatus } from './enrichment-helpers';
import { hasRealEnrichment, hasImportedDescription } from '@/domains/content/lib/enrichment-state';
import { isLocationVisibleInGlobalMap } from '@/domains/content/lib/document-visibility';
import { compareLocationsHierarchical } from '@/shared/geography/hierarchy';
import { getEffectivePlaceType } from '@/domains/content/lib/effective-place-type';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import { isShareablePoi } from '@/domains/content/lib/is-shareable-poi';
import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';
import { lookupUsername } from '@/domains/identity/lib/username-registry';
import { applyCatalogSnapshotPure, type ApplySnapshotOpts } from './catalog-snapshot';

function getPersistentFilters(filters: FilterCriteria): FilterCriteria {
  return {
    ownershipFilter: filters.ownershipFilter,
    hiddenFollowedUserIds: filters.hiddenFollowedUserIds,
  };
}

function dedupeLocationsById(locations: GeoLocation[]): GeoLocation[] {
  if (locations.length <= 1) return locations;
  const byId = new Map<string, GeoLocation>();
  locations.forEach((loc) => byId.set(loc.id, loc));
  return Array.from(byId.values());
}

// Re-export for consumers that import from the store file
export { getLocationEnrichmentStatus } from './enrichment-helpers';

/** A location annotated with its document-level ownership metadata */
export interface AnnotatedLocation extends GeoLocation {
  _docId?: string;
  _docUserId?: string;
  /** Explicit layer assignment — set when filterByDocumentId is active */
  _layerType?: import('@/hooks/use-layer-visibility').LayerType;
}

interface LocationsState {
  documents: KMLDocument[];
  detachedVisibleLocations: GeoLocation[];
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
  setDetachedVisibleLocations: (locations: GeoLocation[]) => void;
  /** Delta-merge a fresh catalog snapshot. Preserva referencias de objetos no
   *  cambiados y solo toca documentos dentro del `ownerScope`. Sustituye al
   *  patrón destructivo `_resetStoreState()` + `addDocument(...)` en bucle. */
  applyCatalogSnapshot: (docs: KMLDocument[], opts: ApplySnapshotOpts) => void;
  removeDocument: (id: string, options?: { deleteLocations?: boolean }) => Promise<void>;
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
  /**
   * Universo visible en el mapa global (mismo criterio que `getFilteredLocations`
   * sin aplicar los ejes de exploración/clasificación). Úsalo desde la
   * facetería (TagsTree, GeographyTree, etc.) para que los conteos coincidan
   * con lo que el usuario realmente ve en el mapa y nunca se ofrezcan filtros
   * que devolverían 0.
   */
  getVisibleUniverseLocations: () => GeoLocation[];
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
    viewerUid?: string | null;
    usernameLookup?: (uid: string) => string | null | undefined;
  };
  selectedDocument: KMLDocument | null;
}

export const useLocationsStore = create<LocationsState>((set, get) => ({
  documents: [],
  detachedVisibleLocations: [],
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

  setDetachedVisibleLocations: (locations) => set((state) => ({
    detachedVisibleLocations: dedupeLocationsById(locations),
    _docVersion: state._docVersion + 1,
  })),

  applyCatalogSnapshot: (docs, opts) => set((state) => {
    const { documents, mutated, removedLocationIds } = applyCatalogSnapshotPure(
      state.documents,
      docs,
      opts,
    );
    if (!mutated) return {};
    // Clean selection from ids that no longer exist.
    let selectedLocations = state.selectedLocations;
    if (removedLocationIds.size > 0 && state.selectedLocations.size > 0) {
      const next = new Set(state.selectedLocations);
      let touched = false;
      removedLocationIds.forEach((id) => { if (next.delete(id)) touched = true; });
      if (touched) selectedLocations = next;
    }
    return {
      documents,
      selectedLocations,
      _docVersion: state._docVersion + 1,
    };
  }),

  removeDocument: async (id, options = {}) => {
    const deleteLocations = options.deleteLocations === true;
    // Persist the deletion in the backend.
    // - deleteLocations=false (default): FK ON DELETE SET NULL preserves points as manual.
    // - deleteLocations=true: also wipes locations attached to this document.
    const success = await deleteDocumentFromDatabase(id, { deleteLocations });
    if (!success) return;

    set((state) => {
      const updatedDocuments = state.documents
        .filter(d => d.id !== id)
        .map(d => d);
      return {
        documents: updatedDocuments,
        selectedLocations: new Set(),
        filters: getPersistentFilters(state.filters),
        _docVersion: state._docVersion + 1,
      };
    });

    toast.success(
      deleteLocations
        ? 'Documento y puntos eliminados.'
        : 'Documento eliminado. Los puntos importados se conservan.'
    );
    window.dispatchEvent(new CustomEvent('document:deleted', { detail: { id, deleteLocations } }));
  },

  _resetStoreState: () => set((state) => ({
    documents: [],
    detachedVisibleLocations: [],
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
      detachedVisibleLocations: [],
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
    detachedVisibleLocations: state.detachedVisibleLocations.map((loc) =>
      loc.id === locationId
        ? { ...loc, ...updates, updatedAt: new Date() }
        : loc
    ),
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

  getVisibleUniverseLocations: () => {
    const state = get();
    const annotated = (state as any)._getAnnotated() as AnnotatedLocation[];
    return dedupeLocationsById([
      ...annotated.filter(loc => isLocationVisibleInGlobalMap(loc)),
      ...state.detachedVisibleLocations,
    ]);
  },

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

  getFilteredLocations: () => (get() as any)._computeFiltered({ ignoreSelection: false }),

  /**
   * Universo visible/autorizado tras filtros, SIN aplicar el recorte por
   * `selectedLocations`. Lo consume el contador de FilterBar para que los
   * denominadores T/Tm/Ts no colapsen al tamaño de la selección.
   * Ver docs/audits/selection-counter-ownership-ratios-plan.md.
   */
  getFilteredUniverse: () => (get() as any)._computeFiltered({ ignoreSelection: true }),

  _computeFiltered: ({ ignoreSelection }: { ignoreSelection: boolean }) => {
    const state = get();

    // Kill switch: if all points are hidden via layer visibility, return nothing
    if (state.filters.allPointsHidden) return [];

    const currentUserId = state.currentUserId;
    const {
      ownershipFilter, filterByUserId,
      hiddenFollowedUserIds,
      filterByDocumentId, hiddenDocumentIds,
    } = state.filters;

    // Universo global: locations anotadas por documento + locations visibles
    // desacopladas cuyo documento no está en el store (p. ej. social vía RLS).
    const annotated = (state as any)._getAnnotated() as AnnotatedLocation[];
    const detachedAnnotated = state.detachedVisibleLocations.map((loc) => ({
      ...(loc as AnnotatedLocation),
      _docId: undefined,
      _docUserId: undefined,
    }));
    let source = dedupeLocationsById([
      ...annotated,
      ...detachedAnnotated,
    ]) as AnnotatedLocation[];

    // [TEMP DEBUG] user-filter funnel — quitar tras diagnosticar
    if (filterByUserId) {
      const uid = filterByUserId;
      const docsTotal = state.documents.length;
      const docsOfUid = state.documents.filter(d => d.userId === uid);
      const docsOfUidIds = new Set(docsOfUid.map(d => d.id));
      const annTotal = source.length;
      const annViaOwner = source.filter(l => l.ownerUserId === uid).length;
      const annViaDoc = source.filter(l => !l.ownerUserId && l._docUserId === uid).length;
      const annInUidDocs = source.filter(l => l._docId ? docsOfUidIds.has(l._docId) : false).length;
      const annDocumentIdHit = source.filter(l => l.documentId && docsOfUidIds.has(l.documentId)).length;
      const ofUid = source.filter(l => getLocationOwnerUserId(l) === uid);
      const passVis = ofUid.filter(l => isLocationVisibleInGlobalMap(l)).length;
      const passShare = ofUid.filter(l => {
        const isOwn = getLocationOwnerUserId(l) === currentUserId;
        return isOwn || isShareablePoi(l);
      }).length;

      // Pre-grouping snapshot from useDatabaseSync (transversal: any uid)
      const snap = (typeof window !== 'undefined' ? (window as any).__dbSyncSnapshot__ : null) as
        | { docs: Array<{ id: string; user_id: string | null }>; locs: Array<{ id: string; document_id: string | null; owner_user_id: string | null }> }
        | null;
      let dbLocs_total = -1, dbLocs_owner_uid = -1, dbLocs_in_uid_docs = -1, dbDocs_of_uid = -1;
      let uidDocIdsFromSnap = new Set<string>();
      if (snap) {
        uidDocIdsFromSnap = new Set(snap.docs.filter(d => d.user_id === uid).map(d => d.id));
        dbDocs_of_uid = uidDocIdsFromSnap.size;
        dbLocs_total = snap.locs.length;
        dbLocs_owner_uid = snap.locs.filter(l => l.owner_user_id === uid).length;
        dbLocs_in_uid_docs = snap.locs.filter(l => l.document_id && uidDocIdsFromSnap.has(l.document_id)).length;
      }

      // eslint-disable-next-line no-console
      console.groupCollapsed(`[user-filter funnel] uid=${uid.slice(0,8)}…`);
      // eslint-disable-next-line no-console
      console.table({
        // BD → cliente (antes de agrupar por documento)
        dbLocs_total,
        dbDocs_of_uid,
        dbLocs_owner_uid,
        dbLocs_in_uid_docs,
        detached_visible_total: state.detachedVisibleLocations.length,
        // Store (después de buildDoc + applyCatalogSnapshot)
        documents_total: docsTotal,
        documents_of_uid: docsOfUid.length,
        documents_of_uid_locs: docsOfUid.reduce((acc, d) => acc + d.locations.length, 0),
        // Annotated (lo que ve el matcher)
        annotated_total: annTotal,
        annotated_in_uid_docs: annInUidDocs,
        annotated_documentId_hit: annDocumentIdHit,
        annotated_of_uid_via_owner: annViaOwner,
        annotated_of_uid_via_doc: annViaDoc,
        annotated_of_uid_total: ofUid.length,
        passed_visibility_global: passVis,
        passed_shareable_boundary: passShare,
        currentUserId,
      });
      if (docsOfUid.length > 0) {
        // eslint-disable-next-line no-console
        console.log('[user-filter funnel] uid docs in store:', docsOfUid.map(d => ({
          id: d.id, name: d.name, locations_length: d.locations.length,
        })));
      }
      if (snap && dbLocs_in_uid_docs > 0) {
        const sampleIds = snap.locs
          .filter(l => l.document_id && uidDocIdsFromSnap.has(l.document_id))
          .slice(0, 5)
          .map(l => l.id);
        // eslint-disable-next-line no-console
        console.log('[user-filter funnel] sample db loc ids in uid docs:', sampleIds);
      }
      if (ofUid.length > 0) {
        // eslint-disable-next-line no-console
        console.log('[user-filter funnel] sample uid POIs in annotated:', ofUid.slice(0, 5).map(l => ({
          id: l.id, name: l.name, ownerUserId: l.ownerUserId,
          _docId: l._docId, _docUserId: l._docUserId,
          visibility: l.visibility, isApproved: l.isApproved, geoHealth: l.geoHealth,
        })));
      }
      // eslint-disable-next-line no-console
      console.groupEnd();
    }


    // --- Document-level source: one document (including unapproved) + optional catalog matches ---
    // Importante: NO hacemos early return aquí. La vista de documento debe
    // seguir pasando por el matcher transversal (`matchesLocationFilters`)
    // para respetar geo/clasificación/búsqueda igual que el resto de la app.
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
    } else {
      // --- Workspace/catalog filtering is handled by layer groups (map-layer-groups.ts) ---
      // No longer filter by isApproved here; the layer visibility system controls this

      // --- Global visibility ---
      // RLS already filters at fetch time. `documents.status` and `is_approved`
      // are editorial metadata and do NOT gate visibility anymore.
      // (mem://logic/map/visibility-rule-rls-only)
      source = source.filter(loc => isLocationVisibleInGlobalMap(loc));
    }

    if (hiddenDocumentIds && hiddenDocumentIds.length > 0) {
      const hiddenSet = new Set(hiddenDocumentIds);
        source = source.filter(loc => !loc._docId || !hiddenSet.has(loc._docId));
    }

    // --- Curated sharing boundary (PR-1) ---
    // Followed POIs only enter the universe if they are shareable
    // (enriched + geo_health=ok + visibility ≠ private + not deleted).
    // Applied BEFORE viewport culling / clustering so counts and clusters
    // never include non-shareable followed content. Own POIs always pass.
    // Ver `mem://logic/sharing/curated-only-rule`.
    if (currentUserId) {
      source = source.filter(loc => {
        const ownerId = getLocationOwnerUserId(loc);
        const isOwn = ownerId === currentUserId;
        return isOwn || isShareablePoi(loc);
      });
    }

    // --- Early document-level pruning ---
    // When only showing own points, skip all non-own documents entirely
    if (!filterByUserId && ownershipFilter === 'mine' && currentUserId) {
      source = source.filter(loc => getLocationOwnerUserId(loc) === currentUserId);
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

      // --- Step 1: Determine point ownership (canonical resolver) ---
      const ownerId = getLocationOwnerUserId(loc);
      const isOwnPoint = currentUserId ? ownerId === currentUserId : false;
      const isFollowedPoint = !isOwnPoint && !!ownerId;

      // --- Step 2: Explicit user filter (overrides everything) ---
      if (filterByUserId) {
        if (ownerId !== filterByUserId) return false;
      } else {
        // --- Step 3: Visibility toggles (only when no explicit filter) ---

        // Hide followed users' points (never hides own points)
        if (hiddenFollowedUserIds && hiddenFollowedUserIds.length > 0 && isFollowedPoint) {
          if (hiddenFollowedUserIds.includes(ownerId!)) return false;
        }

        // Hide followed users' points (never hides own points)
        if (hiddenFollowedUserIds && hiddenFollowedUserIds.length > 0 && isFollowedPoint) {
          if (hiddenFollowedUserIds.includes(ownerId!)) return false;
        }

        // Ownership filter (mine/followed/all)
        if (ownershipFilter && ownershipFilter !== 'all' && currentUserId) {
          if (ownershipFilter === 'mine' && !isOwnPoint) return false;
          if (ownershipFilter === 'followed' && isOwnPoint) return false;
        }
      }

      // Geo breadcrumb filters (continent/country/region/...) se IGNORAN cuando
      // hay selección manual: la selección es transversal entre países/regiones.
      const hasSelection = !ignoreSelection && state.selectedLocations && state.selectedLocations.size > 0;
      if (!matchesLocationFilters(loc, state.filters, {
        includeGeo: !hasSelection,
      })) return false;

      return true;
    }) as GeoLocation[];

    // --- Restrict to user-selected branch (Geography tree checkboxes) ---
    // Si el usuario marca ramas/puntos en "Buscar y Filtrar", el mapa muestra solo esos.
    const sel = ignoreSelection ? null : state.selectedLocations;
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
    const enriched = allLocations.filter(l => hasRealEnrichment(l)).length;
    const verified = allLocations.filter(l => l.enrichedData?.verified).length;
    let current = 0, previous = 0, unknown = 0, newCount = 0;

    allLocations.forEach(loc => {
      if (hasRealEnrichment(loc)) {
        meetsCriteria(loc) ? current++ : previous++;
      } else if (hasImportedDescription(loc)) {
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
      if (criteria === 'current') return hasRealEnrichment(loc) && meetsCriteria(loc);
      if (criteria === 'previous') return hasRealEnrichment(loc) && !meetsCriteria(loc);
      if (criteria === 'unknown') return !hasRealEnrichment(loc) && hasImportedDescription(loc);
      return !hasRealEnrichment(loc) && !hasImportedDescription(loc);
    });
  },

  getLocationOwnership: (locationId, currentUserId) => {
    const state = get();
    const viewerUid = currentUserId ?? state.currentUserId ?? null;
    // PR-POI-SOURCE-6: lookup centralizado de username (registro alimentado
    // por useAuth + UsersSidebar). Helper único — no duplicar.
    const usernameLookup = (uid: string) => lookupUsername(uid);
    for (const doc of state.documents) {
      if (doc.locations.some(loc => loc.id === locationId)) {
        const isOwn = !!(viewerUid && doc.userId === viewerUid);
        return {
          isOwn,
          ownerName: isOwn ? undefined : doc.ownerName,
          ownerId: doc.userId,
          docStatus: doc.status,
          viewerUid,
          usernameLookup,
        };
      }
    }
    return { isOwn: true, viewerUid, usernameLookup };
  },

}));

// ── Global listener: cualquier cambio de visibilidad de colecciones fuerza
// recálculo de getFilteredLocations. Centralizado aquí para no depender de
// que Index.tsx (u otro consumer) esté montado y escuchando.
if (typeof window !== 'undefined') {
  const bump = () => {
    const s: any = useLocationsStore;
    s.setState({ _docVersion: (s.getState()._docVersion || 0) + 1 });
  };
  window.addEventListener('collection-visibility-changed', bump);
  window.addEventListener('orphan-points-changed', bump);
}

