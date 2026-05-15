# Ownership Resolution — Exhaustive Inventory

_Generated: 2026-05-15  •  Scope: `src/`  •  Doc-only_

## 1. Methodology

```
rg -n 'userId|ownerId|_docUserId|created_by|currentUserId|isOwn|ownershipFilter|filterByUserId|getLocationOwnerUserId' src/
```
Filtrado a tokens canónicos relacionados con ownership/identidad. Una fila por ocurrencia.

Total: **357 ocurrencias** sobre 47 archivos.

Helper canónico: `getLocationOwnerUserId(loc)` → `ownerUserId ?? _docUserId` (`src/domains/content/lib/location-owner.ts`).

## 2. Productores — quién escribe `ownerUserId` / `_docUserId`

Total productores/consumidores combinados: 26.

| # | File:Line | Fields | Snippet |
|---|---|---|---|
| 1 | `src/test/poi-source.test.ts:46` | _docUserId,ownerUserId | `it('followed: cae al fallback _docUserId cuando no hay ownerUserId', () => {` |
| 2 | `src/test/poi-source.test.ts:47` | _docUserId | `const r = resolvePoiSource(VIEWER, poi({ _docUserId: OTHER }));` |
| 3 | `src/test/poi-source.test.ts:161` | ownerUserId,isOwn | `expect(isOwnPoi(VIEWER, poi({ ownerUserId: VIEWER }))).toBe(true);` |
| 4 | `src/test/poi-source.test.ts:162` | ownerUserId,isOwn | `expect(isOwnPoi(VIEWER, poi({ ownerUserId: OTHER }))).toBe(false);` |
| 5 | `src/test/poi-source.test.ts:163` | ownerUserId,isOwn | `expect(isOwnPoi(VIEWER, poi({ sourceKind: 'app', ownerUserId: VIEWER }))).toBe(false);` |
| 6 | `src/components/LocationMap.tsx:2124` | _docUserId,ownerUserId | `const ownerUid = (location as any).ownerUserId ?? (location as any)._docUserId ?? null;` |
| 7 | `src/domains/content/store/locations-store.ts:39` | _docUserId | `_docUserId?: string;` |
| 8 | `src/domains/content/store/locations-store.ts:412` | _docUserId | `(loc as AnnotatedLocation)._docUserId = doc.userId;` |
| 9 | `src/domains/content/store/locations-store.ts:442` | _docUserId | `_docUserId: undefined,` |
| 10 | `src/domains/content/store/locations-store.ts:457` | _docUserId,ownerUserId | `const annViaDoc = source.filter(l => !l.ownerUserId && l._docUserId === uid).length;` |
| 11 | `src/domains/content/store/locations-store.ts:524` | _docUserId | `_docId: l._docId, _docUserId: l._docUserId,` |
| 12 | `src/domains/content/lib/visibility-debug.ts:79` | _docUserId | `!loc._docUserId ? 'manual/sin doc' :` |
| 13 | `src/domains/content/lib/visibility-debug.ts:80` | _docUserId,currentUserId | `loc._docUserId === currentUserId ? 'own' : `followed (${loc._docUserId.slice(0, 8)})`;` |
| 14 | `src/domains/content/lib/visibility-debug.ts:147` | _docUserId | `_docUserId: loc._docUserId,` |
| 15 | `src/components/UsersSidebar.tsx:374` | _docUserId,ownerUserId,getLocationOwnerUserId | `const ownerId = getLocationOwnerUserId(l as { ownerUserId?: string \| null; _docUserId?: string \| n` |
| 16 | `src/domains/content/components/PointContextActions.tsx:314` | ownerUserId,isOwn | `const isOwn = ownerUserId === userId;` |
| 17 | `src/domains/content/lib/point-health-rings.ts:140` | ownerUserId,currentUserId | `*  - Sólo POIs cuyo `ownerUserId === currentUserId`. Los seguidos siguen` |
| 18 | `src/components/map/map-icons.ts:230` | _docUserId,ownerUserId,getLocationOwnerUserId | `? getLocationOwnerUserId(location as { ownerUserId?: string \| null; _docUserId?: string \| null })` |
| 19 | `src/domains/content/lib/location-filtering.ts:68` | _docUserId,ownerUserId,getLocationOwnerUserId | `return getLocationOwnerUserId(loc as { ownerUserId?: string \| null; _docUserId?: string \| null }) ` |
| 20 | `src/domains/content/lib/location-filtering.ts:143` | _docUserId,ownerUserId,getLocationOwnerUserId | `getLocationOwnerUserId(loc as { ownerUserId?: string \| null; _docUserId?: string \| null }) !==` |
| 21 | `src/domains/content/lib/location-bucket.ts:27` | _docUserId | `_docUserId?: string \| null;` |
| 22 | `src/domains/content/lib/location-bucket.ts:52` | ownerUserId,currentUserId | `loc.ownerUserId === currentUserId \|\|` |
| 23 | `src/domains/content/lib/location-bucket.ts:53` | _docUserId,currentUserId | `loc._docUserId === currentUserId` |
| 24 | `src/domains/content/lib/location-owner.ts:8` | _docUserId | `*   - Fallback LEGACY: `loc._docUserId` (anotación derivada del documento` |
| 25 | `src/domains/content/lib/location-owner.ts:20` | _docUserId | `_docUserId?: string \| null;` |
| 26 | `src/domains/content/lib/location-owner.ts:24` | _docUserId,ownerUserId | `return loc.ownerUserId ?? loc._docUserId ?? null;` |

## 3. `currentUserId` — propagación

Total: 128.

