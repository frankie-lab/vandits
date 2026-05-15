# Event Bus — Exhaustive Inventory

_Generated: 2026-05-15  •  Scope: `src/`  •  Doc-only_

## 1. Methodology

Comandos `rg` ejecutados:
```
rg -n 'new CustomEvent\(' src/
rg -n 'window\.(dispatchEvent|addEventListener|removeEventListener)' src/
rg -n 'lovable:[a-zA-Z0-9_-]+' src/
rg -n 'map-fit-bounds|requestSubsetFit' src/
```
Una fila por ocurrencia. Sin agrupar emisor/receptor en la tabla principal.

Totales: **165 emisiones**, **101 listeners (add)**, **95 listeners (remove)**, **93 nombres únicos**.

## 2. Inventory — Emisiones (`new CustomEvent` + `window.dispatchEvent`)

| # | Event | File:Line | Snippet |
|---|---|---|---|
| 1 | `store-updated` | `src/pages/Index.tsx:353` | `onSaved={() => { window.dispatchEvent(new CustomEvent('store-updated')); }}` |
| 2 | `itinerary-focus` | `src/pages/Index.tsx:402` | `onClose={() => { close('routes'); window.dispatchEvent(new CustomEvent('itinerary-focus', { detail: { locationIds: null ` |
| 3 | `itinerary-focus` | `src/pages/Index.tsx:439` | `window.dispatchEvent(new CustomEvent('itinerary-focus', {` |
| 4 | `map-fit-bounds` | `src/pages/Index.tsx:455` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', {` |
| 5 | `map-fit-bounds` | `src/pages/Index.tsx:466` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', {` |
| 6 | `icon-library-changed` | `src/contexts/IconLibraryContext.tsx:41` | `window.dispatchEvent(new CustomEvent('icon-library-changed', { detail: { library: lib } }));` |
| 7 | `lovable:image-recovery-job-tick` | `src/stores/image-recovery-job-store.ts:150` | `window.dispatchEvent(new CustomEvent('lovable:image-recovery-job-tick', {` |
| 8 | `store-updated` | `src/components/LocationPhotoUpload.tsx:281` | `window.dispatchEvent(new CustomEvent('store-updated'));` |
| 9 | `trash-updated` | `src/hooks/use-realtime-locations.ts:64` | `window.dispatchEvent(new CustomEvent('trash-updated'));` |
| 10 | `location-realtime-update` | `src/hooks/use-realtime-locations.ts:65` | `window.dispatchEvent(new CustomEvent('location-realtime-update', { detail: { locationId: updatedRecord.id, kind: 'delete` |
| 11 | `photo-updated` | `src/hooks/use-realtime-locations.ts:152` | `new CustomEvent('photo-updated', {` |
| 12 | `visited-updated` | `src/hooks/use-realtime-locations.ts:168` | `new CustomEvent('visited-updated', {` |
| 13 | `rating-updated` | `src/hooks/use-realtime-locations.ts:183` | `new CustomEvent('rating-updated', {` |
| 14 | `location-realtime-update` | `src/hooks/use-realtime-locations.ts:211` | `window.dispatchEvent(new CustomEvent('location-realtime-update', { detail: { locationId: updatedRecord.id, kind } }));` |
| 15 | `reload-locations` | `src/hooks/use-realtime-locations.ts:241` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 16 | `location-realtime-update` | `src/hooks/use-realtime-locations.ts:260` | `window.dispatchEvent(new CustomEvent('location-realtime-update', { detail: { locationId: newRecord.id, kind: 'insert' } ` |
| 17 | `reload-locations` | `src/hooks/use-realtime-locations.ts:356` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 18 | `photo-updated` | `src/components/LocationPhotoSearch.tsx:168` | `window.dispatchEvent(new CustomEvent('photo-updated', {` |
| 19 | `map-fit-bounds` | `src/components/DuplicatesList.tsx:346` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', {` |
| 20 | `duplicate-threshold-changed` | `src/components/DuplicatesList.tsx:493` | `window.dispatchEvent(new CustomEvent('duplicate-threshold-changed', {` |
| 21 | `collection-items-changed` | `src/components/CollectionsListPanel.tsx:468` | `window.dispatchEvent(new CustomEvent('collection-items-changed', { detail: { collectionId: collection.id } }));` |
| 22 | `reload-locations` | `src/components/AdminPanel.tsx:238` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 23 | `nearby-marker-clicked` | `src/components/LocationMap.tsx:447` | `window.dispatchEvent(new CustomEvent('nearby-marker-clicked', { detail: { id: p.id } }));` |
| 24 | `map-locate-state` | `src/components/LocationMap.tsx:1163` | `window.dispatchEvent(new CustomEvent('map-locate-state', {` |
| 25 | `map-render-mode-changed` | `src/components/LocationMap.tsx:1375` | `window.dispatchEvent(new CustomEvent('map-render-mode-changed'));` |
| 26 | `map-render-mode-changed` | `src/components/LocationMap.tsx:1397` | `window.dispatchEvent(new CustomEvent('map-render-mode-changed'));` |
| 27 | `vandits:open-profile` | `src/components/LocationMap.tsx:2841` | `onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-profile', { detail: { tab: 'map' } }))}` |
| 28 | `vandits:open-upload` | `src/components/LocationMap.tsx:2889` | `onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-upload'))}` |
| 29 | `vandits:open-profile` | `src/components/LocationMap.tsx:2943` | `onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-profile', { detail: { tab: 'map' } }))}` |
| 30 | `map-reset-view` | `src/components/LocationMap.tsx:3019` | `window.dispatchEvent(new CustomEvent('map-reset-view'));` |
| 31 | `vandits:open-upload` | `src/components/LocationMap.tsx:3030` | `onClick={() => window.dispatchEvent(new CustomEvent('vandits:open-upload'))}` |
| 32 | `map-locate-toggle` | `src/components/FloatingToolbar.tsx:168` | `onClick={() => window.dispatchEvent(new CustomEvent('map-locate-toggle'))}` |
| 33 | `map-go-home` | `src/components/FloatingToolbar.tsx:248` | `window.dispatchEvent(new CustomEvent('map-go-home'));` |
| 34 | `trash-updated` | `src/components/FloatingToolbar.tsx:534` | `window.dispatchEvent(new CustomEvent('trash-updated'));` |
| 35 | `store-updated` | `src/components/FloatingToolbar.tsx:535` | `window.dispatchEvent(new CustomEvent('store-updated'));` |
| 36 | `lovable:open-users-sidebar` | `src/components/FloatingToolbar.tsx:694` | `window.dispatchEvent(new CustomEvent('lovable:open-users-sidebar', { detail: { filter: 'following' } }));` |
| 37 | `lovable:open-users-sidebar` | `src/components/FloatingToolbar.tsx:713` | `window.dispatchEvent(new CustomEvent('lovable:open-users-sidebar', { detail: { filter: 'followers' } }));` |
| 38 | `trash-updated` | `src/components/FilterBar.tsx:136` | `window.dispatchEvent(new CustomEvent('trash-updated'));` |
| 39 | `store-updated` | `src/components/FilterBar.tsx:137` | `window.dispatchEvent(new CustomEvent('store-updated'));` |
| 40 | `map-fit-bounds` | `src/components/CollectionFocusView.tsx:96` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', {` |
| 41 | `collection-items-changed` | `src/components/CollectionFocusView.tsx:157` | `window.dispatchEvent(new CustomEvent('collection-items-changed', { detail: { collectionId: collection.id } }));` |
| 42 | `collection-items-changed` | `src/components/CollectionFocusView.tsx:168` | `window.dispatchEvent(new CustomEvent('collection-items-changed', { detail: { collectionId: collection.id } }));` |
| 43 | `reload-locations` | `src/stores/geocoding-job-store.ts:156` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 44 | `locations:refresh` | `src/stores/geocoding-job-store.ts:157` | `window.dispatchEvent(new CustomEvent('locations:refresh'));` |
| 45 | `locations:changed` | `src/stores/geocoding-job-store.ts:158` | `window.dispatchEvent(new CustomEvent('locations:changed'));` |
| 46 | `reload-locations` | `src/stores/geocoding-job-store.ts:161` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 47 | `store-updated` | `src/stores/duplicate-store.ts:233` | `window.dispatchEvent(new CustomEvent('store-updated'));` |
| 48 | `trash-updated` | `src/components/LocationList.tsx:72` | `window.dispatchEvent(new CustomEvent('trash-updated'));` |
| 49 | `store-updated` | `src/components/LocationList.tsx:73` | `window.dispatchEvent(new CustomEvent('store-updated'));` |
| 50 | `map-route-selected` | `src/components/map/map-routes.ts:81` | `window.dispatchEvent(new CustomEvent('map-route-selected', { detail: { routeId: layer._routeId } }));` |
| 51 | `route-alternative-selected` | `src/components/map/map-routes.ts:91` | `window.dispatchEvent(new CustomEvent('route-alternative-selected', {` |
| 52 | `route-alternative-hover` | `src/components/map/map-routes.ts:337` | `window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: seg.alternativeLabel } }));` |
| 53 | `route-alternative-hover` | `src/components/map/map-routes.ts:342` | `window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: null } }));` |
| 54 | `route-alternative-selected` | `src/components/map/map-routes.ts:442` | `window.dispatchEvent(new CustomEvent('route-alternative-selected', { detail: { mode: seg.alternativeMode, label: seg.alt` |
| 55 | `map-waypoint-dragged` | `src/components/map/map-routes.ts:865` | `window.dispatchEvent(new CustomEvent('map-waypoint-dragged', {` |
| 56 | `map-waypoint-insert` | `src/components/map/map-routes.ts:908` | `window.dispatchEvent(new CustomEvent('map-waypoint-insert', {` |
| 57 | `map-segment-correction-start` | `src/components/map/map-routes.ts:1145` | `window.dispatchEvent(new CustomEvent('map-segment-correction-start'));` |
| 58 | `map-segment-correction-error` | `src/components/map/map-routes.ts:1169` | `window.dispatchEvent(new CustomEvent('map-segment-correction-error', { detail: { error: data.error } }));` |
| 59 | `map-segment-corrected` | `src/components/map/map-routes.ts:1172` | `window.dispatchEvent(new CustomEvent('map-segment-corrected', {` |
| 60 | `map-segment-correction-error` | `src/components/map/map-routes.ts:1182` | `window.dispatchEvent(new CustomEvent('map-segment-correction-error', { detail: { error: err.message } }));` |
| 61 | `map-segment-correction-start` | `src/components/map/map-routes.ts:1255` | `window.dispatchEvent(new CustomEvent('map-segment-correction-start'));` |
| 62 | `map-segment-correction-error` | `src/components/map/map-routes.ts:1279` | `window.dispatchEvent(new CustomEvent('map-segment-correction-error', { detail: { error: data.error } }));` |
| 63 | `map-segment-corrected` | `src/components/map/map-routes.ts:1282` | `window.dispatchEvent(new CustomEvent('map-segment-corrected', {` |
| 64 | `map-segment-correction-error` | `src/components/map/map-routes.ts:1292` | `window.dispatchEvent(new CustomEvent('map-segment-correction-error', { detail: { error: err.message } }));` |
| 65 | `popup-action` | `src/components/map/map-popup-handlers.ts:97` | `new CustomEvent('popup-action', {` |
| 66 | `admin:open-data-sources` | `src/shared/progress/ImageRecoveryLane.tsx:101` | `window.dispatchEvent(new CustomEvent('admin:open-data-sources'));` |
| 67 | `admin:open-geography` | `src/shared/progress/GeocodingLane.tsx:57` | `window.dispatchEvent(new CustomEvent('admin:open-geography'));` |
| 68 | `notes-updated` | `src/components/NotesEditor.tsx:114` | `window.dispatchEvent(new CustomEvent('notes-updated', {` |
| 69 | `photo-updated` | `src/components/OneDrivePhotoBrowser.tsx:183` | `window.dispatchEvent(new CustomEvent('photo-updated', {` |
| 70 | `map-fit-bounds` | `src/components/OrphanFocusView.tsx:72` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', {` |
| 71 | `visited-updated` | `src/components/OneDriveVisitValidator.tsx:260` | `window.dispatchEvent(new CustomEvent('visited-updated', {` |
| 72 | `visited-updated` | `src/components/OneDriveVisitValidator.tsx:307` | `window.dispatchEvent(new CustomEvent('visited-updated', {` |
| 73 | `personal-categories:reload` | `src/components/PersonalCategoriesPanel.tsx:173` | `window.dispatchEvent(new CustomEvent('personal-categories:reload'));` |
| 74 | `map-clear-route` | `src/domains/routes/hooks/use-route-orchestration.ts:85` | `window.dispatchEvent(new CustomEvent('map-clear-route'));` |
| 75 | `map-show-route` | `src/domains/routes/hooks/use-route-orchestration.ts:206` | `window.dispatchEvent(new CustomEvent('map-show-route', { detail: { segments: allSegments, stops: allStops } }));` |
| 76 | `map-clear-route` | `src/domains/routes/hooks/use-route-orchestration.ts:208` | `window.dispatchEvent(new CustomEvent('map-clear-route'));` |
| 77 | `map-fit-bounds` | `src/domains/routes/hooks/use-route-focus-bus.ts:26` | `new CustomEvent('map-fit-bounds', {` |
| 78 | `map-fit-bounds` | `src/domains/routes/hooks/use-route-focus-bus.ts:48` | `new CustomEvent('map-fit-bounds', {` |
| 79 | `map-hide-insert-preview` | `src/components/RouteBuilder.tsx:333` | `window.dispatchEvent(new CustomEvent('map-hide-insert-preview'));` |
| 80 | `map-clear-editable-waypoints` | `src/components/RouteBuilder.tsx:543` | `window.dispatchEvent(new CustomEvent('map-clear-editable-waypoints'));` |
| 81 | `map-show-editable-waypoints` | `src/components/RouteBuilder.tsx:556` | `window.dispatchEvent(new CustomEvent('map-show-editable-waypoints', { detail: { waypoints: editableWaypoints } }));` |
| 82 | `map-clear-editable-waypoints` | `src/components/RouteBuilder.tsx:561` | `window.dispatchEvent(new CustomEvent('map-clear-editable-waypoints'));` |
| 83 | `map-correction-mode` | `src/components/RouteBuilder.tsx:631` | `window.dispatchEvent(new CustomEvent('map-correction-mode', { detail: { active: true, transportMode } }));` |
| 84 | `map-correction-mode` | `src/components/RouteBuilder.tsx:633` | `window.dispatchEvent(new CustomEvent('map-correction-mode', { detail: { active: false } }));` |
| 85 | `map-correction-mode` | `src/components/RouteBuilder.tsx:636` | `window.dispatchEvent(new CustomEvent('map-correction-mode', { detail: { active: false } }));` |
| 86 | `map-clear-advisor-preview` | `src/components/RouteBuilder.tsx:792` | `window.dispatchEvent(new CustomEvent('map-clear-advisor-preview'));` |
| 87 | `map-fly-to` | `src/components/RouteBuilder.tsx:822` | `window.dispatchEvent(new CustomEvent('map-fly-to', {` |
| 88 | `map-show-insert-preview` | `src/components/RouteBuilder.tsx:840` | `window.dispatchEvent(new CustomEvent('map-show-insert-preview', {` |
| 89 | `map-hide-insert-preview` | `src/components/RouteBuilder.tsx:858` | `window.dispatchEvent(new CustomEvent('map-hide-insert-preview'));` |
| 90 | `map-hide-insert-preview` | `src/components/RouteBuilder.tsx:1521` | `onClose={() => { setInlineInsertIndex(null); window.dispatchEvent(new CustomEvent('map-hide-insert-preview')); }}` |
| 91 | `map-hide-insert-preview` | `src/components/RouteBuilder.tsx:1572` | `onClose={() => { setInlineInsertIndex(null); window.dispatchEvent(new CustomEvent('map-hide-insert-preview')); }}` |
| 92 | `route-alternative-hover` | `src/components/RouteBuilder.tsx:1785` | `onMouseEnter={() => { setHoveredAlternativeLabel(alt.label); window.dispatchEvent(new CustomEvent('route-alternative-hov` |
| 93 | `route-alternative-hover` | `src/components/RouteBuilder.tsx:1786` | `onMouseLeave={() => { setHoveredAlternativeLabel(null); window.dispatchEvent(new CustomEvent('route-alternative-hover', ` |
| 94 | `route-alternative-hover` | `src/components/RouteBuilder.tsx:1903` | `onMouseEnter={() => { setHoveredAlternativeLabel(alt.label); window.dispatchEvent(new CustomEvent('route-alternative-hov` |
| 95 | `route-alternative-hover` | `src/components/RouteBuilder.tsx:1904` | `onMouseLeave={() => { setHoveredAlternativeLabel(null); window.dispatchEvent(new CustomEvent('route-alternative-hover', ` |
| 96 | `map-hide-insert-preview` | `src/components/RouteBuilder.tsx:1961` | `onClose={() => { setInlineInsertIndex(null); window.dispatchEvent(new CustomEvent('map-hide-insert-preview')); }}` |
| 97 | `measurement-units-changed` | `src/components/UserProfileEditor.tsx:724` | `window.dispatchEvent(new CustomEvent('measurement-units-changed', {` |
| 98 | `trash-updated` | `src/components/TrashPanel.tsx:49` | `window.dispatchEvent(new CustomEvent('trash-updated'));` |
| 99 | `map-fit-bounds` | `src/components/SegmentBreakdown.tsx:272` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', { detail: { bounds, padding: [80, 80], maxZoom: 14 } }));` |
| 100 | `itinerary-point-selected` | `src/components/RoutesListPanel.tsx:622` | `window.dispatchEvent(new CustomEvent('itinerary-point-selected', {` |
| 101 | `itinerary-segment-selected` | `src/components/RoutesListPanel.tsx:876` | `window.dispatchEvent(new CustomEvent('itinerary-segment-selected', {` |
| 102 | `photo-focus` | `src/components/OneDrivePhotosPanel.tsx:313` | `new CustomEvent('photo-focus', {` |
| 103 | `reload-locations` | `src/shared/geography/renormalize.ts:59` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 104 | `locations:refresh` | `src/shared/geography/renormalize.ts:60` | `window.dispatchEvent(new CustomEvent('locations:refresh'));` |
| 105 | `locations:changed` | `src/shared/geography/renormalize.ts:61` | `window.dispatchEvent(new CustomEvent('locations:changed'));` |
| 106 | `lovable:follow-changed` | `src/components/UsersSidebar.tsx:305` | `window.dispatchEvent(new CustomEvent('lovable:follow-changed'));` |
| 107 | `lovable:follow-changed` | `src/components/UsersSidebar.tsx:344` | `window.dispatchEvent(new CustomEvent('lovable:follow-changed'));` |
| 108 | `lovable:profile-updated` | `src/domains/identity/hooks/use-auth.ts:227` | `new CustomEvent('lovable:profile-updated', { detail: { userId: user.id } })` |
| 109 | `document:deleted` | `src/domains/content/store/locations-store.ts:235` | `window.dispatchEvent(new CustomEvent('document:deleted', { detail: { id, deleteLocations } }));` |
| 110 | `store-updated` | `src/components/filters/SelectionActions.tsx:132` | `window.dispatchEvent(new CustomEvent('store-updated'));` |
| 111 | `locations-refresh` | `src/components/filters/SelectionActions.tsx:133` | `window.dispatchEvent(new CustomEvent('locations-refresh'));` |
| 112 | `enrichment-started` | `src/components/filters/SelectionActions.tsx:189` | `window.dispatchEvent(new CustomEvent('enrichment-started', { detail: { jobId: data.jobId } }));` |
| 113 | `trash-updated` | `src/components/filters/SelectionActions.tsx:417` | `window.dispatchEvent(new CustomEvent('trash-updated'));` |
| 114 | `reload-locations` | `src/components/admin/GeographyBackfillPanel.tsx:299` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 115 | `document:processing-step` | `src/domains/content/lib/process-imported-document.ts:76` | `new CustomEvent('document:processing-step', {` |
| 116 | `document:processed` | `src/domains/content/lib/process-imported-document.ts:85` | `new CustomEvent('document:processed', { detail: { docId, ...summary } }),` |
| 117 | `open-nearby-context` | `src/domains/content/lib/enrich-location.ts:64` | `window.dispatchEvent(new CustomEvent('open-nearby-context', {` |
| 118 | `open-nearby-context` | `src/domains/content/lib/enrich-location.ts:163` | `window.dispatchEvent(new CustomEvent('open-nearby-context', {` |
| 119 | `location:enriched` | `src/domains/content/lib/enrich-location.ts:287` | `new CustomEvent('location:enriched', {` |
| 120 | `locations:changed` | `src/domains/content/lib/document-approval.ts:65` | `window.dispatchEvent(new CustomEvent('locations:changed'));` |
| 121 | `reload-locations` | `src/domains/content/lib/document-approval.ts:66` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 122 | `collections:changed` | `src/domains/content/lib/document-approval.ts:79` | `window.dispatchEvent(new CustomEvent('collections:changed'));` |
| 123 | `collection-items-changed` | `src/services/document-add.service.ts:194` | `window.dispatchEvent(new CustomEvent('collection-items-changed', { detail: { collectionId: cid } }));` |
| 124 | `document:deleted` | `src/domains/content/lib/auto-delete-empty-document.ts:45` | `window.dispatchEvent(new CustomEvent('document:deleted', { detail: { id: docId, auto: true } }));` |
| 125 | `visited-updated` | `src/domains/content/hooks/use-popup-actions.ts:79` | `window.dispatchEvent(new CustomEvent('visited-updated', {` |
| 126 | `trash-updated` | `src/domains/content/hooks/use-popup-actions.ts:131` | `window.dispatchEvent(new CustomEvent('trash-updated'));` |
| 127 | `rating-updated` | `src/domains/content/hooks/use-popup-actions.ts:443` | `new CustomEvent('rating-updated', {` |
| 128 | `photo-updated` | `src/domains/content/hooks/use-popup-actions.ts:514` | `window.dispatchEvent(new CustomEvent('photo-updated', {` |
| 129 | `open-nearby-context` | `src/domains/content/hooks/use-popup-actions.ts:611` | `window.dispatchEvent(new CustomEvent('open-nearby-context', {` |
| 130 | `open-reclassify` | `src/domains/content/hooks/use-popup-actions.ts:640` | `window.dispatchEvent(new CustomEvent('open-reclassify', {` |
| 131 | `collections-updated` | `src/domains/content/lib/auto-delete-empty.ts:30` | `window.dispatchEvent(new CustomEvent('collections-updated'));` |
| 132 | `collections:changed` | `src/domains/content/lib/auto-delete-empty.ts:31` | `window.dispatchEvent(new CustomEvent('collections:changed'));` |
| 133 | `routes:changed` | `src/domains/content/lib/auto-delete-empty.ts:56` | `window.dispatchEvent(new CustomEvent('routes:changed'));` |
| 134 | `document:view-on-map` | `src/domains/content/components/WebImportPanel.tsx:260` | `window.dispatchEvent(new CustomEvent('document:view-on-map', {` |
| 135 | `document:open-workspace` | `src/domains/content/components/WebImportPanel.tsx:617` | `window.dispatchEvent(new CustomEvent('document:open-workspace', {` |
| 136 | `map-fly-to` | `src/domains/content/components/PointContextActions.tsx:239` | `window.dispatchEvent(new CustomEvent('map-fly-to', {` |
| 137 | `map-show-nearby-ref` | `src/domains/content/components/PointContextActions.tsx:257` | `window.dispatchEvent(new CustomEvent('map-show-nearby-ref', {` |
| 138 | `map-clear-nearby-ref` | `src/domains/content/components/PointContextActions.tsx:267` | `window.dispatchEvent(new CustomEvent('map-clear-nearby-ref'));` |
| 139 | `map-fly-to` | `src/domains/content/components/PointContextActions.tsx:383` | `window.dispatchEvent(new CustomEvent('map-fly-to', {` |
| 140 | `location:enriched` | `src/domains/content/components/PointContextActions.tsx:452` | `window.dispatchEvent(new CustomEvent('location:enriched', {` |
| 141 | `map-fly-to` | `src/domains/content/components/PointContextActions.tsx:639` | `window.dispatchEvent(new CustomEvent('map-fly-to', {` |
| 142 | `routes:changed` | `src/domains/content/components/FileUploadZone.tsx:284` | `window.dispatchEvent(new CustomEvent('routes:changed'));` |
| 143 | `map-show-route` | `src/domains/content/components/FileUploadZone.tsx:290` | `window.dispatchEvent(new CustomEvent('map-show-route', {` |
| 144 | `document:view-on-map` | `src/domains/content/components/FileUploadZone.tsx:423` | `window.dispatchEvent(new CustomEvent('document:view-on-map', {` |
| 145 | `document:open-workspace` | `src/domains/content/components/FileUploadZone.tsx:645` | `window.dispatchEvent(new CustomEvent('document:open-workspace', {` |
| 146 | `enrichment-criteria-changed` | `src/domains/content/components/EnrichmentCriteriaConfig.tsx:212` | `window.dispatchEvent(new CustomEvent('enrichment-criteria-changed'));` |
| 147 | `reload-locations` | `src/domains/content/components/DocumentsPanel.tsx:212` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 148 | `routes:changed` | `src/domains/content/components/DocumentsPanel.tsx:213` | `window.dispatchEvent(new CustomEvent('routes:changed'));` |
| 149 | `reload-locations` | `src/domains/content/components/DocumentsPanel.tsx:262` | `window.dispatchEvent(new CustomEvent('reload-locations'));` |
| 150 | `map-fit-bounds` | `src/domains/content/components/DocumentsPanel.tsx:287` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', {` |
| 151 | `document:view-on-map` | `src/domains/content/components/DocumentFocusView.tsx:278` | `window.dispatchEvent(new CustomEvent('document:view-on-map', {` |
| 152 | `map-fit-bounds` | `src/domains/content/components/DocumentFocusView.tsx:292` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', {` |
| 153 | `document:view-on-map` | `src/domains/content/components/DocumentFocusView.tsx:308` | `window.dispatchEvent(new CustomEvent('document:view-on-map', { detail: null }));` |
| 154 | `map:set-drag-mode` | `src/domains/content/components/DocumentFocusView.tsx:508` | `window.dispatchEvent(new CustomEvent('map:set-drag-mode', { detail: { enabled: true, docId } }));` |
| 155 | `map:set-drag-mode` | `src/domains/content/components/DocumentFocusView.tsx:510` | `window.dispatchEvent(new CustomEvent('map:set-drag-mode', { detail: { enabled: false } }));` |
| 156 | `locations-updated` | `src/domains/content/components/DocumentFocusView.tsx:731` | `window.dispatchEvent(new CustomEvent('locations-updated'));` |
| 157 | `locations-updated` | `src/domains/content/components/DocumentFocusView.tsx:1050` | `window.dispatchEvent(new CustomEvent('locations-updated'));` |
| 158 | `routes:changed` | `src/domains/content/components/DocumentFocusView.tsx:1181` | `window.dispatchEvent(new CustomEvent('routes:changed'));` |
| 159 | `map-show-route` | `src/domains/content/components/DocumentFocusView.tsx:1209` | `window.dispatchEvent(new CustomEvent('map-show-route', { detail: { segments, stops: [] } }));` |
| 160 | `map-fit-bounds` | `src/domains/content/components/DocumentContentManager.tsx:179` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', {` |
| 161 | `route:toggle-visibility` | `src/domains/content/components/DocumentContentManager.tsx:192` | `window.dispatchEvent(new CustomEvent('route:toggle-visibility', {` |
| 162 | `store-updated` | `src/domains/content/components/DocumentContentManager.tsx:211` | `window.dispatchEvent(new CustomEvent('store-updated'));` |
| 163 | `routes:changed` | `src/domains/content/components/DocumentContentManager.tsx:238` | `window.dispatchEvent(new CustomEvent('routes:changed'));` |
| 164 | `open-nearby-context` | `src/domains/content/components/BatchEnrichmentPanel.tsx:708` | `window.dispatchEvent(new CustomEvent('open-nearby-context', {` |
| 165 | `document:open-workspace` | `src/domains/content/components/BackgroundScrapeJobs.tsx:136` | `window.dispatchEvent(new CustomEvent('document:open-workspace', { detail: { docId } }));` |

## 3. Inventory — Listeners (`window.addEventListener`)

| # | Event | File:Line | Snippet |
|---|---|---|---|
| 1 | `icon-library-changed` | `src/contexts/IconLibraryContext.tsx:50` | `window.addEventListener('icon-library-changed', handler);` |
| 2 | `vandits:open-upload` | `src/pages/Index.tsx:125` | `window.addEventListener('vandits:open-upload', onOpenUpload);` |
| 3 | `vandits:open-profile` | `src/pages/Index.tsx:126` | `window.addEventListener('vandits:open-profile', onOpenProfile as EventListener);` |
| 4 | `admin:open-geography` | `src/pages/Index.tsx:127` | `window.addEventListener('admin:open-geography', onOpenGeography);` |
| 5 | `admin:open-data-sources` | `src/pages/Index.tsx:128` | `window.addEventListener('admin:open-data-sources', onOpenDataSources);` |
| 6 | `enrichment-criteria-changed` | `src/pages/Index.tsx:180` | `window.addEventListener('enrichment-criteria-changed', handleCriteriaChange);` |
| 7 | `import:open-categories` | `src/pages/Index.tsx:186` | `window.addEventListener('import:open-categories', handleOpenCategories);` |
| 8 | `lovable:follow-changed` | `src/pages/Index.tsx:196` | `window.addEventListener('lovable:follow-changed', handleFollowChanged);` |
| 9 | `pending-validations-updated` | `src/pages/Index.tsx:205` | `window.addEventListener('pending-validations-updated', handleValidationsUpdate as EventListener);` |
| 10 | `popup-action` | `src/pages/Index.tsx:211` | `window.addEventListener('popup-action', handler);` |
| 11 | `layer-visibility-changed` | `src/test/layer-visibility.test.ts:118` | `window.addEventListener('layer-visibility-changed', handler);` |
| 12 | `enrichment-criteria-changed` | `src/components/LocationMap.tsx:352` | `window.addEventListener('enrichment-criteria-changed', handleCriteriaChanged);` |
| 13 | `map-go-home` | `src/components/LocationMap.tsx:353` | `window.addEventListener('map-go-home', handleGoHome);` |
| 14 | `map-set-theme` | `src/components/LocationMap.tsx:354` | `window.addEventListener('map-set-theme', handleSetTheme);` |
| 15 | `map-fit-bounds` | `src/components/LocationMap.tsx:355` | `window.addEventListener('map-fit-bounds', handleFitBounds);` |
| 16 | `measurement-units-changed` | `src/components/LocationMap.tsx:356` | `window.addEventListener('measurement-units-changed', handleMeasurementUnitsChanged);` |
| 17 | `map-reset-view` | `src/components/LocationMap.tsx:370` | `window.addEventListener('map-reset-view', handleResetView);` |
| 18 | `map-show-preview-markers` | `src/components/LocationMap.tsx:504` | `window.addEventListener('map-show-preview-markers', handleShowPreviewMarkers);` |
| 19 | `map-clear-preview-markers` | `src/components/LocationMap.tsx:505` | `window.addEventListener('map-clear-preview-markers', handleClearPreviewMarkers);` |
| 20 | `map-show-nearby-ref` | `src/components/LocationMap.tsx:506` | `window.addEventListener('map-show-nearby-ref', handleShowNearbyRef);` |
| 21 | `map-clear-nearby-ref` | `src/components/LocationMap.tsx:507` | `window.addEventListener('map-clear-nearby-ref', handleClearNearbyRef);` |
| 22 | `nearby-highlight-marker` | `src/components/LocationMap.tsx:508` | `window.addEventListener('nearby-highlight-marker', handleHighlightNearbyMarker);` |
| 23 | `map-show-import-preview-routes` | `src/components/LocationMap.tsx:509` | `window.addEventListener('map-show-import-preview-routes', handleShowImportPreviewRoutes);` |
| 24 | `map-clear-import-preview-routes` | `src/components/LocationMap.tsx:510` | `window.addEventListener('map-clear-import-preview-routes', handleClearImportPreviewRoutes);` |
| 25 | `map-fly-to` | `src/components/LocationMap.tsx:511` | `window.addEventListener('map-fly-to', handleFlyTo);` |
| 26 | `itinerary-focus` | `src/components/LocationMap.tsx:522` | `window.addEventListener('itinerary-focus', handleItineraryFocus);` |
| 27 | `map-show-route` | `src/components/LocationMap.tsx:583` | `window.addEventListener('map-show-route', handleShowRouteEvent);` |
| 28 | `map-clear-route` | `src/components/LocationMap.tsx:584` | `window.addEventListener('map-clear-route', handleClearRouteEvent);` |
| 29 | `map-show-advisor-preview` | `src/components/LocationMap.tsx:585` | `window.addEventListener('map-show-advisor-preview', handleShowAdvisorPreviewEvent);` |
| 30 | `map-clear-advisor-preview` | `src/components/LocationMap.tsx:586` | `window.addEventListener('map-clear-advisor-preview', handleClearAdvisorPreviewEvent);` |
| 31 | `map-show-journey-preview` | `src/components/LocationMap.tsx:587` | `window.addEventListener('map-show-journey-preview', handleShowJourneyPreviewEvent);` |
| 32 | `map-clear-journey-preview` | `src/components/LocationMap.tsx:588` | `window.addEventListener('map-clear-journey-preview', handleClearJourneyPreviewEvent);` |
| 33 | `route-alternative-hover` | `src/components/LocationMap.tsx:589` | `window.addEventListener('route-alternative-hover', handleAlternativeHoverEvent);` |
| 34 | `map-show-editable-waypoints` | `src/components/LocationMap.tsx:628` | `window.addEventListener('map-show-editable-waypoints', handleShowEditableWaypoints);` |
| 35 | `map-clear-editable-waypoints` | `src/components/LocationMap.tsx:629` | `window.addEventListener('map-clear-editable-waypoints', handleClearEditableWaypoints);` |
| 36 | `map-correction-mode` | `src/components/LocationMap.tsx:630` | `window.addEventListener('map-correction-mode', handleCorrectionMode);` |
| 37 | `itinerary-segment-selected` | `src/components/LocationMap.tsx:631` | `window.addEventListener('itinerary-segment-selected', handleItinerarySegmentSelected);` |
| 38 | `itinerary-point-selected` | `src/components/LocationMap.tsx:641` | `window.addEventListener('itinerary-point-selected', handleItineraryPointSelected);` |
| 39 | `map-locate-toggle` | `src/components/LocationMap.tsx:1182` | `window.addEventListener('map-locate-toggle', onToggle);` |
| 40 | `photo-focus` | `src/components/LocationMap.tsx:1584` | `window.addEventListener('photo-focus', handlePhotoFocus);` |
| 41 | `location-realtime-update` | `src/components/LocationMap.tsx:2106` | `window.addEventListener('location-realtime-update', handler);` |
| 42 | `lovable:owner-identity-updated` | `src/components/LocationMap.tsx:2140` | `window.addEventListener('lovable:owner-identity-updated', handler);` |
| 43 | `map-render-mode-changed` | `src/components/LocationMap.tsx:2210` | `window.addEventListener('map-render-mode-changed', handler);` |
| 44 | `resize` | `src/components/LocationMap.tsx:2663` | `window.addEventListener('resize', measureFooterSafeInset);` |
| 45 | `vandits:show-welcome` | `src/components/LocationMap.tsx:2678` | `window.addEventListener('vandits:show-welcome', handler);` |
| 46 | `duplicate-threshold-changed` | `src/hooks/use-duplicate-count.ts:36` | `window.addEventListener('duplicate-threshold-changed', handler);` |
| 47 | `keydown` | `src/components/ui/sidebar.tsx:87` | `window.addEventListener("keydown", handleKeyDown);` |
| 48 | `collection-visibility-changed` | `src/test/collection-visibility.test.ts:109` | `window.addEventListener('collection-visibility-changed', spy);` |
| 49 | `collection-items-changed` | `src/components/CollectionsListPanel.tsx:358` | `window.addEventListener('collection-items-changed', handler);` |
| 50 | `map-locate-state` | `src/components/FloatingToolbar.tsx:152` | `window.addEventListener('map-locate-state', onState);` |
| 51 | `map-route-selected` | `src/components/RoutesListPanel.tsx:507` | `window.addEventListener('map-route-selected', handler);` |
| 52 | `itinerary-map-point-clicked` | `src/components/RoutesListPanel.tsx:534` | `window.addEventListener('itinerary-map-point-clicked', handler);` |
| 53 | `map-route-selected` | `src/domains/routes/hooks/use-route-orchestration.ts:232` | `window.addEventListener('map-route-selected', handleRouteSelected);` |
| 54 | `route:toggle-visibility` | `src/domains/routes/hooks/use-route-focus-bus.ts:77` | `window.addEventListener('route:toggle-visibility', handler as EventListener);` |
| 55 | `route:focus` | `src/domains/routes/hooks/use-route-focus-bus.ts:97` | `window.addEventListener('route:focus', handler as EventListener);` |
| 56 | `map-waypoint-dragged` | `src/components/RouteBuilder.tsx:620` | `window.addEventListener('map-waypoint-dragged', handleDrag);` |
| 57 | `map-waypoint-insert` | `src/components/RouteBuilder.tsx:621` | `window.addEventListener('map-waypoint-insert', handleInsert);` |
| 58 | `map-segment-corrected` | `src/components/RouteBuilder.tsx:681` | `window.addEventListener('map-segment-corrected', handleCorrectionResult);` |
| 59 | `map-segment-correction-error` | `src/components/RouteBuilder.tsx:682` | `window.addEventListener('map-segment-correction-error', handleCorrectionError);` |
| 60 | `map-segment-correction-start` | `src/components/RouteBuilder.tsx:683` | `window.addEventListener('map-segment-correction-start', handleCorrectionStart);` |
| 61 | `route-alternative-selected` | `src/components/RouteBuilder.tsx:988` | `window.addEventListener('route-alternative-selected', handler);` |
| 62 | `route-alternative-hover` | `src/components/RouteBuilder.tsx:998` | `window.addEventListener('route-alternative-hover', handler);` |
| 63 | `personal-categories:reload` | `src/components/PersonalCategoriesPanel.tsx:116` | `window.addEventListener('personal-categories:reload', handler);` |
| 64 | `lovable:image-recovery-job-tick` | `src/components/admin/RecoverImagesPanel.tsx:256` | `window.addEventListener('lovable:image-recovery-job-tick', schedule);` |
| 65 | `location-realtime-update` | `src/components/admin/RecoverImagesPanel.tsx:257` | `window.addEventListener('location-realtime-update', schedule);` |
| 66 | `location-realtime-update` | `src/components/map/useEnrichmentTracker.ts:138` | `window.addEventListener('location-realtime-update', handler);` |
| 67 | `collection-visibility-changed` | `src/domains/content/store/locations-store.ts:749` | `window.addEventListener('collection-visibility-changed', bump);` |
| 68 | `orphan-points-changed` | `src/domains/content/store/locations-store.ts:750` | `window.addEventListener('orphan-points-changed', bump);` |
| 69 | `lovable:owner-identity-updated` | `src/components/UsersSidebar.tsx:116` | `window.addEventListener('lovable:owner-identity-updated', handler);` |
| 70 | `lovable:open-users-sidebar` | `src/components/UsersSidebar.tsx:133` | `window.addEventListener('lovable:open-users-sidebar', handler);` |
| 71 | `visited-updated` | `src/components/map/map-popup-handlers.ts:284` | `window.addEventListener('visited-updated', handler);` |
| 72 | `rating-updated` | `src/components/map/map-popup-handlers.ts:340` | `window.addEventListener('rating-updated', handler);` |
| 73 | `notes-updated` | `src/components/map/map-popup-handlers.ts:372` | `window.addEventListener('notes-updated', handler);` |
| 74 | `photo-updated` | `src/components/map/map-popup-handlers.ts:455` | `window.addEventListener('photo-updated', handler);` |
| 75 | `location-realtime-update` | `src/components/map/use-coalesced-realtime-tick.ts:104` | `window.addEventListener('location-realtime-update', handleRealtime);` |
| 76 | `location:enriched` | `src/components/map/use-coalesced-realtime-tick.ts:105` | `window.addEventListener('location:enriched', handleEnriched);` |
| 77 | `store-updated` | `src/components/map/use-coalesced-realtime-tick.ts:106` | `if (listenStoreUpdated) window.addEventListener('store-updated', handleStore);` |
| 78 | `collections-updated` | `src/domains/content/store/location-collections-store.ts:140` | `window.addEventListener('collections-updated', onCollectionsUpdated);` |
| 79 | `collection-items-changed` | `src/domains/content/store/location-collections-store.ts:141` | `window.addEventListener('collection-items-changed', onItemsChanged as EventListener);` |
| 80 | `trash-updated` | `src/components/UserMenu.tsx:192` | `window.addEventListener('trash-updated', handleTrashUpdate);` |
| 81 | `focus` | `src/components/UserMenu.tsx:193` | `window.addEventListener('focus', handleTrashUpdate);` |
| 82 | `lovable:profile-updated` | `src/domains/identity/hooks/use-auth.ts:96` | `window.addEventListener('lovable:profile-updated', handler);` |
| 83 | `document:open-workspace` | `src/domains/content/components/DocumentsPanel.tsx:156` | `window.addEventListener('document:open-workspace', handler as EventListener);` |
| 84 | `document:processing-step` | `src/domains/content/components/ImportSummaryDialog.tsx:131` | `window.addEventListener('document:processing-step', onStep);` |
| 85 | `document:processed` | `src/domains/content/components/ImportSummaryDialog.tsx:132` | `window.addEventListener('document:processed', onDone);` |
| 86 | `trash-updated` | `src/domains/content/components/DocumentFocusView.tsx:315` | `window.addEventListener('trash-updated', refresh);` |
| 87 | `locations-updated` | `src/domains/content/components/DocumentFocusView.tsx:316` | `window.addEventListener('locations-updated', refresh);` |
| 88 | `location:enriched` | `src/domains/content/components/DocumentFocusView.tsx:337` | `window.addEventListener('location:enriched', handler);` |
| 89 | `location:moved` | `src/domains/content/components/DocumentFocusView.tsx:361` | `window.addEventListener('location:moved', handleLocationMoved as EventListener);` |
| 90 | `route:focus` | `src/domains/content/components/DocumentFocusView.tsx:386` | `window.addEventListener('route:focus', handleRouteFocus as EventListener);` |
| 91 | `map-route-selected` | `src/domains/content/components/DocumentFocusView.tsx:387` | `window.addEventListener('map-route-selected', handleMapRouteSelected as EventListener);` |
| 92 | `reload-locations` | `src/domains/content/hooks/use-database-sync.ts:241` | `window.addEventListener('reload-locations', handleReloadRequest);` |
| 93 | `locations-updated` | `src/domains/content/hooks/use-database-sync.ts:242` | `window.addEventListener('locations-updated', handleReloadRequest);` |
| 94 | `nearby-marker-clicked` | `src/domains/content/components/PointContextActions.tsx:244` | `window.addEventListener('nearby-marker-clicked', handler);` |
| 95 | `location:enriched` | `src/domains/content/hooks/use-enrichment-failure.ts:194` | `window.addEventListener('location:enriched', (e: Event) => {` |
| 96 | `collection-items-changed` | `src/domains/content/lib/orphan-points.ts:133` | `window.addEventListener('collection-items-changed', handler);` |
| 97 | `collections-updated` | `src/domains/content/lib/orphan-points.ts:134` | `window.addEventListener('collections-updated', handler);` |
| 98 | `locations-updated` | `src/domains/content/lib/orphan-points.ts:135` | `window.addEventListener('locations-updated', handler);` |
| 99 | `document:view-on-map` | `src/domains/content/hooks/use-document-focus.ts:54` | `window.addEventListener('document:view-on-map', handler as EventListener);` |
| 100 | `collection-items-changed` | `src/domains/content/lib/collection-visibility.ts:197` | `window.addEventListener('collection-items-changed', handler as EventListener);` |
| 101 | `collections-updated` | `src/domains/content/lib/collection-visibility.ts:238` | `window.addEventListener('collections-updated', metaHandler as EventListener);` |