| # | File:Line | Snippet |
|---|---|---|
| 1 | `src/test/catalog-snapshot.test.ts:23` | `{ ownerScope: 'mine', currentUserId: 'u1' },` |
| 2 | `src/test/catalog-snapshot.test.ts:34` | `{ ownerScope: 'mine', currentUserId: 'u1' },` |
| 3 | `src/test/catalog-snapshot.test.ts:43` | `prev, next, { ownerScope: 'mine', currentUserId: 'u1' },` |
| 4 | `src/test/catalog-snapshot.test.ts:52` | `prev, [], { ownerScope: 'mine', currentUserId: 'u1' },` |
| 5 | `src/test/catalog-snapshot.test.ts:63` | `{ ownerScope: 'all', currentUserId: 'u1' },` |
| 6 | `src/components/LocationMap.tsx:687` | `const [currentUserId, setCurrentUserId] = useState<string \| null>(null);` |
| 7 | `src/components/LocationMap.tsx:691` | `userId: currentUserId,` |
| 8 | `src/components/LocationMap.tsx:1291` | `return setupNotesUpdatedHandler(markersRef, locationsRef, getLocationOwnership, currentUserId, criteriaTimestamp, canEnr` |
| 9 | `src/components/LocationMap.tsx:1292` | `}, [criteriaTimestamp, getLocationOwnership, currentUserId, canEnrichLocations]);` |
| 10 | `src/components/LocationMap.tsx:1296` | `return setupPhotoUpdatedHandler(markersRef, locationsRef, getLocationOwnership, currentUserId, criteriaTimestamp, canEnr` |
| 11 | `src/components/LocationMap.tsx:1297` | `}, [criteriaTimestamp, getLocationOwnership, currentUserId, canEnrichLocations]);` |
| 12 | `src/components/LocationMap.tsx:1716` | `const ownership = getLocationOwnership(location.id, currentUserId);` |
| 13 | `src/components/LocationMap.tsx:1830` | `const viewerUid = currentUserId ?? null;` |
| 14 | `src/components/LocationMap.tsx:1868` | `const ownership = getLocationOwnership(preservedLocation.id, currentUserId);` |
| 15 | `src/components/LocationMap.tsx:1879` | `currentUserId,` |
| 16 | `src/components/LocationMap.tsx:1905` | `const ownership = getLocationOwnership(location.id, currentUserId);` |
| 17 | `src/components/LocationMap.tsx:1927` | `currentUserId,` |
| 18 | `src/components/LocationMap.tsx:1939` | `}, [getLocationOwnership, currentUserId, criteriaTimestamp, canEnrichLocations, selectedLocations, focusedLocationId, re` |
| 19 | `src/components/LocationMap.tsx:1957` | `const ownership = getLocationOwnership(location.id, currentUserId);` |
| 20 | `src/components/LocationMap.tsx:1983` | `}, [enrichmentKey, selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, getLocationOwnership, c` |
| 21 | `src/components/LocationMap.tsx:2013` | `const ownership = getLocationOwnership(id, currentUserId);` |
| 22 | `src/components/LocationMap.tsx:2024` | `const ownership2 = getLocationOwnership(id, currentUserId);` |
| 23 | `src/components/LocationMap.tsx:2035` | `currentUserId,` |
| 24 | `src/components/LocationMap.tsx:2075` | `const ownership = getLocationOwnership(id, currentUserId);` |
| 25 | `src/components/LocationMap.tsx:2086` | `const ownership3 = getLocationOwnership(id, currentUserId);` |
| 26 | `src/components/LocationMap.tsx:2097` | `currentUserId,` |
| 27 | `src/components/LocationMap.tsx:2108` | `}, [getLocationOwnership, currentUserId, criteriaTimestamp, canEnrichLocations, selectedLocations, focusedLocationId, re` |
| 28 | `src/components/LocationMap.tsx:2126` | `if (currentUserId && ownerUid === currentUserId) return; // propios no usan stroke owner` |
| 29 | `src/components/LocationMap.tsx:2142` | `}, [getLocationOwnership, currentUserId, criteriaTimestamp, selectedLocations, focusedLocationId, recentlyEnrichedIds]);` |
| 30 | `src/components/LocationMap.tsx:2158` | `}, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, currentUserId]);` |
| 31 | `src/components/LocationMap.tsx:2173` | `}, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, currentUserId]);` |
| 32 | `src/components/LocationMap.tsx:2186` | `const ownership = getLocationOwnership(locationId, currentUserId);` |
| 33 | `src/components/LocationMap.tsx:2191` | `currentUserId,` |
| 34 | `src/components/LocationMap.tsx:2212` | `}, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, currentUserId]);` |
| 35 | `src/components/LocationMap.tsx:2230` | `currentUserId,` |
| 36 | `src/components/LocationMap.tsx:2235` | `}, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, currentUserId]);` |
| 37 | `src/components/LocationMap.tsx:2259` | `currentUserId,` |
| 38 | `src/components/LocationMap.tsx:2532` | `}, [locationIds, getLocationOwnership, currentUserId]);` |
| 39 | `src/components/LocationMap.tsx:2615` | `const stats = getBucketStats(source as any, currentUserId);` |
| 40 | `src/test/health-filter-scope.test.ts:127` | `currentUserId: 'me',` |
| 41 | `src/test/health-filter-scope.test.ts:140` | `currentUserId: 'me',` |
| 42 | `src/components/AdminPanel.tsx:106` | `const [currentUserId, setCurrentUserId] = useState<string \| null>(null);` |
| 43 | `src/components/AdminPanel.tsx:179` | `const isSelf = user.id === currentUserId;` |
| 44 | `src/components/AdminPanel.tsx:200` | `const isSelf = userToPurge.id === currentUserId;` |
| 45 | `src/components/AdminPanel.tsx:539` | `{userToPurge?.id === currentUserId && (` |
| 46 | `src/components/discovery/HealthRepairPreviewDialog.tsx:73` | `currentUserId?: string \| null;` |
| 47 | `src/components/toolbar/use-my-catalog-popover-fit.ts:71` | `export function useMyCatalogPopoverFit(currentUserId: string \| null \| undefined): void {` |
| 48 | `src/components/toolbar/use-my-catalog-popover-fit.ts:72` | `const userIdRef = useRef(currentUserId);` |
| 49 | `src/components/toolbar/use-my-catalog-popover-fit.ts:73` | `userIdRef.current = currentUserId;` |
| 50 | `src/components/discovery/HealthFilterActionCTA.tsx:49` | `const currentUserId = user?.id ?? null;` |
| 51 | `src/components/discovery/HealthFilterActionCTA.tsx:63` | `currentUserId,` |
| 52 | `src/components/discovery/HealthFilterActionCTA.tsx:65` | `[filteredLocations, selectedLocationIds, visibleLocationIds, healthFilter, effectiveOnlyVisible, currentUserId],` |
| 53 | `src/components/discovery/HealthFilterActionCTA.tsx:109` | `currentUserId={currentUserId}` |
| 54 | `src/domains/discovery/lib/health-filter-scope.ts:18` | `* `getPointHealthRings(loc, currentUserId)` ya excluye seguidos. Resultado:` |
| 55 | `src/domains/discovery/lib/health-filter-scope.ts:46` | `currentUserId?: string \| null;` |
| 56 | `src/domains/discovery/lib/health-filter-scope.ts:72` | `getPointHealthRings(loc, ctx.currentUserId).includes(hf),` |
| 57 | `src/domains/content/store/locations-store.ts:51` | `currentUserId: string \| null;` |
| 58 | `src/domains/content/store/locations-store.ts:131` | `getLocationOwnership: (locationId: string, currentUserId?: string \| null) => {` |
| 59 | `src/domains/content/store/locations-store.ts:147` | `currentUserId: null,` |
| 60 | `src/domains/content/store/locations-store.ts:355` | `setCurrentUserId: (userId) => set({ currentUserId: userId }),` |
| 61 | `src/domains/content/store/locations-store.ts:429` | `const currentUserId = state.currentUserId;` |
| 62 | `src/domains/content/store/locations-store.ts:504` | `currentUserId,` |
| 63 | `src/domains/content/store/locations-store.ts:575` | `if (currentUserId) {` |
| 64 | `src/domains/content/store/locations-store.ts:717` | `getLocationOwnership: (locationId, currentUserId) => {` |
| 65 | `src/domains/content/store/locations-store.ts:719` | `const viewerUid = currentUserId ?? state.currentUserId ?? null;` |
| 66 | `src/domains/content/lib/visibility-debug.ts:76` | `const currentUserId = user?.id ?? null;` |
| 67 | `src/domains/content/lib/visibility-debug.ts:78` | `!currentUserId ? 'n/a' :` |
| 68 | `src/domains/content/lib/visibility-debug.ts:81` | `log('2. ownership', currentUserId ? true : 'n/a', ownership);` |
| 69 | `src/domains/content/lib/visibility-debug.ts:122` | `currentUserId,` |
| 70 | `src/domains/content/lib/visibility-debug.ts:133` | `currentUserId,` |
| 71 | `src/domains/content/store/catalog-snapshot.ts:14` | `currentUserId: string \| null;` |
| 72 | `src/domains/content/store/catalog-snapshot.ts:42` | `function isInScope(docUserId: string \| undefined, scope: OwnerScope, currentUserId: string \| null): boolean {` |
| 73 | `src/domains/content/store/catalog-snapshot.ts:44` | `const isMine = !!docUserId && !!currentUserId && docUserId === currentUserId;` |
| 74 | `src/domains/content/store/catalog-snapshot.ts:127` | `const { ownerScope, currentUserId } = opts;` |
| 75 | `src/domains/content/store/catalog-snapshot.ts:140` | `const inScope = isInScope(prev.userId, ownerScope, currentUserId);` |
| 76 | `src/domains/content/store/catalog-snapshot.ts:177` | `if (!isInScope(snap.userId, ownerScope, currentUserId)) continue;` |
| 77 | `src/domains/content/lib/point-health-rings.ts:106` | `* `currentUserId` y el POI no pertenece al caller, se devuelve `[]`.` |
| 78 | `src/domains/content/lib/point-health-rings.ts:111` | `* Sin `currentUserId` el helper mantiene comportamiento legacy (devuelve` |
| 79 | `src/domains/content/lib/point-health-rings.ts:116` | `currentUserId?: string \| null,` |
| 80 | `src/domains/content/lib/point-health-rings.ts:120` | `if (currentUserId) {` |
| 81 | `src/domains/content/lib/point-health-rings.ts:122` | `if (owner && owner !== currentUserId) return [];` |
| 82 | `src/domains/content/lib/point-health-rings.ts:148` | `currentUserId: string \| null \| undefined,` |
| 83 | `src/domains/content/lib/point-health-rings.ts:150` | `if (!loc \|\| !currentUserId) return false;` |
| 84 | `src/domains/content/lib/point-health-rings.ts:152` | `if (owner !== currentUserId) return false;` |
| 85 | `src/components/map/map-popup-handlers.ts:350` | `currentUserId: string \| null,` |
| 86 | `src/components/map/map-popup-handlers.ts:366` | `const ownership = getLocationOwnership(locationId, currentUserId);` |
| 87 | `src/components/map/map-popup-handlers.ts:382` | `currentUserId: string \| null,` |
| 88 | `src/components/map/map-popup-handlers.ts:449` | `const ownership = getLocationOwnership(locationId, currentUserId);` |
| 89 | `src/components/map/map-icons.ts:190` | `currentUserId: string \| null = null,` |
| 90 | `src/components/map/map-icons.ts:233` | `? resolveMarkerGrammar(currentUserId, location)` |
| 91 | `src/components/map/map-icons.ts:250` | `currentUserId,` |
| 92 | `src/components/map/map-icons.ts:336` | `const healthRings = skipHealthRings ? [] : getPointHealthRings(location, currentUserId);` |
| 93 | `src/domains/content/hooks/use-filtered-locations.ts:15` | `const currentUserId = useLocationsStore(s => s.currentUserId);` |
| 94 | `src/domains/content/hooks/use-filtered-locations.ts:21` | `}, [docVersion, filters, currentUserId, selectedLocations]);` |
| 95 | `src/domains/content/hooks/use-filtered-locations.ts:36` | `const currentUserId = useLocationsStore(s => s.currentUserId);` |
| 96 | `src/domains/content/hooks/use-filtered-locations.ts:53` | `}, [filtered, docVersion, filters, currentUserId, selectedLocations]);` |
| 97 | `src/domains/content/hooks/use-database-sync.ts:46` | `const currentUserId = currentUser?.id;` |
| 98 | `src/domains/content/hooks/use-database-sync.ts:47` | `if (currentUserId) {` |
| 99 | `src/domains/content/hooks/use-database-sync.ts:48` | `useLocationsStore.getState().setCurrentUserId(currentUserId);` |
| 100 | `src/domains/content/hooks/use-database-sync.ts:65` | `const ownDocs = dbDocs.filter(d => d.user_id === currentUserId);` |
| 101 | `src/domains/content/hooks/use-database-sync.ts:66` | `const otherDocs = dbDocs.filter(d => d.user_id !== currentUserId);` |
| 102 | `src/domains/content/hooks/use-database-sync.ts:150` | `applyCatalogSnapshot(ownKmlDocs, { ownerScope: 'mine', currentUserId: currentUserId ?? null });` |
| 103 | `src/domains/content/hooks/use-database-sync.ts:162` | `applyCatalogSnapshot(otherKmlDocs, { ownerScope: 'social', currentUserId: currentUserId ?? null });` |
| 104 | `src/domains/content/lib/collection-visibility.ts:47` | `let currentUserId: string \| null = null;` |
| 105 | `src/domains/content/lib/collection-visibility.ts:104` | `if (!currentUserId) return;` |
| 106 | `src/domains/content/lib/collection-visibility.ts:106` | `sessionStorage.setItem(storageKey(currentUserId), JSON.stringify(Object.keys(state.visible)));` |
| 107 | `src/domains/content/lib/collection-visibility.ts:115` | `if (initialized && currentUserId === userId) {` |
| 108 | `src/domains/content/lib/collection-visibility.ts:140` | `currentUserId = userId;` |
| 109 | `src/domains/content/lib/collection-visibility.ts:178` | `if (!currentUserId) return;` |
| 110 | `src/domains/content/lib/collection-visibility.ts:184` | `const all = await collectionService.findByUser(currentUserId);` |
| 111 | `src/domains/content/lib/collection-visibility.ts:189` | `await rebuildCatalogMembership(currentUserId);` |
| 112 | `src/domains/content/lib/collection-visibility.ts:203` | `if (!currentUserId) return;` |
| 113 | `src/domains/content/lib/collection-visibility.ts:205` | `const all = await collectionService.findByUser(currentUserId);` |
| 114 | `src/domains/content/lib/collection-visibility.ts:229` | `await rebuildCatalogMembership(currentUserId);` |
| 115 | `src/domains/content/lib/collection-visibility.ts:257` | `if (currentUserId !== userId) return;` |
| 116 | `src/domains/content/lib/collection-visibility.ts:268` | `if (!currentUserId) return;` |
| 117 | `src/domains/content/lib/collection-visibility.ts:269` | `scheduleMembershipRebuild(currentUserId);` |
| 118 | `src/domains/content/lib/collection-visibility.ts:343` | `if (currentUserId) {` |
| 119 | `src/domains/content/lib/collection-visibility.ts:344` | `try { sessionStorage.removeItem(storageKey(currentUserId)); } catch { /* ignore */ }` |
| 120 | `src/domains/content/lib/collection-visibility.ts:349` | `currentUserId = null;` |
| 121 | `src/domains/content/lib/my-catalog-quick-counts.ts:5` | `* Universo = locations con `is_approved=true` cuyo owner = currentUserId` |
| 122 | `src/domains/content/lib/my-catalog-quick-counts.ts:45` | `currentUserId: string \| null \| undefined,` |
| 123 | `src/domains/content/lib/my-catalog-quick-counts.ts:47` | `if (!allLocations \|\| allLocations.length === 0 \|\| !currentUserId) {` |
| 124 | `src/domains/content/lib/location-bucket.ts:48` | `currentUserId?: string \| null,` |
| 125 | `src/domains/content/lib/location-bucket.ts:50` | `if (!currentUserId) return false;` |
| 126 | `src/domains/content/lib/location-bucket.ts:59` | `currentUserId?: string \| null,` |
| 127 | `src/domains/content/lib/location-bucket.ts:69` | `currentUserId?: string \| null,` |
| 128 | `src/domains/content/lib/location-bucket.ts:78` | `stats[getLocationBucket(loc, currentUserId)] += 1;` |

## 4. `filterByUserId` — eje canónico

Total: 40.

| # | File:Line | Snippet |
|---|---|---|
| 1 | `src/types/location.ts:364` | `* `filterByUserId` (alias legacy).` |
| 2 | `src/types/location.ts:377` | `filterByUserId?: string;` |
| 3 | `src/components/LocationMap.tsx:2504` | `// Cuando hay foco explícito sobre un owner (`filterByUserId`),` |
| 4 | `src/components/LocationMap.tsx:2507` | `const bypassZoomGates = !!useLocationsStore.getState().filters.filterByUserId;` |
| 5 | `src/components/LocationMap.tsx:2518` | `let lastFilterUid = useLocationsStore.getState().filters.filterByUserId;` |
| 6 | `src/components/LocationMap.tsx:2520` | `const cur = state.filters.filterByUserId;` |
| 7 | `src/components/LocationMap.tsx:2608` | `// Si hay `filterByUserId` activo, los buckets reflejan el subset filtrado.` |
| 8 | `src/components/LocationMap.tsx:2609` | `const filterByUserIdForStats = useLocationsStore(s => s.filters.filterByUserId);` |
| 9 | `src/components/LocationMap.tsx:2612` | `const source = state.filters.filterByUserId` |
| 10 | `src/components/LocationMap.tsx:2620` | `}, [allLocationsCount, currentUserId, filterByUserIdForStats]);` |
| 11 | `src/components/FloatingToolbar.tsx:414` | `// Si hay `filterByUserId` activo, los buckets se calculan sobre el subset` |
| 12 | `src/components/FloatingToolbar.tsx:418` | `const source = filters.filterByUserId ? filteredLocations : allLocations;` |
| 13 | `src/components/FloatingToolbar.tsx:425` | `}, [allLocations, filteredLocations, filters.filterByUserId, user?.id]);` |
| 14 | `src/components/FloatingToolbar.tsx:635` | `{filters.filterByUserId && filters.filterByUserName && (` |
| 15 | `src/components/FloatingToolbar.tsx:642` | `onClick={() => setFilters({ ...filters, filterByUserId: undefined, filterByUserName: undefined })}` |
| 16 | `src/test/locations-store.test.ts:110` | `it('filterByUserId incluye POIs visibles desacoplados de documentos no cargados', () => {` |
| 17 | `src/test/locations-store.test.ts:127` | `useLocationsStore.getState().setFilters({ filterByUserId: 'alpha' });` |
| 18 | `src/test/poi-filter-source.test.ts:3` | `* Verifica que gana sobre `filterByUserId` (alias legacy) y cubre los` |
| 19 | `src/test/poi-filter-source.test.ts:72` | `it('filterBySource gana sobre filterByUserId (alias legacy)', () => {` |
| 20 | `src/test/poi-filter-source.test.ts:78` | `filterByUserId: A,` |
| 21 | `src/test/poi-filter-source.test.ts:85` | `filterByUserId: B,` |
| 22 | `src/test/poi-filter-source.test.ts:90` | `it('filterByUserId sigue funcionando solo cuando filterBySource ausente', () => {` |
| 23 | `src/test/poi-filter-source.test.ts:92` | `expect(matchesLocationFilters(p, { filterByUserId: A })).toBe(true);` |
| 24 | `src/test/poi-filter-source.test.ts:93` | `expect(matchesLocationFilters(p, { filterByUserId: B })).toBe(false);` |
| 25 | `src/components/toolbar/MyCatalogQuickFilters.tsx:113` | `// filterByUserId, que es lo que el matcher consume). Los ejes propios` |
| 26 | `src/components/poi/SourceFilterBridge.tsx:8` | `*   2. Mantiene el alias legacy `filterByUserId` sincronizado.` |
| 27 | `src/components/poi/SourceFilterBridge.tsx:42` | `filterByUserId: isActive` |
| 28 | `src/domains/content/store/locations-store.ts:431` | `ownershipFilter, filterByUserId,` |
| 29 | `src/domains/content/store/locations-store.ts:450` | `if (filterByUserId) {` |
| 30 | `src/domains/content/store/locations-store.ts:451` | `const uid = filterByUserId;` |
| 31 | `src/domains/content/store/locations-store.ts:585` | `if (!filterByUserId && ownershipFilter === 'mine' && currentUserId) {` |
| 32 | `src/domains/content/store/locations-store.ts:605` | `if (filterByUserId) {` |
| 33 | `src/domains/content/store/locations-store.ts:606` | `if (ownerId !== filterByUserId) return false;` |
| 34 | `src/components/UsersSidebar.tsx:357` | `filterByUserId: user.id,` |
| 35 | `src/components/UsersSidebar.tsx:388` | `// applyLayerVisibility (activado por filterByUserId) garantiza que` |
| 36 | `src/components/UsersSidebar.tsx:402` | `filterByUserId: undefined,` |
| 37 | `src/components/map/map-layer-groups.ts:70` | `* vía `filterByUserId`; queremos ver TODOS sus puntos a cualquier zoom,` |
| 38 | `src/domains/content/lib/location-filtering.ts:137` | `// canónico; `filterByUserId` queda como alias legacy y se ignora si el` |
| 39 | `src/domains/content/lib/location-filtering.ts:141` | `} else if (filters.filterByUserId) {` |
| 40 | `src/domains/content/lib/location-filtering.ts:144` | `filters.filterByUserId` |