## 4. Inventory — Listeners removed (`window.removeEventListener`)

| # | Event | File:Line |
|---|---|---|
| 1 | `icon-library-changed` | `src/contexts/IconLibraryContext.tsx:51` |
| 2 | `vandits:open-upload` | `src/pages/Index.tsx:130` |
| 3 | `vandits:open-profile` | `src/pages/Index.tsx:131` |
| 4 | `admin:open-geography` | `src/pages/Index.tsx:132` |
| 5 | `admin:open-data-sources` | `src/pages/Index.tsx:133` |
| 6 | `enrichment-criteria-changed` | `src/pages/Index.tsx:181` |
| 7 | `import:open-categories` | `src/pages/Index.tsx:187` |
| 8 | `lovable:follow-changed` | `src/pages/Index.tsx:197` |
| 9 | `pending-validations-updated` | `src/pages/Index.tsx:206` |
| 10 | `popup-action` | `src/pages/Index.tsx:212` |
| 11 | `layer-visibility-changed` | `src/test/layer-visibility.test.ts:123` |
| 12 | `enrichment-criteria-changed` | `src/components/LocationMap.tsx:525` |
| 13 | `map-go-home` | `src/components/LocationMap.tsx:527` |
| 14 | `map-set-theme` | `src/components/LocationMap.tsx:528` |
| 15 | `map-fit-bounds` | `src/components/LocationMap.tsx:529` |
| 16 | `measurement-units-changed` | `src/components/LocationMap.tsx:530` |
| 17 | `map-reset-view` | `src/components/LocationMap.tsx:531` |
| 18 | `map-show-insert-preview` | `src/components/LocationMap.tsx:532` |
| 19 | `map-hide-insert-preview` | `src/components/LocationMap.tsx:533` |
| 20 | `map-show-preview-markers` | `src/components/LocationMap.tsx:534` |
| 21 | `map-clear-preview-markers` | `src/components/LocationMap.tsx:535` |
| 22 | `map-show-nearby-ref` | `src/components/LocationMap.tsx:536` |
| 23 | `map-clear-nearby-ref` | `src/components/LocationMap.tsx:537` |
| 24 | `nearby-highlight-marker` | `src/components/LocationMap.tsx:538` |
| 25 | `map-show-import-preview-routes` | `src/components/LocationMap.tsx:539` |
| 26 | `map-clear-import-preview-routes` | `src/components/LocationMap.tsx:540` |
| 27 | `map-fly-to` | `src/components/LocationMap.tsx:541` |
| 28 | `itinerary-focus` | `src/components/LocationMap.tsx:542` |
| 29 | `map-show-route` | `src/components/LocationMap.tsx:644` |
| 30 | `map-clear-route` | `src/components/LocationMap.tsx:645` |
| 31 | `map-show-advisor-preview` | `src/components/LocationMap.tsx:646` |
| 32 | `map-clear-advisor-preview` | `src/components/LocationMap.tsx:647` |
| 33 | `map-show-journey-preview` | `src/components/LocationMap.tsx:648` |
| 34 | `map-clear-journey-preview` | `src/components/LocationMap.tsx:649` |
| 35 | `route-alternative-hover` | `src/components/LocationMap.tsx:650` |
| 36 | `map-show-editable-waypoints` | `src/components/LocationMap.tsx:651` |
| 37 | `map-clear-editable-waypoints` | `src/components/LocationMap.tsx:652` |
| 38 | `map-correction-mode` | `src/components/LocationMap.tsx:653` |
| 39 | `itinerary-segment-selected` | `src/components/LocationMap.tsx:654` |
| 40 | `itinerary-point-selected` | `src/components/LocationMap.tsx:655` |
| 41 | `map-locate-toggle` | `src/components/LocationMap.tsx:1183` |
| 42 | `photo-focus` | `src/components/LocationMap.tsx:1589` |
| 43 | `location-realtime-update` | `src/components/LocationMap.tsx:2107` |
| 44 | `lovable:owner-identity-updated` | `src/components/LocationMap.tsx:2141` |
| 45 | `map-render-mode-changed` | `src/components/LocationMap.tsx:2211` |
| 46 | `resize` | `src/components/LocationMap.tsx:2667` |
| 47 | `vandits:show-welcome` | `src/components/LocationMap.tsx:2679` |
| 48 | `duplicate-threshold-changed` | `src/hooks/use-duplicate-count.ts:37` |
| 49 | `keydown` | `src/components/ui/sidebar.tsx:88` |
| 50 | `collection-visibility-changed` | `src/test/collection-visibility.test.ts:112` |
| 51 | `collection-items-changed` | `src/components/CollectionsListPanel.tsx:359` |
| 52 | `map-locate-state` | `src/components/FloatingToolbar.tsx:153` |
| 53 | `map-route-selected` | `src/components/RoutesListPanel.tsx:508` |
| 54 | `itinerary-map-point-clicked` | `src/components/RoutesListPanel.tsx:535` |
| 55 | `map-route-selected` | `src/domains/routes/hooks/use-route-orchestration.ts:233` |
| 56 | `route:toggle-visibility` | `src/domains/routes/hooks/use-route-focus-bus.ts:78` |
| 57 | `route:focus` | `src/domains/routes/hooks/use-route-focus-bus.ts:98` |
| 58 | `map-waypoint-dragged` | `src/components/RouteBuilder.tsx:623` |
| 59 | `map-waypoint-insert` | `src/components/RouteBuilder.tsx:624` |
| 60 | `map-segment-corrected` | `src/components/RouteBuilder.tsx:685` |
| 61 | `map-segment-correction-error` | `src/components/RouteBuilder.tsx:686` |
| 62 | `map-segment-correction-start` | `src/components/RouteBuilder.tsx:687` |
| 63 | `route-alternative-selected` | `src/components/RouteBuilder.tsx:989` |
| 64 | `route-alternative-hover` | `src/components/RouteBuilder.tsx:999` |
| 65 | `personal-categories:reload` | `src/components/PersonalCategoriesPanel.tsx:117` |
| 66 | `lovable:image-recovery-job-tick` | `src/components/admin/RecoverImagesPanel.tsx:260` |
| 67 | `location-realtime-update` | `src/components/admin/RecoverImagesPanel.tsx:261` |
| 68 | `location-realtime-update` | `src/components/map/useEnrichmentTracker.ts:140` |
| 69 | `lovable:owner-identity-updated` | `src/components/UsersSidebar.tsx:117` |
| 70 | `lovable:open-users-sidebar` | `src/components/UsersSidebar.tsx:134` |
| 71 | `visited-updated` | `src/components/map/map-popup-handlers.ts:285` |
| 72 | `rating-updated` | `src/components/map/map-popup-handlers.ts:341` |
| 73 | `notes-updated` | `src/components/map/map-popup-handlers.ts:373` |
| 74 | `photo-updated` | `src/components/map/map-popup-handlers.ts:456` |
| 75 | `location-realtime-update` | `src/components/map/use-coalesced-realtime-tick.ts:109` |
| 76 | `location:enriched` | `src/components/map/use-coalesced-realtime-tick.ts:110` |
| 77 | `store-updated` | `src/components/map/use-coalesced-realtime-tick.ts:111` |
| 78 | `trash-updated` | `src/components/UserMenu.tsx:195` |
| 79 | `focus` | `src/components/UserMenu.tsx:196` |
| 80 | `lovable:profile-updated` | `src/domains/identity/hooks/use-auth.ts:97` |
| 81 | `document:open-workspace` | `src/domains/content/components/DocumentsPanel.tsx:157` |
| 82 | `document:processing-step` | `src/domains/content/components/ImportSummaryDialog.tsx:134` |
| 83 | `document:processed` | `src/domains/content/components/ImportSummaryDialog.tsx:135` |
| 84 | `trash-updated` | `src/domains/content/components/DocumentFocusView.tsx:318` |
| 85 | `locations-updated` | `src/domains/content/components/DocumentFocusView.tsx:319` |
| 86 | `location:enriched` | `src/domains/content/components/DocumentFocusView.tsx:338` |
| 87 | `location:moved` | `src/domains/content/components/DocumentFocusView.tsx:362` |
| 88 | `route:focus` | `src/domains/content/components/DocumentFocusView.tsx:389` |
| 89 | `map-route-selected` | `src/domains/content/components/DocumentFocusView.tsx:390` |
| 90 | `reload-locations` | `src/domains/content/hooks/use-database-sync.ts:249` |
| 91 | `locations-updated` | `src/domains/content/hooks/use-database-sync.ts:250` |
| 92 | `nearby-marker-clicked` | `src/domains/content/components/PointContextActions.tsx:245` |
| 93 | `document:view-on-map` | `src/domains/content/hooks/use-document-focus.ts:55` |
| 94 | `collection-items-changed` | `src/domains/content/lib/collection-visibility.ts:196` |
| 95 | `collections-updated` | `src/domains/content/lib/collection-visibility.ts:237` |