## 5. `isOwn*` — variantes booleanas

Total: 107. Variantes encontradas: `isOwn`, `isOwnPoi`, `isOwnPoint`, `isOwnLocation`, `isOwnDoc`, `isOwnedBy`.

| # | File:Line | Fields | Snippet |
|---|---|---|---|
| 1 | `src/domains/v2/legacy-to-feature.mapper.ts:26` | isOwn | `isOwn: boolean;` |
| 2 | `src/domains/v2/legacy-to-feature.mapper.ts:53` | isOwn | `if (!options.isOwn) return 'followed';` |
| 3 | `src/test/poi-source.test.ts:9` | isOwn | `isOwnPoi,` |
| 4 | `src/test/poi-source.test.ts:160` | isOwn | `it('isOwnPoi', () => {` |
| 5 | `src/test/poi-source.test.ts:161` | ownerUserId,isOwn | `expect(isOwnPoi(VIEWER, poi({ ownerUserId: VIEWER }))).toBe(true);` |
| 6 | `src/test/poi-source.test.ts:162` | ownerUserId,isOwn | `expect(isOwnPoi(VIEWER, poi({ ownerUserId: OTHER }))).toBe(false);` |
| 7 | `src/test/poi-source.test.ts:163` | ownerUserId,isOwn | `expect(isOwnPoi(VIEWER, poi({ sourceKind: 'app', ownerUserId: VIEWER }))).toBe(false);` |
| 8 | `src/test/marker-grammar.test.ts:237` | isOwn | `isOwn: true,` |
| 9 | `src/test/marker-grammar.test.ts:291` | isOwn | `isOwn: false,` |
| 10 | `src/components/LocationMap.tsx:1724` | currentUserId,isOwn | `icon: createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, false, getTin` |
| 11 | `src/components/LocationMap.tsx:1725` | isOwn | `pane: ownership.isOwn ? 'mine-pane' : 'others-pane',` |
| 12 | `src/components/LocationMap.tsx:1843` | isOwn | `} else if (ownership.isOwn) {` |
| 13 | `src/components/LocationMap.tsx:1877` | isOwn | `getTintForLocation(preservedLocation.id, ownership.isOwn),` |
| 14 | `src/components/LocationMap.tsx:1878` | isOwn | `ownership.isOwn,` |
| 15 | `src/components/LocationMap.tsx:1925` | isOwn | `getTintForLocation(id, ownership.isOwn),` |
| 16 | `src/components/LocationMap.tsx:1926` | isOwn | `ownership.isOwn,` |
| 17 | `src/components/LocationMap.tsx:1970` | currentUserId,isOwn | `const isOwn = getLocationOwnership(location.id, currentUserId).isOwn;` |
| 18 | `src/components/LocationMap.tsx:1971` | currentUserId,isOwn | `marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRe` |
| 19 | `src/components/LocationMap.tsx:2033` | isOwn | `getTintForLocation(id, ownership2.isOwn),` |
| 20 | `src/components/LocationMap.tsx:2034` | isOwn | `ownership2.isOwn,` |
| 21 | `src/components/LocationMap.tsx:2095` | isOwn | `getTintForLocation(id, ownership3.isOwn),` |
| 22 | `src/components/LocationMap.tsx:2096` | isOwn | `ownership3.isOwn,` |
| 23 | `src/components/LocationMap.tsx:2131` | currentUserId,isOwn | `const isOwn = getLocationOwnership(locationId, currentUserId).isOwn;` |
| 24 | `src/components/LocationMap.tsx:2135` | currentUserId,isOwn | `isRecentlyEnriched, getTintForLocation(locationId, isOwn), isOwn, currentUserId,` |
| 25 | `src/components/LocationMap.tsx:2154` | currentUserId,isOwn | `const isOwn = getLocationOwnership(locationId, currentUserId).isOwn;` |
| 26 | `src/components/LocationMap.tsx:2155` | currentUserId,isOwn | `marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRe` |
| 27 | `src/components/LocationMap.tsx:2168` | currentUserId,isOwn | `const isOwn = getLocationOwnership(locationId, currentUserId).isOwn;` |
| 28 | `src/components/LocationMap.tsx:2169` | currentUserId,isOwn | `marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRe` |
| 29 | `src/components/LocationMap.tsx:2189` | isOwn | `isRecentlyEnriched, getTintForLocation(locationId, ownership.isOwn),` |
| 30 | `src/components/LocationMap.tsx:2190` | isOwn | `ownership.isOwn,` |
| 31 | `src/components/LocationMap.tsx:2228` | currentUserId,isOwn | `isRecentlyEnriched, getTintForLocation(locationId, getLocationOwnership(locationId, currentUserId).i` |
| 32 | `src/components/LocationMap.tsx:2229` | currentUserId,isOwn | `getLocationOwnership(locationId, currentUserId).isOwn,` |
| 33 | `src/components/LocationMap.tsx:2254` | currentUserId,isOwn | `const isOwn = getLocationOwnership(locationId, currentUserId).isOwn;` |
| 34 | `src/components/LocationMap.tsx:2257` | isOwn | `isRecentlyEnriched, getTintForLocation(locationId, isOwn),` |
| 35 | `src/components/LocationMap.tsx:2258` | isOwn | `isOwn,` |
| 36 | `src/components/FloatingToolbar.tsx:492` | isOwn | `return ownership.isOwn;` |
| 37 | `src/components/FloatingToolbar.tsx:555` | isOwn | `if (ownership.isOwn) {` |
| 38 | `src/stores/duplicate-store.ts:69` | isOwn | `getOwnership: (locId: string, userId: string) => { isOwn: boolean },` |
| 39 | `src/stores/duplicate-store.ts:109` | isOwn | `const ownLocations = locations.filter(loc => getOwnership(loc.id, userId).isOwn);` |
| 40 | `src/domains/content/store/locations-store.ts:132` | isOwn | `isOwn: boolean; ownerName?: string; ownerId?: string;` |
| 41 | `src/domains/content/store/locations-store.ts:463` | currentUserId,getLocationOwnerUserId,isOwn | `const isOwn = getLocationOwnerUserId(l) === currentUserId;` |
| 42 | `src/domains/content/store/locations-store.ts:464` | isOwn | `return isOwn \|\| isShareablePoi(l);` |
| 43 | `src/domains/content/store/locations-store.ts:578` | currentUserId,isOwn | `const isOwn = ownerId === currentUserId;` |
| 44 | `src/domains/content/store/locations-store.ts:579` | isOwn | `return isOwn \|\| isShareablePoi(loc);` |
| 45 | `src/domains/content/store/locations-store.ts:601` | currentUserId,isOwn | `const isOwnPoint = currentUserId ? ownerId === currentUserId : false;` |
| 46 | `src/domains/content/store/locations-store.ts:602` | isOwn | `const isFollowedPoint = !isOwnPoint && !!ownerId;` |
| 47 | `src/domains/content/store/locations-store.ts:622` | ownershipFilter,isOwn | `if (ownershipFilter === 'mine' && !isOwnPoint) return false;` |
| 48 | `src/domains/content/store/locations-store.ts:623` | ownershipFilter,isOwn | `if (ownershipFilter === 'followed' && isOwnPoint) return false;` |
| 49 | `src/domains/content/store/locations-store.ts:725` | isOwn | `const isOwn = !!(viewerUid && doc.userId === viewerUid);` |
| 50 | `src/domains/content/store/locations-store.ts:727` | isOwn | `isOwn,` |
| 51 | `src/domains/content/store/locations-store.ts:728` | isOwn | `ownerName: isOwn ? undefined : doc.ownerName,` |
| 52 | `src/domains/content/store/locations-store.ts:736` | isOwn | `return { isOwn: true, viewerUid, usernameLookup };` |
| 53 | `src/components/UsersSidebar.tsx:380` | isOwn | `const isOwn = myUid != null && ownerId === myUid;` |
| 54 | `src/components/UsersSidebar.tsx:381` | isOwn | `return isOwn \|\| isShareablePoi(l);` |
| 55 | `src/domains/content/hooks/use-popup-actions.ts:154` | isOwn | `if (!ownership.isOwn) {` |
| 56 | `src/domains/content/components/PointContextActions.tsx:314` | ownerUserId,isOwn | `const isOwn = ownerUserId === userId;` |
| 57 | `src/domains/content/components/PointContextActions.tsx:318` | isOwn | `distance_m: Math.round(dist), source: isOwn ? 'own' : 'followed',` |
| 58 | `src/domains/content/components/PointContextActions.tsx:319` | isOwn | `source_label: isOwn ? 'Tuyo' : isFollowed ? 'Seguido' : 'Otro',` |
| 59 | `src/components/map/map-v2-renderer.ts:10` | isOwn | `* sintético y para ownership (`isOwn`).` |
| 60 | `src/components/map/map-v2-renderer.ts:50` | isOwn | `const isOwn = feature.ownershipSource === 'own';` |
| 61 | `src/components/map/map-v2-renderer.ts:61` | isOwn | `isOwn,` |
| 62 | `src/domains/content/lib/point-hero-image.ts:12` | isOwn | `*       ownership.isOwn \|\|` |
| 63 | `src/domains/content/lib/point-hero-image.ts:31` | isOwn | `isOwn?: boolean;` |
| 64 | `src/domains/content/lib/point-hero-image.ts:46` | isOwn | `!!ownership?.isOwn \|\|` |
| 65 | `src/components/map/map-popups.ts:209` | isOwn | `isOwn: boolean;` |
| 66 | `src/components/map/map-popups.ts:329` | isOwn | `ownership.isOwn \|\|` |
| 67 | `src/components/map/map-popups.ts:341` | isOwn | `} else if (ownership.isOwn) {` |
| 68 | `src/components/map/map-popups.ts:368` | isOwn | `if (ownership.isOwn) {` |
| 69 | `src/components/map/map-popups.ts:433` | isOwn | `const isOwn = ownership?.isOwn ?? true;` |
| 70 | `src/components/map/map-popups.ts:454` | isOwn | `const registrationDate = isOwn ? formatRegistrationDate(location.createdAt) : '';` |
| 71 | `src/components/map/map-popups.ts:463` | isOwn | `background: ${isOwn ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)' : 'linear-gradient(135deg, #fef3c7` |
| 72 | `src/components/map/map-popups.ts:467` | isOwn | `color: ${isOwn ? '#1e40af' : '#92400e'};` |
| 73 | `src/components/map/map-popups.ts:470` | isOwn | `${isOwn` |
| 74 | `src/components/map/map-popups.ts:475` | isOwn | `${isOwn ? 'Mi punto' : `De ${ownerName \|\| 'seguido'}`}` |
| 75 | `src/components/map/map-popups.ts:477` | isOwn | `${isOwn && registrationDate ? `` |
| 76 | `src/components/map/map-popups.ts:521` | isOwn | `const canEditOwn = isOwn;` |
| 77 | `src/components/map/map-popups.ts:522` | isOwn | `const adminEditWarning = (canEditLocation && !isOwn && !isCuratorPoint) ? `` |
| 78 | `src/components/map/map-popups.ts:533` | isOwn | `${(canEditLocation && !isOwn && !isCuratorPoint) ? adminEditWarning : ''}` |
| 79 | `src/components/map/map-popups.ts:616` | isOwn | `const addToCollectionBtnHtml = (!isOwn && !isCuratorPoint) ? `` |
| 80 | `src/components/map/map-popups.ts:640` | isOwn | `isOwn,` |
| 81 | `src/components/map/map-popups.ts:732` | isOwn | `style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisite` |
| 82 | `src/components/map/map-popups.ts:733` | isOwn | `title="${isVisited ? 'Click para desmarcar' : (!isOwn ? 'Se añadirá a tu colección automáticamente' ` |
| 83 | `src/components/map/map-popups.ts:738` | isOwn | `${isVisited ? 'Visitado' : (!isOwn ? '+ Adoptar y Visitar' : 'Visitado')}` |
| 84 | `src/components/map/map-popups.ts:975` | isOwn | `isOwn,` |
| 85 | `src/components/map/map-popups.ts:1021` | isOwn | `${(!isOwn && !isCuratorPoint) ? `` |
| 86 | `src/components/map/map-popups.ts:1054` | isOwn | `style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisite` |
| 87 | `src/components/map/map-popups.ts:1055` | isOwn | `title="${isVisited ? 'Click para desmarcar' : (!isOwn ? 'Se añadirá a tu colección automáticamente' ` |
| 88 | `src/components/map/map-popups.ts:1060` | isOwn | `${isVisited ? 'Visitado' : (!isOwn ? '+ Adoptar y Visitar' : 'Visitado')}` |
| 89 | `src/components/map/map-popups.ts:1129` | isOwn | `return (isOwn && canEditLocation && isRouteWaypoint);` |
| 90 | `src/components/map/map-icons.ts:184` | isOwn | `isOwn: boolean = false,` |
| 91 | `src/components/map/map-icons.ts:204` | isOwn | `// Ola 2: en `micro`, los puntos propios (`isOwn`) son mayores y con halo` |
| 92 | `src/components/map/map-icons.ts:251` | isOwn | `isOwn,` |
| 93 | `src/components/map/map-icons.ts:257` | isOwn | `// z5 antes de saltar a SVG compact en z6. La pertenencia (`isOwn`)` |
| 94 | `src/components/map/map-icons.ts:264` | isOwn | `const haloStyle = isOwn ? '' : 'opacity:0.85;';` |
| 95 | `src/components/map/map-icons.ts:299` | isOwn | `className: `custom-marker-micro${isOwn ? ' is-own' : ''}`,` |
| 96 | `src/components/map/map-icons.ts:355` | isOwn | `const ownHalo = isOwn && !isMassSelect ? ' drop-shadow(0 0 0 1px rgba(255,255,255,0.9))' : '';` |
| 97 | `src/components/map/map-icons.ts:393` | isOwn | `? getPointHeroImage(location, { isOwn })` |
| 98 | `src/components/map/map-icons.ts:399` | isOwn | `const ownClass = isOwn ? ' is-own' : '';` |
| 99 | `src/domains/content/lib/poi-source.ts:241` | isOwn | `export function isOwnPoi(viewerUid: string \| null, poi: GeoLocation): boolean {` |
| 100 | `src/domains/content/hooks/use-database-sync.ts:115` | isOwn | `const isOwnDoc = userDocIds.has(docId);` |
| 101 | `src/domains/content/hooks/use-database-sync.ts:116` | isOwn | `if (!isOwnDoc && adoptedFromIds.has(loc.id)) return;` |
| 102 | `src/domains/content/lib/collection-visibility.ts:401` | isOwn | `* Ownership guard (PR-1 curated sharing boundary): si se pasa `isOwn=false`` |
| 103 | `src/domains/content/lib/collection-visibility.ts:412` | isOwn | `isOwn?: boolean,` |
| 104 | `src/domains/content/lib/collection-visibility.ts:414` | isOwn | `if (isOwn === false) return null;` |
| 105 | `src/domains/content/lib/location-bucket.ts:46` | isOwn | `export function isOwnLocation(` |
| 106 | `src/domains/content/lib/location-bucket.ts:61` | currentUserId,isOwn | `const own = isOwnLocation(loc, currentUserId);` |
| 107 | `src/domains/content/lib/location-owner.ts:28` | isOwn | `export function isOwnedBy(` |

## 6. `created_by` y `ownershipFilter`

Total: 46.

| # | File:Line | Fields | Snippet |
|---|---|---|---|
| 1 | `src/types/location.ts:358` | ownershipFilter | `ownershipFilter?: OwnershipFilter;` |
| 2 | `src/integrations/supabase/types.ts:839` | created_by | `created_by: string \| null` |
| 3 | `src/integrations/supabase/types.ts:863` | created_by | `created_by?: string \| null` |
| 4 | `src/integrations/supabase/types.ts:887` | created_by | `created_by?: string \| null` |
| 5 | `src/integrations/supabase/types.ts:996` | created_by | `created_by: string \| null` |
| 6 | `src/integrations/supabase/types.ts:1025` | created_by | `created_by?: string \| null` |
| 7 | `src/integrations/supabase/types.ts:1054` | created_by | `created_by?: string \| null` |
| 8 | `src/integrations/supabase/types.ts:1715` | created_by | `created_by: string \| null` |
| 9 | `src/integrations/supabase/types.ts:1732` | created_by | `created_by?: string \| null` |
| 10 | `src/integrations/supabase/types.ts:1749` | created_by | `created_by?: string \| null` |
| 11 | `src/repositories/place.repository.ts:20` | created_by | `createdBy: row.created_by,` |
| 12 | `src/repositories/place.repository.ts:41` | created_by | `const { data, error } = await supabase.from(TABLE).select('*').eq('created_by', userId);` |
| 13 | `src/repositories/place.repository.ts:71` | created_by | `created_by: place.createdBy,` |
| 14 | `src/repositories/place.repository.ts:91` | created_by | `created_by: p.createdBy,` |
| 15 | `src/stores/image-recovery-job-store.ts:236` | created_by | `created_by: uid,` |
| 16 | `src/components/LayersPanel.tsx:15` | ownershipFilter | `const { isLayerVisible, toggleLayer, ownershipFilter, setOwnershipFilter } = useLayerVisibility();` |
| 17 | `src/components/LayersPanel.tsx:87` | ownershipFilter | `const active = ownershipFilter === value;` |
| 18 | `src/components/FloatingToolbar.tsx:230` | ownershipFilter | `const { ownershipFilter } = useLayerVisibility();` |
| 19 | `src/components/FloatingToolbar.tsx:659` | ownershipFilter | `ownershipFilter={ownershipFilter}` |
| 20 | `src/hooks/use-layer-visibility.ts:213` | ownershipFilter | `updates.ownershipFilter = 'mine' as OwnershipFilter;` |
| 21 | `src/hooks/use-layer-visibility.ts:248` | ownershipFilter | `let ownershipFilter: OwnershipFilter = 'all';` |
| 22 | `src/hooks/use-layer-visibility.ts:251` | ownershipFilter | `ownershipFilter = 'mine';` |
| 23 | `src/hooks/use-layer-visibility.ts:253` | ownershipFilter | `ownershipFilter = 'followed';` |
| 24 | `src/hooks/use-layer-visibility.ts:260` | ownershipFilter | `ownershipFilter,` |
| 25 | `src/hooks/use-layer-visibility.ts:326` | ownershipFilter | `const ownershipFilter = useMemo((): OwnershipFilter => {` |
| 26 | `src/hooks/use-layer-visibility.ts:334` | ownershipFilter | `setOwnershipFilter(ownershipFilter === 'mine' ? 'all' : 'mine');` |
| 27 | `src/hooks/use-layer-visibility.ts:335` | ownershipFilter | `}, [ownershipFilter, setOwnershipFilter]);` |
| 28 | `src/hooks/use-layer-visibility.ts:347` | ownershipFilter | `ownershipFilter,` |
| 29 | `src/stores/geocoding-job-store.ts:296` | created_by | `created_by: uid,` |
| 30 | `src/test/locations-store.test.ts:76` | ownershipFilter | `ownershipFilter: 'mine',` |
| 31 | `src/test/locations-store.test.ts:86` | ownershipFilter | `expect(filters.ownershipFilter).toBe('mine');` |
| 32 | `src/components/toolbar/MyCatalogQuickFilters.tsx:5` | ownershipFilter | `* restringidos a `ownershipFilter='mine'`.` |
| 33 | `src/components/toolbar/MyCatalogQuickFilters.tsx:69` | ownershipFilter | `ownershipFilter: OwnershipFilter;` |
| 34 | `src/components/toolbar/MyCatalogQuickFilters.tsx:75` | ownershipFilter | `ownershipFilter,` |
| 35 | `src/components/toolbar/MyCatalogQuickFilters.tsx:116` | ownershipFilter | `if (ownershipFilter !== 'mine') setOwnershipFilter('mine');` |
| 36 | `src/components/toolbar/MyCatalogQuickFilters.tsx:194` | ownershipFilter | `ownershipFilter === 'mine' ? 'text-emerald-400' : 'text-emerald-500 hover:text-emerald-400'` |
| 37 | `src/components/admin/GeographyBackfillPanel.tsx:22` | created_by | `// `created_by = admin.uid` y `user_id = target.uid`; el cron sigue` |
| 38 | `src/components/admin/GeographyBackfillPanel.tsx:683` | created_by | `. Quedará registrado en <code>created_by</code>.` |
| 39 | `src/domains/content/store/locations-store.ts:21` | ownershipFilter | `ownershipFilter: filters.ownershipFilter,` |
| 40 | `src/domains/content/store/locations-store.ts:431` | filterByUserId,ownershipFilter | `ownershipFilter, filterByUserId,` |
| 41 | `src/domains/content/store/locations-store.ts:585` | currentUserId,filterByUserId,ownershipFilter | `if (!filterByUserId && ownershipFilter === 'mine' && currentUserId) {` |
| 42 | `src/domains/content/store/locations-store.ts:621` | currentUserId,ownershipFilter | `if (ownershipFilter && ownershipFilter !== 'all' && currentUserId) {` |
| 43 | `src/domains/content/store/locations-store.ts:622` | ownershipFilter,isOwn | `if (ownershipFilter === 'mine' && !isOwnPoint) return false;` |
| 44 | `src/domains/content/store/locations-store.ts:623` | ownershipFilter,isOwn | `if (ownershipFilter === 'followed' && isOwnPoint) return false;` |
| 45 | `src/components/UsersSidebar.tsx:359` | ownershipFilter | `ownershipFilter: undefined,` |
| 46 | `src/domains/content/lib/db-operations.ts:256` | created_by | `.eq('created_by', user.id);` |