## 5. Cleanup audit — listeners sin `removeEventListener` correspondiente

Heurística: nombre de evento con `addEventListener` pero sin `removeEventListener` en cualquier archivo.

| Event | #adds | #removes | Files emiten add |
|---|---|---|---|
| `collection-items-changed` | 4 | 2 | src/components/CollectionsListPanel.tsx, src/domains/content/lib/collection-visibility.ts, src/domains/content/lib/orphan-points.ts, src/domains/content/store/location-collections-store.ts |
| `collection-visibility-changed` | 2 | 1 | src/domains/content/store/locations-store.ts, src/test/collection-visibility.test.ts |
| `collections-updated` | 3 | 1 | src/domains/content/lib/collection-visibility.ts, src/domains/content/lib/orphan-points.ts, src/domains/content/store/location-collections-store.ts |
| `location:enriched` | 3 | 2 | src/components/map/use-coalesced-realtime-tick.ts, src/domains/content/components/DocumentFocusView.tsx, src/domains/content/hooks/use-enrichment-failure.ts |
| `locations-updated` | 3 | 2 | src/domains/content/components/DocumentFocusView.tsx, src/domains/content/hooks/use-database-sync.ts, src/domains/content/lib/orphan-points.ts |
| `orphan-points-changed` | 1 | 0 | src/domains/content/store/locations-store.ts |