## 7. `getLocationOwnerUserId` — usos del helper canónico

Total: 23. Si esta cifra es baja vs §2, hay accesos directos sin pasar por el helper.

| # | File:Line | Snippet |
|---|---|---|
| 1 | `src/types/location.ts:276` | `* Fuente preferida del resolver `getLocationOwnerUserId`. Ver` |
| 2 | `src/components/toolbar/use-my-catalog-popover-fit.ts:35` | `import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';` |
| 3 | `src/components/toolbar/use-my-catalog-popover-fit.ts:90` | `if (getLocationOwnerUserId(loc as any) === uid) mine.push(loc);` |
| 4 | `src/domains/content/store/locations-store.ts:15` | `import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';` |
| 5 | `src/domains/content/store/locations-store.ts:460` | `const ofUid = source.filter(l => getLocationOwnerUserId(l) === uid);` |
| 6 | `src/domains/content/store/locations-store.ts:463` | `const isOwn = getLocationOwnerUserId(l) === currentUserId;` |
| 7 | `src/domains/content/store/locations-store.ts:577` | `const ownerId = getLocationOwnerUserId(loc);` |
| 8 | `src/domains/content/store/locations-store.ts:586` | `source = source.filter(loc => getLocationOwnerUserId(loc) === currentUserId);` |
| 9 | `src/domains/content/store/locations-store.ts:600` | `const ownerId = getLocationOwnerUserId(loc);` |
| 10 | `src/components/UsersSidebar.tsx:24` | `import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';` |
| 11 | `src/components/UsersSidebar.tsx:374` | `const ownerId = getLocationOwnerUserId(l as { ownerUserId?: string \| null; _docUserId?: string \| null });` |
| 12 | `src/components/map/map-icons.ts:28` | `import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';` |
| 13 | `src/components/map/map-icons.ts:230` | `? getLocationOwnerUserId(location as { ownerUserId?: string \| null; _docUserId?: string \| null })` |
| 14 | `src/domains/content/lib/poi-source.ts:41` | `import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';` |
| 15 | `src/domains/content/lib/poi-source.ts:182` | `const ownerUid = getLocationOwnerUserId(poi);` |
| 16 | `src/domains/content/lib/my-catalog-quick-counts.ts:13` | `import { getLocationOwnerUserId } from './location-owner';` |
| 17 | `src/domains/content/lib/my-catalog-quick-counts.ts:55` | `if (getLocationOwnerUserId(loc as any) !== currentUserId) continue;` |
| 18 | `src/domains/content/lib/location-filtering.ts:6` | `import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';` |
| 19 | `src/domains/content/lib/location-filtering.ts:68` | `return getLocationOwnerUserId(loc as { ownerUserId?: string \| null; _docUserId?: string \| null }) === f.id;` |
| 20 | `src/domains/content/lib/location-filtering.ts:143` | `getLocationOwnerUserId(loc as { ownerUserId?: string \| null; _docUserId?: string \| null }) !==` |
| 21 | `src/domains/content/lib/location-owner.ts:17` | `export function getLocationOwnerUserId(` |
| 22 | `src/domains/content/lib/location-owner.ts:29` | `loc: Parameters<typeof getLocationOwnerUserId>[0],` |
| 23 | `src/domains/content/lib/location-owner.ts:33` | `return getLocationOwnerUserId(loc) === userId;` |

## 8. High-risk findings

- **Accesos directos a `_docUserId` o `loc.ownerUserId` fuera de `getLocationOwnerUserId`** (BL-014). Ver §2 — toda fila que no esté dentro de `src/domains/content/lib/location-owner.ts` ni use el helper es un bypass potencial. `_docUserId` es FALLBACK LEGACY según core memory; cualquier productor nuevo lo está perpetuando.
- **`isOwn*` con 6 variantes léxicas** (`isOwn`, `isOwnPoi`, `isOwnPoint`, `isOwnLocation`, `isOwnDoc`, `isOwnedBy`). No hay un único helper booleano. Riesgo: divergencia en qué cuenta como "propio" (¿basta `ownerUserId === currentUserId`? ¿hay que considerar shared/curated?).
- **`currentUserId` propagado por props en lugar de hook centralizado** — 163 ocurrencias. Una fuente única vía hook (`useCurrentUserId()`) reduciría stale-closures y simplifica tests.
- **`created_by`** aparece mezclado con `ownerUserId` en queries Supabase. Posible divergencia entre RLS (que probablemente usa `created_by`) y UI (que usa `ownerUserId`). Candidate backlog item.
- **`ownershipFilter`** existe como concepto separado de `filterByUserId`. Verificar si son sinónimos o estados distintos del mismo eje.

## 9. Cross-references
- Memory: `mem://logic/content/location-owner-resolver`.
- Backlog: BL-014 (bypass `_docUserId` en `LocationMap`).
- Audits previos: `hardcoded-behaviors-audit.md` HC/HI ownership.