## 6. Namespacing — distribución por prefijo

| Namespace | Count |
|---|---|
| `map` | 54 |
| `document` | 11 |
| `reload` | 10 |
| `route` | 9 |
| `store` | 8 |
| `locations` | 8 |
| `trash` | 7 |
| `lovable` | 6 |
| `location` | 5 |
| `photo` | 5 |
| `open` | 5 |
| `routes` | 5 |
| `itinerary` | 4 |
| `visited` | 4 |
| `collection` | 4 |
| `vandits` | 4 |
| `collections` | 3 |
| `rating` | 2 |
| `admin` | 2 |
| `enrichment` | 2 |
| `icon` | 1 |
| `duplicate` | 1 |
| `nearby` | 1 |
| `popup` | 1 |
| `notes` | 1 |
| `personal-categories` | 1 |
| `measurement` | 1 |

## 7. High-risk findings

- **Coexistencia `map-fit-bounds` (10 emisores) vs `requestSubsetFit` (7 callers)**. Dos buses paralelos para la misma intención (mover cámara). El primero NO atraviesa cooldown/clamp del subset-fit-contract. Ya cubierto por **BL-015**. Emisores `map-fit-bounds`: `pages/Index.tsx:455,466`, `domains/routes/hooks/use-route-focus-bus.ts:26,48`, `components/SegmentBreakdown.tsx:272`, `components/CollectionFocusView.tsx:96`, `domains/content/components/DocumentFocusView.tsx:292`, `DocumentContentManager.tsx:179`, `DocumentsPanel.tsx:287`, `OrphanFocusView.tsx:72`, `DuplicatesList.tsx:346`.
- **Mezcla namespaces**: convive `lovable:*`, `vandits:*`, `admin:*`, `document:*`, `map-*`, `map:*`, sin namespacing y `routes:*`, `locations:*`, `collections:*`. No hay registro central. Cualquier rename rompe consumidores silenciosamente.
- **Eventos con cleanup faltante** — ver tabla §5. Riesgo de listeners duplicados al re-montar componentes (StrictMode dev + remounts en producción tras hot-reload de tabs).
- **Eventos `*-updated` / `*:changed` redundantes**: `locations-updated`, `locations:changed`, `locations:refresh`, `reload-locations`, `location-realtime-update`, `store-updated`. Cuatro o cinco caminos para "vuelve a cargar locations". Candidate backlog item — no creado en esta pasada por solapamiento parcial con BL-015.
- **`map-fit-bounds` se emite con shapes distintos** (`{bounds, padding, maxZoom}` vs `{bounds, padding}` vs `{detail:{...}}` con paddings inconsistentes [50,50] / [60,60] / [80,80] / [24,24]). Sin contrato de payload.
- **`lovable:owner-identity-updated`** está bien contenido (emisor único: `stores/owner-identity-store.ts`, listeners en `LocationMap.tsx` + `UsersSidebar.tsx`). Ejemplo de buena práctica frente al resto.

## 8. Cross-references
- Contracts: `subset-fit-contract`, `popup-contract`.
- Memory: `mem://logic/map/subset-fit-contract`, `mem://architecture/event-bus-ui-sync`.
- Backlog cubre: BL-002 (`requestSubsetFit` cooldown), BL-015 (unificación buses), BL-018 (event/timing registry).
- Audits previos: `duplicate-listeners-audit.md`, `global-guards-audit.md`.
