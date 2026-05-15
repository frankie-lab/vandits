# Constants & Thresholds — Exhaustive Inventory

_Generated: 2026-05-15  •  Scope: `src/`  •  Doc-only_

## 1. Methodology

```
rg -nP '\bz(?:oom)?\s*[<>=]=?\s*\d+|maxZoom|minZoom|zoomLevel' src/
rg -n 'setTimeout\(|setInterval\(|debounce\(|throttle\(' src/
rg -n 'padding:\s*\[|maxBoundsViscosity|clusterRadius|opacity:|zIndex:|z-index' src/
rg -n 'map\.(on|off)\(|marker\.(on|off)\(' src/
```
Categorías separadas. Una fila por ocurrencia.


## 2. Zoom thresholds & comparisons

Total: 63.

| # | File:Line | Snippet |
|---|---|---|
| 1 | `src/hooks/use-layer-visibility.ts:156` | `const minZoom = layer.minVisibilityZooms.get(ctx.entityId);` |
| 2 | `src/hooks/use-layer-visibility.ts:157` | `if (minZoom != null && zoom < minZoom) return HIDDEN;` |
| 3 | `src/pages/Index.tsx:456` | `detail: { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], padding: [60, 60], maxZoom: 14 },` |
| 4 | `src/pages/Index.tsx:467` | `detail: { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], padding: [60, 60], maxZoom: 14 },` |
| 5 | `src/lib/geocoding.ts:121` | ``https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,` |
| 6 | `src/lib/geocoding.ts:167` | ``https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,` |
| 7 | `src/components/CollectionFocusView.tsx:99` | `padding: [60, 60], maxZoom: 14,` |
| 8 | `src/test/poi-layer.test.ts:100` | `it('visible cuando capa app on, grupo no muteado, zoom >= 6', () => {` |
| 9 | `src/test/poi-layer.test.ts:123` | `it('visible cuando capa on, sourceId no muteado, zoom >= 8', () => {` |
| 10 | `src/components/toolbar/use-my-catalog-popover-fit.ts:13` | `*   - Sin `minZoom`: el subset puede ser disperso y requerir z<7 para verse íntegro.` |
| 11 | `src/components/LocationMap.tsx:328` | `maxZoom?: number;` |
| 12 | `src/components/LocationMap.tsx:331` | `const { bounds, padding = [50, 50], maxZoom = 18 } = customEvent.detail;` |
| 13 | `src/components/LocationMap.tsx:338` | `maxZoom,` |
| 14 | `src/components/LocationMap.tsx:403` | `mapRef.current.fitBounds(bounds, { padding: [80, 80], animate: true, maxZoom: 14 });` |
| 15 | `src/components/LocationMap.tsx:809` | `maxZoom: 16,` |
| 16 | `src/components/LocationMap.tsx:821` | `maxZoom: 16,` |
| 17 | `src/components/LocationMap.tsx:1135` | `// (proximity-based detection: <150m and zoom >= 13).` |
| 18 | `src/components/LocationMap.tsx:1331` | `minZoom: safeMinZoom,` |
| 19 | `src/components/LocationMap.tsx:1346` | `if (zoom <= 5) w = '1px';` |
| 20 | `src/components/LocationMap.tsx:1347` | `else if (zoom <= 9) w = '1.5px';` |
| 21 | `src/components/LocationMap.tsx:1348` | `else if (zoom <= 12) w = '2px';` |
| 22 | `src/components/LocationMap.tsx:1349` | `else if (zoom <= 15) w = '2.5px';` |
| 23 | `src/components/LocationMap.tsx:1480` | `maxZoom: 19,` |
| 24 | `src/components/LocationMap.tsx:1860` | `maxZoom: 12` |
| 25 | `src/components/LocationMap.tsx:2313` | `map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 14, duration: 0.6 });` |
| 26 | `src/components/LocationMap.tsx:2321` | `map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 14, duration: 0.6 });` |
| 27 | `src/components/LocationMap.tsx:2422` | `const minZoomFloor =` |
| 28 | `src/components/LocationMap.tsx:2423` | `typeof detail.minZoom === 'number' && Number.isFinite(detail.minZoom)` |
| 29 | `src/components/LocationMap.tsx:2424` | `? detail.minZoom` |
| 30 | `src/components/LocationMap.tsx:2428` | `if (minZoomFloor == null) return;` |
| 31 | `src/components/LocationMap.tsx:2429` | `if (map.getZoom() < minZoomFloor) {` |
| 32 | `src/components/LocationMap.tsx:2430` | `map.setZoom(minZoomFloor);` |
| 33 | `src/components/LocationMap.tsx:2439` | `const target = Math.max(map.getZoom(), FIT_CLAMP_ZOOM, minZoomFloor ?? 0);` |
| 34 | `src/components/LocationMap.tsx:2456` | `const fitOpts: L.FitBoundsOptions = { padding, maxZoom: FIT_CLAMP_ZOOM };` |
| 35 | `src/components/LocationMap.tsx:2463` | `const finalZoom = minZoomFloor != null ? Math.max(clamped, minZoomFloor) : clamped;` |
| 36 | `src/components/LocationMap.tsx:2506` | `// vean a cualquier zoom (el bounds del subset puede caer en z<7).` |
| 37 | `src/components/DuplicatesList.tsx:353` | `maxZoom: 20,` |
| 38 | `src/components/map/viewport-culling.ts:24` | `return zoom >= 7;` |
| 39 | `src/components/map/viewport-culling.ts:28` | `if (zoom >= 12) return 0.5;` |
| 40 | `src/components/map/viewport-culling.ts:29` | `if (zoom >= 9) return 0.75;` |
| 41 | `src/components/map/viewport-culling.ts:30` | `if (zoom >= 7) return 1.0;` |
| 42 | `src/components/OrphanFocusView.tsx:75` | `padding: [60, 60], maxZoom: 14,` |
| 43 | `src/components/SegmentBreakdown.tsx:272` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', { detail: { bounds, padding: [80, 80], maxZoom: 14 } }));` |
| 44 | `src/components/map/map-routes.ts:768` | `mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], maxZoom: 10, animate: true });` |
| 45 | `src/components/map/map-layer-groups.ts:71` | `* aunque el bounds calculado caiga por debajo del gate (z<7).` |
| 46 | `src/components/map/map-layer-groups.ts:108` | `const minZoom = layer.minVisibilityZooms.get(entityId);` |
| 47 | `src/components/map/map-layer-groups.ts:109` | `if (minZoom != null && zoom < minZoom) {` |
| 48 | `src/components/discovery/use-health-filter-fit.ts:75` | `minZoom: 7,` |
| 49 | `src/components/map/subset-fit.ts:34` | `minZoom?: number \| null;` |
| 50 | `src/components/map/subset-fit.ts:49` | `/** Piso de zoom opcional. Ver SubsetFitDetail.minZoom. */` |
| 51 | `src/components/map/subset-fit.ts:50` | `minZoom?: number \| null;` |
| 52 | `src/components/map/subset-fit.ts:70` | `minZoom: opts.minZoom ?? null,` |
| 53 | `src/components/discovery/HealthRepairPreviewDialog.tsx:108` | `minZoom: 7,` |
| 54 | `src/domains/routes/hooks/use-route-focus-bus.ts:33` | `maxZoom: 14,` |
| 55 | `src/domains/routes/hooks/use-route-focus-bus.ts:55` | `maxZoom: 14,` |
| 56 | `src/components/UsersSidebar.tsx:386` | `// Sin minZoom floor: queremos ver TODOS los puntos del owner aunque` |
| 57 | `src/components/UsersSidebar.tsx:387` | `// el bounds requiera z<7. El bypass de zoom-gate en` |
| 58 | `src/domains/content/components/DocumentContentManager.tsx:186` | `maxZoom: 16,` |
| 59 | `src/domains/content/components/DocumentsPanel.tsx:288` | `detail: { bounds, padding: [60, 60], maxZoom: 15 },` |
| 60 | `src/domains/content/components/DocumentFocusView.tsx:299` | `maxZoom: 15,` |
| 61 | `src/domains/content/components/UploadPreviewDialog.tsx:283` | `center: [20, 0], zoom: safeMinZoom, minZoom: safeMinZoom,` |
| 62 | `src/domains/content/components/UploadPreviewDialog.tsx:292` | `attribution: tileConfig.attribution, maxZoom: 19, noWrap: true, updateWhenIdle: true,` |
| 63 | `src/domains/content/components/UploadPreviewDialog.tsx:355` | `if (bounds.isValid()) { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 }); requestAnimationFrame(forcePreviewTilesVisible); }` |

## 3. Timing — setTimeout / setInterval / debounce / throttle

Total: 71.

| # | File:Line | Snippet |
|---|---|---|
| 1 | `src/stores/duplicate-store.ts:239` | `setTimeout(() => {` |
| 2 | `src/pages/Index.tsx:193` | `await new Promise(resolve => setTimeout(resolve, 500));` |
| 3 | `src/lib/sounds.ts:171` | `setTimeout(() => {` |
| 4 | `src/shared/operations/heavy-operations-store.ts:124` | `const handle = setTimeout(() => {` |
| 5 | `src/shared/operations/heavy-operations-store.ts:197` | `const handle = setTimeout(() => {` |
| 6 | `src/shared/operations/heavy-operations-store.ts:225` | `const handle = setTimeout(() => {` |
| 7 | `src/stores/geocoding-job-store.ts:181` | `pollTimer = setInterval(async () => {` |
| 8 | `src/shared/geography/geocode-batch.ts:87` | `await new Promise((r) => setTimeout(r, 1100));` |
| 9 | `src/lib/ip-geolocation.ts:55` | `const timer = window.setTimeout(() => controller.abort(), timeoutMs);` |
| 10 | `src/shared/enrichment/image-search-providers.ts:20` | `const timeout = setTimeout(() => controller.abort(), timeoutMs);` |
| 11 | `src/lib/geocoding.ts:115` | `return new Promise(resolve => setTimeout(resolve, ms));` |
| 12 | `src/shared/loading/loading-bus.ts:68` | `const id = window.setInterval(handler, 250);` |
| 13 | `src/shared/loading/CatalogLoadingCard.tsx:76` | `const id = window.setInterval(() => force((x) => x + 1), 500);` |
| 14 | `src/shared/progress/EnrichmentLane.tsx:125` | `refreshTimerRef.current = window.setTimeout(() => {` |
| 15 | `src/shared/progress/EnrichmentLane.tsx:173` | `setTimeout(() => setShowCompleted(false), 5000);` |
| 16 | `src/shared/progress/EnrichmentLane.tsx:188` | `const interval = setInterval(fetchJobStatus, 2000);` |
| 17 | `src/hooks/use-toast.ts:60` | `const timeout = setTimeout(() => {` |
| 18 | `src/components/AuditPanel.tsx:322` | `await new Promise(r => setTimeout(r, 100));` |
| 19 | `src/components/AdminPanel.tsx:204` | `const progressInterval = setInterval(() => {` |
| 20 | `src/components/AdminPanel.tsx:232` | `setTimeout(() => {` |
| 21 | `src/components/FloatingToolbar.tsx:290` | `const interval = setInterval(checkSolarTime, 60000);` |
| 22 | `src/components/FloatingToolbar.tsx:400` | `const interval = setInterval(fetchJobStatus, 2000);` |
| 23 | `src/components/LocationMap.tsx:932` | `setTimeout(() => zoomToBounds(immediate, 1), immediate ? 50 : 800);` |
| 24 | `src/components/LocationMap.tsx:1039` | `const ipFallbackTimer = window.setTimeout(() => {` |
| 25 | `src/components/LocationMap.tsx:1235` | `setTimeout(() => {` |
| 26 | `src/components/LocationMap.tsx:1241` | `setTimeout(() => {` |
| 27 | `src/components/LocationMap.tsx:2586` | `setTimeout(() => {` |
| 28 | `src/components/LocationMap.tsx:2699` | `const id = window.setTimeout(() => {` |
| 29 | `src/components/RoutesListPanel.tsx:531` | `setTimeout(() => setHighlightedPointId(null), 2000);` |
| 30 | `src/components/RoutesListPanel.tsx:625` | `setTimeout(() => setHighlightedPointId(null), 2000);` |
| 31 | `src/domains/identity/hooks/use-auth.ts:59` | `setTimeout(() => {` |
| 32 | `src/components/map/useEnrichmentTracker.ts:100` | `window.setTimeout(() => {` |
| 33 | `src/components/map/useEnrichmentTracker.ts:118` | `window.setTimeout(() => {` |
| 34 | `src/components/map/useEnrichmentTracker.ts:128` | `timer = window.setTimeout(flush, COALESCE_MS);` |
| 35 | `src/components/RouteBuilder.tsx:555` | `const timer = setTimeout(() => {` |
| 36 | `src/components/RouteBuilder.tsx:866` | `geoSearchTimer.current = setTimeout(async () => {` |
| 37 | `src/components/RouteBuilder.tsx:883` | `geoSearchTimer.current = setTimeout(async () => {` |
| 38 | `src/components/map/use-coalesced-realtime-tick.ts:59` | `timer = window.setTimeout(() => {` |
| 39 | `src/components/map/popup-recovery-mount.ts:37` | `setTimeout(() => {` |
| 40 | `src/components/map/map-routes.ts:1354` | `highlightTimeout = setTimeout(() => {` |
| 41 | `src/components/UserProfileEditor.tsx:579` | `addressSearchTimerRef.current = setTimeout(async () => {` |
| 42 | `src/domains/content/lib/db-transformers.ts:66` | `await new Promise((r) => setTimeout(r, 500 * attempt));` |
| 43 | `src/domains/content/hooks/use-popup-actions.ts:246` | `setTimeout(() => {` |
| 44 | `src/domains/content/hooks/use-popup-actions.ts:257` | `setTimeout(() => {` |
| 45 | `src/domains/content/hooks/use-popup-actions.ts:266` | `setTimeout(() => {` |
| 46 | `src/domains/content/hooks/use-popup-actions.ts:304` | `setTimeout(() => {` |
| 47 | `src/domains/content/hooks/use-popup-actions.ts:313` | `setTimeout(() => {` |
| 48 | `src/domains/content/hooks/use-popup-actions.ts:379` | `setTimeout(() => {` |
| 49 | `src/domains/content/hooks/use-popup-actions.ts:602` | `setTimeout(() => {` |
| 50 | `src/domains/content/lib/collection-visibility.ts:256` | `rebuildDebounceTimer = setTimeout(async () => {` |
| 51 | `src/components/discovery/use-selection-fit-on-start.ts:45` | `timeoutRef.current = window.setTimeout(() => {` |
| 52 | `src/domains/content/hooks/use-database-sync.ts:160` | `await new Promise(resolve => setTimeout(resolve, 0));` |
| 53 | `src/domains/content/hooks/use-database-sync.ts:229` | `setTimeout(() => {` |
| 54 | `src/domains/content/hooks/use-enrichment-failure.ts:223` | `this.resyncTimer = setTimeout(() => {` |
| 55 | `src/domains/content/components/DocumentFocusView.tsx:291` | `setTimeout(() => {` |
| 56 | `src/domains/content/components/DocumentFocusView.tsx:372` | `setTimeout(() => {` |
| 57 | `src/domains/content/components/DocumentFocusView.tsx:376` | `setTimeout(() => setHighlightedRouteId(null), 2500);` |
| 58 | `src/domains/content/components/DocumentFocusView.tsx:778` | `await new Promise(r => setTimeout(r, 100));` |
| 59 | `src/domains/content/components/DocumentFocusView.tsx:978` | `setTimeout(() => onBack(), 150);` |
| 60 | `src/domains/content/components/DocumentContentManager.tsx:138` | `setTimeout(() => {` |
| 61 | `src/components/admin/GeographyBackfillPanel.tsx:189` | `const id = setInterval(() => forceTick((t) => t + 1), 1000);` |
| 62 | `src/components/admin/GeographyBackfillPanel.tsx:294` | `const t = setTimeout(() => {` |
| 63 | `src/components/admin/RecoverImagesPanel.tsx:251` | `timer = setTimeout(() => {` |
| 64 | `src/components/admin/RecoverImagesPanel.tsx:352` | `scopeTimer.current = window.setTimeout(async () => {` |
| 65 | `src/components/admin/RecoverImagesPanel.tsx:379` | `const t = setTimeout(() => {` |
| 66 | `src/domains/content/components/FileUploadZone.tsx:345` | `const minSpinner = new Promise(r => setTimeout(r, 800));` |
| 67 | `src/domains/content/components/BackgroundScrapeJobs.tsx:144` | `const id = setInterval(() => setNowTick(n => n + 1), 1000);` |
| 68 | `src/domains/content/components/DocumentsPanel.tsx:264` | `await new Promise(resolve => setTimeout(resolve, 600));` |
| 69 | `src/domains/content/components/BatchEnrichmentPanel.tsx:144` | `const interval = setInterval(async () => {` |
| 70 | `src/domains/content/components/EnrichmentProgressIndicator.tsx:63` | `setTimeout(() => setShowCompleted(false), 3000);` |
| 71 | `src/domains/content/components/EnrichmentProgressIndicator.tsx:82` | `const interval = setInterval(() => {` |

## 4. Visual magic — padding, opacity, zIndex, cluster, viscosity

Total: 251.

| # | File:Line | Snippet |
|---|---|---|
| 1 | `src/components/MarkerStateRulesPanel.tsx:18` | `{ key: 'hover' as const, label: 'Hover', desc: 'Aclarar', defaults: { mix_percent: 25, shadow_blur: 8, shadow_opacity: 0.3, border_width: 2 } },` |
| 2 | `src/components/MarkerStateRulesPanel.tsx:19` | `{ key: 'selected' as const, label: 'Seleccionado', desc: 'Oscurecer', defaults: { mix_percent: 15, shadow_blur: 6, shadow_opacity: 0.25, border_width: 2.5 } },` |
| 3 | `src/components/MarkerStateRulesPanel.tsx:20` | `{ key: 'focused' as const, label: 'Enfocado', desc: 'Énfasis', defaults: { mix_percent: 30, shadow_blur: 12, shadow_opacity: 0.4, border_width: 3 } },` |
| 4 | `src/components/MarkerStateRulesPanel.tsx:21` | `{ key: 'recent' as const, label: 'Reciente', desc: 'Selección', defaults: { mix_percent: 20, shadow_blur: 10, shadow_opacity: 0.35, border_width: 2 } },` |
| 5 | `src/index.css:5` | `+ radius + z-index + reduced-motion. Source of truth lives in` |
| 6 | `src/index.css:235` | `from { opacity: 0; }` |
| 7 | `src/index.css:236` | `to { opacity: 1; }` |
| 8 | `src/index.css:240` | `from { opacity: 0; transform: translateY(16px); }` |
| 9 | `src/index.css:241` | `to { opacity: 1; transform: translateY(0); }` |
| 10 | `src/index.css:245` | `from { opacity: 0; transform: scale(0.96); }` |
| 11 | `src/index.css:246` | `to { opacity: 1; transform: scale(1); }` |
| 12 | `src/index.css:341` | `opacity: 0.8;` |
| 13 | `src/index.css:345` | `opacity: 0;` |
| 14 | `src/index.css:350` | `z-index: 3000 !important;` |
| 15 | `src/index.css:366` | `opacity: 0.8;` |
| 16 | `src/index.css:504` | `z-index: 1;` |
| 17 | `src/index.css:515` | `z-index: 0;` |
| 18 | `src/index.css:520` | `opacity: 0.7;` |
| 19 | `src/index.css:543` | `opacity: 0.85;` |
| 20 | `src/domains/v2/marker-types.ts:41` | `zIndex: number;` |
| 21 | `src/hooks/use-right-panel.ts:6` | `* z-index/overlap bugs that were caused by multiple independent boolean` |
| 22 | `src/hooks/use-layer-visibility.ts:36` | `opacity: number;` |
| 23 | `src/hooks/use-layer-visibility.ts:145` | `const HIDDEN: VisibilityResult = { opacity: 0, pointerEvents: 'none' };` |
| 24 | `src/hooks/use-layer-visibility.ts:146` | `const VISIBLE: VisibilityResult = { opacity: 1, pointerEvents: 'auto' };` |
| 25 | `src/components/LocationMap.tsx:312` | `mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });` |
| 26 | `src/components/LocationMap.tsx:365` | `mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });` |
| 27 | `src/components/LocationMap.tsx:396` | `marker.bindTooltip(buildHoverTooltipHtml(location), { direction: 'top', offset: [0, -12], className: 'poi-hover-tooltip-wrap', opacity: 1 });` |
| 28 | `src/components/LocationMap.tsx:403` | `mapRef.current.fitBounds(bounds, { padding: [80, 80], animate: true, maxZoom: 14 });` |
| 29 | `src/components/LocationMap.tsx:808` | `padding: [50, 50],` |
| 30 | `src/components/LocationMap.tsx:820` | `padding: [50, 50],` |
| 31 | `src/components/LocationMap.tsx:1333` | `maxBoundsViscosity: 1.0, // Completely restrict panning outside bounds` |
| 32 | `src/components/LocationMap.tsx:1736` | `opacity: 1,` |
| 33 | `src/components/LocationMap.tsx:1859` | `padding: [50, 50],` |
| 34 | `src/components/LocationMap.tsx:2042` | `className: 'poi-hover-tooltip-wrap', opacity: 1,` |
| 35 | `src/components/LocationMap.tsx:2103` | `className: 'poi-hover-tooltip-wrap', opacity: 1,` |
| 36 | `src/components/LocationMap.tsx:2202` | `opacity: 1,` |
| 37 | `src/components/LocationMap.tsx:2271` | `layer.setStyle({ color: tint, opacity: 1, weight: (layer._baseWeight \|\| 4) + 1 });` |
| 38 | `src/components/LocationMap.tsx:2273` | `layer.setStyle({ color: layer._originalColor, weight: layer._baseWeight, opacity: layer._baseOpacity });` |
| 39 | `src/components/LocationMap.tsx:2313` | `map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 14, duration: 0.6 });` |
| 40 | `src/components/LocationMap.tsx:2321` | `map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 14, duration: 0.6 });` |
| 41 | `src/components/LocationMap.tsx:2710` | `initial={{ opacity: 0 }}` |
| 42 | `src/components/LocationMap.tsx:2711` | `animate={{ opacity: 1 }}` |
| 43 | `src/components/LocationMap.tsx:3117` | `z-index: 9999 !important;` |
| 44 | `src/components/FloatingPanel.tsx:82` | `initial={{ opacity: 0, x: position === 'left' ? -20 : 20 }}` |
| 45 | `src/components/FloatingPanel.tsx:83` | `animate={{ opacity: 1, x: 0 }}` |
| 46 | `src/components/FloatingPanel.tsx:84` | `exit={{ opacity: 0, x: position === 'left' ? -20 : 20 }}` |
| 47 | `src/shared/styles/tokens/z-index.css:23` | `* Uso desde CSS: `z-index: var(--z-modal);`` |
| 48 | `src/shared/styles/tokens/z-index.css:25` | `* Ver mem://style/tokens/z-index-scale.` |
| 49 | `src/components/LocationList.tsx:105` | `initial={{ opacity: 0, x: -20 }}` |
| 50 | `src/components/LocationList.tsx:106` | `animate={{ opacity: 1, x: 0 }}` |
| 51 | `src/components/LocationList.tsx:107` | `exit={{ opacity: 0, x: 20 }}` |
| 52 | `src/pages/Auth.tsx:232` | `initial={{ opacity: 0, y: 20 }}` |
| 53 | `src/pages/Auth.tsx:233` | `animate={{ opacity: 1, y: 0 }}` |
| 54 | `src/pages/Auth.tsx:274` | `initial={{ opacity: 0, x: 20 }}` |
| 55 | `src/pages/Auth.tsx:275` | `animate={{ opacity: 1, x: 0 }}` |
| 56 | `src/pages/Auth.tsx:337` | `initial={{ opacity: 0, y: 10 }}` |
| 57 | `src/pages/Auth.tsx:338` | `animate={{ opacity: 1, y: 0 }}` |
| 58 | `src/pages/Auth.tsx:339` | `exit={{ opacity: 0, y: -10 }}` |
| 59 | `src/pages/Index.tsx:456` | `detail: { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], padding: [60, 60], maxZoom: 14 },` |
| 60 | `src/pages/Index.tsx:467` | `detail: { bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], padding: [60, 60], maxZoom: 14 },` |
| 61 | `src/components/IntermodalSelector.tsx:235` | `initial={{ height: 0, opacity: 0 }}` |
| 62 | `src/components/IntermodalSelector.tsx:236` | `animate={{ height: 'auto', opacity: 1 }}` |
| 63 | `src/components/IntermodalSelector.tsx:237` | `exit={{ height: 0, opacity: 0 }}` |
| 64 | `src/components/ui/sonner.tsx:16` | `style={{ zIndex: 1050 }}` |
| 65 | `src/components/IncompleteLocationsPanel.tsx:219` | `initial={{ opacity: 0, y: 10 }}` |
| 66 | `src/components/IncompleteLocationsPanel.tsx:220` | `animate={{ opacity: 1, y: 0 }}` |
| 67 | `src/components/IncompleteLocationsPanel.tsx:221` | `exit={{ opacity: 0, x: -20 }}` |
| 68 | `src/components/DuplicatesList.tsx:352` | `padding: [100, 100],` |
| 69 | `src/components/DuplicatesList.tsx:436` | `initial={{ opacity: 0, y: 20 }}` |
| 70 | `src/components/DuplicatesList.tsx:437` | `animate={{ opacity: 1, y: 0 }}` |
| 71 | `src/components/DuplicatesList.tsx:438` | `exit={{ opacity: 0, y: 20 }}` |
| 72 | `src/components/DuplicatesList.tsx:605` | `initial={{ opacity: 0, y: 10 }}` |
| 73 | `src/components/DuplicatesList.tsx:606` | `animate={{ opacity: 1, y: 0 }}` |
| 74 | `src/components/DuplicatesList.tsx:681` | `initial={{ height: 0, opacity: 0 }}` |
| 75 | `src/components/DuplicatesList.tsx:682` | `animate={{ height: 'auto', opacity: 1 }}` |
| 76 | `src/components/DuplicatesList.tsx:683` | `exit={{ height: 0, opacity: 0 }}` |
| 77 | `src/domains/routes/hooks/use-route-focus-bus.ts:32` | `padding: [60, 60],` |
| 78 | `src/domains/routes/hooks/use-route-focus-bus.ts:54` | `padding: [60, 60],` |
| 79 | `src/shared/styles/motion-presets.ts:38` | `initial: { opacity: 0 },` |
| 80 | `src/shared/styles/motion-presets.ts:39` | `animate: { opacity: 1 },` |
| 81 | `src/shared/styles/motion-presets.ts:40` | `exit: { opacity: 0 },` |
| 82 | `src/shared/styles/motion-presets.ts:45` | `initial: { opacity: 0, scale: 0.96 },` |
| 83 | `src/shared/styles/motion-presets.ts:46` | `animate: { opacity: 1, scale: 1 },` |
| 84 | `src/shared/styles/motion-presets.ts:47` | `exit: { opacity: 0, scale: 0.96 },` |
| 85 | `src/shared/styles/motion-presets.ts:52` | `initial: { x: 24, opacity: 0 },` |
| 86 | `src/shared/styles/motion-presets.ts:53` | `animate: { x: 0, opacity: 1 },` |
| 87 | `src/shared/styles/motion-presets.ts:54` | `exit: { x: 24, opacity: 0 },` |
| 88 | `src/shared/styles/motion-presets.ts:59` | `initial: { x: -24, opacity: 0 },` |
| 89 | `src/shared/styles/motion-presets.ts:60` | `animate: { x: 0, opacity: 1 },` |
| 90 | `src/shared/styles/motion-presets.ts:61` | `exit: { x: -24, opacity: 0 },` |
| 91 | `src/shared/styles/motion-presets.ts:66` | `initial: { y: 16, opacity: 0 },` |
| 92 | `src/shared/styles/motion-presets.ts:67` | `animate: { y: 0, opacity: 1 },` |
| 93 | `src/shared/styles/motion-presets.ts:68` | `exit: { y: 16, opacity: 0 },` |
| 94 | `src/shared/styles/motion-presets.ts:74` | `hidden: { x: 24, opacity: 0 },` |
| 95 | `src/shared/styles/motion-presets.ts:75` | `visible: { x: 0, opacity: 1, transition: { duration: duration.slow, ease: easing.emphasized } },` |
| 96 | `src/shared/styles/motion-presets.ts:76` | `exit: { x: 24, opacity: 0, transition: { duration: duration.base, ease: easing.accel } },` |
| 97 | `src/shared/styles/motion-presets.ts:80` | `hidden: { opacity: 0 },` |
| 98 | `src/shared/styles/motion-presets.ts:81` | `visible: { opacity: 1, transition: { duration: duration.fast, ease: easing.standard } },` |
| 99 | `src/shared/styles/motion-presets.ts:82` | `exit: { opacity: 0, transition: { duration: duration.fast, ease: easing.accel } },` |
| 100 | `src/components/Header.tsx:53` | `initial={{ opacity: 0, y: -20 }}` |
| 101 | `src/components/Header.tsx:54` | `animate={{ opacity: 1, y: 0 }}` |
| 102 | `src/components/GalleryView.tsx:71` | `initial={{ opacity: 0 }}` |
| 103 | `src/components/GalleryView.tsx:72` | `animate={{ opacity: 1 }}` |
| 104 | `src/components/GalleryView.tsx:73` | `exit={{ opacity: 0 }}` |
| 105 | `src/components/GalleryView.tsx:123` | `initial={{ opacity: 0, scale: 0.9 }}` |
| 106 | `src/components/GalleryView.tsx:124` | `animate={{ opacity: 1, scale: 1 }}` |
| 107 | `src/components/GalleryView.tsx:178` | `initial={{ opacity: 0 }}` |
| 108 | `src/components/GalleryView.tsx:179` | `animate={{ opacity: 1 }}` |
| 109 | `src/components/GalleryView.tsx:180` | `exit={{ opacity: 0 }}` |
| 110 | `src/components/GalleryView.tsx:209` | `initial={{ opacity: 0, scale: 0.9 }}` |
| 111 | `src/components/GalleryView.tsx:210` | `animate={{ opacity: 1, scale: 1 }}` |
| 112 | `src/components/GalleryView.tsx:211` | `exit={{ opacity: 0, scale: 0.9 }}` |
| 113 | `src/components/FloatingToolbar.tsx:568` | `initial={{ opacity: 0, x: -20 }}` |
| 114 | `src/components/FloatingToolbar.tsx:569` | `animate={{ opacity: 1, x: 0 }}` |
| 115 | `src/components/FloatingToolbar.tsx:591` | `initial={{ opacity: 0, y: -20 }}` |
| 116 | `src/components/FloatingToolbar.tsx:592` | `animate={{ opacity: 1, y: 0 }}` |
| 117 | `src/components/FloatingToolbar.tsx:628` | `initial={{ opacity: 0, y: -20 }}` |
| 118 | `src/components/FloatingToolbar.tsx:629` | `animate={{ opacity: 1, y: 0 }}` |
| 119 | `src/components/CollectionFocusView.tsx:99` | `padding: [60, 60], maxZoom: 14,` |
| 120 | `src/test/marker-grammar.test.ts:126` | `zIndex: 200,` |
| 121 | `src/test/marker-grammar.test.ts:140` | `zIndex: 200,` |
| 122 | `src/test/marker-grammar.test.ts:152` | `zIndex: 100,` |
| 123 | `src/test/marker-grammar.test.ts:164` | `zIndex: 100,` |
| 124 | `src/test/marker-grammar.test.ts:177` | `zIndex: 1000,` |
| 125 | `src/test/marker-grammar.test.ts:191` | `zIndex: 100,` |
| 126 | `src/test/marker-grammar.test.ts:203` | `zIndex: 1000,` |
| 127 | `src/components/CollectionAppearanceDialog.tsx:126` | `style={{ border: `3px solid ${color}`, opacity: 0.95 }}` |
| 128 | `src/components/BottomProgressBar.tsx:57` | `animate={{ y: anyActive ? 0 : 120, opacity: anyActive ? 1 : 0 }}` |
| 129 | `src/components/AdminPanel.tsx:334` | `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-modal flex items-center justify-center bg-foregro` |
| 130 | `src/components/AdminPanel.tsx:335` | `<motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-xl shadow-2xl p-8 max-w-md mx-4 flex flex-col it` |
| 131 | `src/components/AdminPanel.tsx:345` | `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-modal flex items-center justify-center bg-foregro` |
| 132 | `src/components/AdminPanel.tsx:346` | `<motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-card rounded-xl shadow-2xl` |
| 133 | `src/components/AdminPanel.tsx:357` | `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}` |
| 134 | `src/components/AdminPanel.tsx:361` | `<motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}` |
| 135 | `src/components/AdminPanel.tsx:451` | `<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t overflow-hidden">` |
| 136 | `src/components/RoutesListPanel.tsx:437` | `opacity: isDragging ? 0.5 : 1,` |
| 137 | `src/components/RouteSettingsPanel.tsx:217` | `initial={{ opacity: 0 }}` |
| 138 | `src/components/RouteSettingsPanel.tsx:218` | `animate={{ opacity: 1 }}` |
| 139 | `src/components/RouteSettingsPanel.tsx:219` | `exit={{ opacity: 0 }}` |
| 140 | `src/components/RouteSettingsPanel.tsx:224` | `initial={{ scale: 0.95, opacity: 0 }}` |
| 141 | `src/components/RouteSettingsPanel.tsx:225` | `animate={{ scale: 1, opacity: 1 }}` |
| 142 | `src/components/RouteSettingsPanel.tsx:226` | `exit={{ scale: 0.95, opacity: 0 }}` |
| 143 | `src/components/map/useMarkerStateRules.ts:8` | `shadow_opacity: number; // 0-1` |
| 144 | `src/components/map/useMarkerStateRules.ts:22` | `hover: { mix_target: 'white', mix_percent: 25, shadow_blur: 8, shadow_opacity: 0.3, border_width: 2 },` |
| 145 | `src/components/map/useMarkerStateRules.ts:23` | `selected: { mix_target: 'black', mix_percent: 15, shadow_blur: 6, shadow_opacity: 0.25, border_width: 2.5 },` |
| 146 | `src/components/map/useMarkerStateRules.ts:24` | `focused: { mix_target: 'accent', mix_percent: 30, shadow_blur: 12, shadow_opacity: 0.4, border_width: 3 },` |
| 147 | `src/components/map/useMarkerStateRules.ts:25` | `recent: { mix_target: 'selection', mix_percent: 20, shadow_blur: 10, shadow_opacity: 0.35, border_width: 2 },` |
| 148 | `src/shared/components/ui/AppTooltip.tsx:5` | `* tipografía/motion/z-index del sistema. Misma flecha, sombra, radio y` |
| 149 | `src/components/OrphanFocusView.tsx:75` | `padding: [60, 60], maxZoom: 14,` |
| 150 | `src/components/RouteBuilder.tsx:223` | `initial={{ height: 0, opacity: 0 }}` |
| 151 | `src/components/RouteBuilder.tsx:224` | `animate={{ height: 'auto', opacity: 1 }}` |
| 152 | `src/components/RouteBuilder.tsx:225` | `exit={{ height: 0, opacity: 0 }}` |
| 153 | `src/components/RouteBuilder.tsx:1455` | `initial={{ height: 0, opacity: 0 }}` |
| 154 | `src/components/RouteBuilder.tsx:1456` | `animate={{ height: 'auto', opacity: 1 }}` |
| 155 | `src/components/RouteBuilder.tsx:1457` | `exit={{ height: 0, opacity: 0 }}` |
| 156 | `src/components/RouteBuilder.tsx:2029` | `<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}` |
| 157 | `src/components/UnresolvedLocationsPanel.tsx:447` | `initial={{ height: 0, opacity: 0 }}` |
| 158 | `src/components/UnresolvedLocationsPanel.tsx:448` | `animate={{ height: 'auto', opacity: 1 }}` |
| 159 | `src/components/UnresolvedLocationsPanel.tsx:449` | `exit={{ height: 0, opacity: 0 }}` |
| 160 | `src/components/TrashPanel.tsx:171` | `initial={{ opacity: 0, y: 20 }}` |
| 161 | `src/components/TrashPanel.tsx:172` | `animate={{ opacity: 1, y: 0 }}` |
| 162 | `src/components/TrashPanel.tsx:173` | `exit={{ opacity: 0, y: 20 }}` |
| 163 | `src/components/TrashPanel.tsx:239` | `initial={{ opacity: 0, x: -10 }}` |
| 164 | `src/components/TrashPanel.tsx:240` | `animate={{ opacity: 1, x: 0 }}` |
| 165 | `src/components/SemanticSearch.tsx:154` | `initial={{ opacity: 0, x: 20 }}` |
| 166 | `src/components/SemanticSearch.tsx:155` | `animate={{ opacity: 1, x: 0 }}` |
| 167 | `src/components/SemanticSearch.tsx:156` | `exit={{ opacity: 0, x: 20 }}` |
| 168 | `src/components/RoutePreferences.tsx:165` | `initial={{ height: 0, opacity: 0 }}` |
| 169 | `src/components/RoutePreferences.tsx:166` | `animate={{ height: 'auto', opacity: 1 }}` |
| 170 | `src/components/RoutePreferences.tsx:167` | `exit={{ height: 0, opacity: 0 }}` |
| 171 | `src/components/SegmentBreakdown.tsx:272` | `window.dispatchEvent(new CustomEvent('map-fit-bounds', { detail: { bounds, padding: [80, 80], maxZoom: 14 } }));` |
| 172 | `src/components/UsersSidebar.tsx:538` | `initial={{ x: -320, opacity: 0 }}` |
| 173 | `src/components/UsersSidebar.tsx:539` | `animate={{ x: 0, opacity: 1 }}` |
| 174 | `src/components/UsersSidebar.tsx:540` | `exit={{ x: -320, opacity: 0 }}` |
| 175 | `src/components/UsersSidebar.tsx:711` | `initial={{ opacity: 0, y: 10 }}` |
| 176 | `src/components/UsersSidebar.tsx:712` | `animate={{ opacity: 1, y: 0 }}` |
| 177 | `src/components/map/map-routes.ts:45` | `layer.setStyle({ opacity: 1, weight: layer._baseWeight + 2 });` |
| 178 | `src/components/map/map-routes.ts:47` | `layer.setStyle({ opacity: 0.18, weight: Math.max(layer._baseWeight - 1, 1) });` |
| 179 | `src/components/map/map-routes.ts:60` | `layer.setStyle({ opacity: 1, weight: (layer._baseWeight \|\| 4) + 2 });` |
| 180 | `src/components/map/map-routes.ts:62` | `layer.setStyle({ opacity: 0.18, weight: Math.max((layer._baseWeight \|\| 4) - 1, 1) });` |
| 181 | `src/components/map/map-routes.ts:73` | `layer.setStyle({ opacity: layer._baseOpacity, weight: layer._baseWeight });` |
| 182 | `src/components/map/map-routes.ts:297` | `opacity: 0.01,` |
| 183 | `src/components/map/map-routes.ts:307` | `opacity: baseOpacity,` |
| 184 | `src/components/map/map-routes.ts:335` | `polyline.setStyle({ opacity: 1, weight: baseWeight + 3 });` |
| 185 | `src/components/map/map-routes.ts:350` | `polyline.setStyle({ opacity: 1, weight: baseWeight + 2 });` |
| 186 | `src/components/map/map-routes.ts:352` | `polyline.setStyle({ opacity: 0.18, weight: Math.max(baseWeight - 1, 1) });` |
| 187 | `src/components/map/map-routes.ts:359` | `polyline.setStyle({ opacity: 0.18, weight: Math.max(baseWeight - 1, 1) });` |
| 188 | `src/components/map/map-routes.ts:361` | `polyline.setStyle({ opacity: 1, weight: baseWeight + 2 });` |
| 189 | `src/components/map/map-routes.ts:363` | `polyline.setStyle({ opacity: baseOpacity, weight: baseWeight });` |
| 190 | `src/components/map/map-routes.ts:433` | `opacity: ${isAlternative ? '0.6' : '1'};` |
| 191 | `src/components/map/map-routes.ts:546` | `z-index:9999;` |
| 192 | `src/components/map/map-routes.ts:635` | `mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [60, 60], animate: true });` |
| 193 | `src/components/map/map-routes.ts:700` | `opacity: 0.7,` |
| 194 | `src/components/map/map-routes.ts:719` | `mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], animate: true });` |
| 195 | `src/components/map/map-routes.ts:768` | `mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], maxZoom: 10, animate: true });` |
| 196 | `src/components/map/map-routes.ts:784` | `layer.setStyle({ opacity: layer._baseOpacity, weight: layer._baseWeight });` |
| 197 | `src/components/map/map-routes.ts:786` | `layer.setStyle({ opacity: 0.2, weight: layer._baseWeight });` |
| 198 | `src/components/map/map-routes.ts:788` | `layer.setStyle({ opacity: 1, weight: layer._baseWeight + 3 });` |
| 199 | `src/components/map/map-routes.ts:790` | `layer.setStyle({ opacity: 0.15, weight: layer._baseWeight });` |
| 200 | `src/components/map/map-routes.ts:1106` | `opacity: 0.5,` |
| 201 | `src/components/map/map-routes.ts:1119` | `opacity: 0.7,` |
| 202 | `src/components/map/map-routes.ts:1197` | `opacity: 0.5,` |
| 203 | `src/components/map/map-routes.ts:1344` | `0%,100% { transform: scale(1); opacity: 1; }` |
| 204 | `src/components/map/map-routes.ts:1345` | `50% { transform: scale(1.4); opacity: 0.4; }` |
| 205 | `src/components/map/map-icons.ts:264` | `const haloStyle = isOwn ? '' : 'opacity:0.85;';` |
| 206 | `src/components/map/map-icons.ts:270` | `html: `<div style="width:${microSize + 2}px;height:${microSize + 2}px;background:${fill};clip-path:polygon(0 0,100% 0,50% 100%);opacity:0.95;"></div>`,` |
| 207 | `src/components/map/map-icons.ts:281` | `html: `<div style="width:${s}px;height:${s}px;background:${APP_NEUTRAL_FILL};clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);opacity:0.95;"></div>`,` |
| 208 | `src/components/map/map-icons.ts:292` | `html: `<div style="width:${s}px;height:${s}px;background:${SOURCE_NEUTRAL_FILL};clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);opacity:0.95;"><` |
| 209 | `src/components/admin/design-system/token-grouping.ts:198` | `{ id: 'z-index',    label: 'Z-index',         section: 'advanced' },` |
| 210 | `src/domains/content/components/EnrichmentCriteriaEditor.tsx:261` | `initial={{ opacity: 0, y: 10 }}` |
| 211 | `src/domains/content/components/EnrichmentCriteriaEditor.tsx:262` | `animate={{ opacity: 1, y: 0 }}` |
| 212 | `src/domains/content/components/ExportPanel.tsx:134` | `initial={{ opacity: 0, y: -10 }}` |
| 213 | `src/domains/content/components/ExportPanel.tsx:135` | `animate={{ opacity: 1, y: 0 }}` |
| 214 | `src/domains/content/components/ExportPanel.tsx:153` | `initial={{ opacity: 0, height: 0 }}` |
| 215 | `src/domains/content/components/ExportPanel.tsx:154` | `animate={{ opacity: 1, height: 'auto' }}` |
| 216 | `src/domains/content/components/ExportPanel.tsx:155` | `exit={{ opacity: 0, height: 0 }}` |
| 217 | `src/domains/content/components/ExportPanel.tsx:168` | `initial={{ opacity: 0, height: 0 }}` |
| 218 | `src/domains/content/components/ExportPanel.tsx:169` | `animate={{ opacity: 1, height: 'auto' }}` |
| 219 | `src/domains/content/components/ExportPanel.tsx:170` | `exit={{ opacity: 0, height: 0 }}` |
| 220 | `src/domains/content/components/ExportPanel.tsx:260` | `initial={{ opacity: 0, height: 0 }}` |
| 221 | `src/domains/content/components/ExportPanel.tsx:261` | `animate={{ opacity: 1, height: 'auto' }}` |
| 222 | `src/domains/content/components/ExportPanel.tsx:262` | `exit={{ opacity: 0, height: 0 }}` |
| 223 | `src/components/admin/design-system/TokenRow.tsx:12` | `*  - No-color (radius, density, motion, typography, z-index, elevation):` |
| 224 | `src/domains/content/components/EnrichmentProgressIndicator.tsx:113` | `initial={{ opacity: 0, y: -10, scale: 0.95 }}` |
| 225 | `src/domains/content/components/EnrichmentProgressIndicator.tsx:114` | `animate={{ opacity: 1, y: 0, scale: 1 }}` |
| 226 | `src/domains/content/components/EnrichmentProgressIndicator.tsx:115` | `exit={{ opacity: 0, y: -10, scale: 0.95 }}` |
| 227 | `src/domains/content/components/FileUploadZone.tsx:532` | `initial={{ opacity: 0 }}` |
| 228 | `src/domains/content/components/FileUploadZone.tsx:533` | `animate={{ opacity: [0.4, 1, 0.4] }}` |
| 229 | `src/domains/content/components/DocumentContentManager.tsx:185` | `padding: [60, 60],` |
| 230 | `src/components/admin/DesignSystemPanel.tsx:33` | `import zindexTokens from '@/design-system/tokens/source/z-index.json';` |
| 231 | `src/components/admin/DesignSystemPanel.tsx:51` | `'z-index': zindexTokens,` |
| 232 | `src/components/admin/design-system/TokenPreviews.tsx:29` | `if (groupId === 'z-index') return <ZIndexTokenPreview row={row} />;` |
| 233 | `src/components/admin/design-system/TokenPreviews.tsx:453` | `title={`z-index: ${row.value}`}` |
| 234 | `src/components/admin/design-system/TokenPreviews.tsx:499` | `return <div className="text-xs text-muted-foreground">Leaflet pane z-index = {value}</div>;` |
| 235 | `src/domains/content/components/UploadPreviewDialog.tsx:284` | `maxBounds: worldBounds, maxBoundsViscosity: 1,` |
| 236 | `src/domains/content/components/UploadPreviewDialog.tsx:337` | `L.polyline(latLngs, { color: route.color \|\| 'hsl(var(--destructive))', weight: 3, opacity: 0.9 }).addTo(previewLayer);` |
| 237 | `src/domains/content/components/UploadPreviewDialog.tsx:355` | `if (bounds.isValid()) { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 }); requestAnimationFrame(forcePreviewTilesVisible); }` |
| 238 | `src/domains/content/components/UploadPreviewDialog.tsx:467` | `initial={{ opacity: 0, y: -10 }}` |
| 239 | `src/domains/content/components/UploadPreviewDialog.tsx:468` | `animate={{ opacity: 1, y: 0 }}` |
| 240 | `src/domains/content/components/UploadPreviewDialog.tsx:665` | `initial={{ opacity: 0, height: 0 }}` |
| 241 | `src/domains/content/components/UploadPreviewDialog.tsx:666` | `animate={{ opacity: 1, height: 'auto' }}` |
| 242 | `src/domains/content/components/UploadPreviewDialog.tsx:667` | `exit={{ opacity: 0, height: 0 }}` |
| 243 | `src/design-system/runtime/token-registry.ts:18` | `import zindexTokens from '@/design-system/tokens/source/z-index.json';` |
| 244 | `src/design-system/runtime/token-registry.ts:60` | `'z-index': zindexTokens,` |
| 245 | `src/domains/content/components/DocumentFocusView.tsx:298` | `padding: [60, 60],` |
| 246 | `src/domains/content/components/BatchEnrichmentPanel.tsx:788` | `initial={{ opacity: 0, y: 10 }}` |
| 247 | `src/domains/content/components/BatchEnrichmentPanel.tsx:789` | `animate={{ opacity: 1, y: 0 }}` |
| 248 | `src/domains/content/components/BatchEnrichmentPanel.tsx:790` | `exit={{ opacity: 0, x: -20 }}` |
| 249 | `src/domains/content/components/DocumentsPanel.tsx:288` | `detail: { bounds, padding: [60, 60], maxZoom: 15 },` |
| 250 | `src/design-system/map/__stories__/PopupPreview.tsx:144` | `opacity: 0.85,` |
| 251 | `src/design-system/map/__stories__/MapLoadingStates.stories.tsx:32` | `<style>{'@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.85}}'}</style>` |

## 5. Leaflet listeners (`map.on` / `marker.on` / `.off`)

Total: 45.

| # | File:Line | Snippet |
|---|---|---|
| 1 | `src/components/MapScaleBar.tsx:112` | `map.on('zoomend moveend', updateScale);` |
| 2 | `src/components/MapScaleBar.tsx:115` | `map.off('zoomend moveend', updateScale);` |
| 3 | `src/components/LocationMap.tsx:397` | `marker.on('click', () => setFocusedLocation(location.id));` |
| 4 | `src/components/LocationMap.tsx:446` | `if (p.id) marker.on('click', () => {` |
| 5 | `src/components/LocationMap.tsx:593` | `mapRef.current?.on('click', handleMapRouteClickEvent);` |
| 6 | `src/components/LocationMap.tsx:1155` | `map.on('moveend zoomend', recompute);` |
| 7 | `src/components/LocationMap.tsx:1157` | `map.off('moveend zoomend', recompute);` |
| 8 | `src/components/LocationMap.tsx:1274` | `mapRef.current.on('moveend', checkBounds);` |
| 9 | `src/components/LocationMap.tsx:1339` | `mapRef.current.on('click', () => {` |
| 10 | `src/components/LocationMap.tsx:1380` | `mapRef.current.on('zoomend', () => {` |
| 11 | `src/components/LocationMap.tsx:1402` | `mapRef.current.on('moveend', () => {` |
| 12 | `src/components/LocationMap.tsx:1407` | `mapRef.current.on('popupopen', (e: L.PopupEvent) => {` |
| 13 | `src/components/LocationMap.tsx:1436` | `mapRef.current.on('popupclose', (e: L.PopupEvent) => {` |
| 14 | `src/components/LocationMap.tsx:1789` | `marker.on('click', function (this: L.Marker) {` |
| 15 | `src/components/LocationMap.tsx:1794` | `marker.on('dblclick', (e: L.LeafletMouseEvent) => {` |
| 16 | `src/components/LocationMap.tsx:1801` | `// NOTA: el deselect canónico vive en el handler `map.on('popupclose')`` |
| 17 | `src/components/LocationMap.tsx:1803` | `// registra un marker.on('popupclose') porque dependería de `focusedLocationId`` |
| 18 | `src/components/LocationMap.tsx:1815` | `marker.on('popupopen', () => {` |
| 19 | `src/components/LocationMap.tsx:2346` | `map.on('movestart', onUserGesture);` |
| 20 | `src/components/LocationMap.tsx:2347` | `map.on('zoomstart', onUserGesture);` |
| 21 | `src/components/LocationMap.tsx:2348` | `map.on('dragstart', onUserGesture);` |
| 22 | `src/components/LocationMap.tsx:2488` | `map.off('movestart', onUserGesture);` |
| 23 | `src/components/LocationMap.tsx:2489` | `map.off('zoomstart', onUserGesture);` |
| 24 | `src/components/LocationMap.tsx:2490` | `map.off('dragstart', onUserGesture);` |
| 25 | `src/components/LocationMap.tsx:2515` | `map.on('zoomend', applyGroupVisibility);` |
| 26 | `src/components/LocationMap.tsx:2528` | `map.off('zoomend', applyGroupVisibility);` |
| 27 | `src/components/LocationMap.tsx:2562` | `map.on('zoomend', onZoomEnd);` |
| 28 | `src/components/LocationMap.tsx:2565` | `map.off('zoomend', onZoomEnd);` |
| 29 | `src/components/map/useEnrichmentTracker.ts:51` | `map.on('movestart', mark);` |
| 30 | `src/components/map/useEnrichmentTracker.ts:52` | `map.on('zoomstart', mark);` |
| 31 | `src/components/map/useEnrichmentTracker.ts:53` | `map.on('dragstart', mark);` |
| 32 | `src/components/map/useEnrichmentTracker.ts:55` | `map.off('movestart', mark);` |
| 33 | `src/components/map/useEnrichmentTracker.ts:56` | `map.off('zoomstart', mark);` |
| 34 | `src/components/map/useEnrichmentTracker.ts:57` | `map.off('dragstart', mark);` |
| 35 | `src/components/map/popup-recovery-mount.ts:51` | `marker.on('popupopen', (e: L.LeafletEvent) => {` |
| 36 | `src/components/map/popup-recovery-mount.ts:109` | `marker.on('popupclose', () => {` |
| 37 | `src/components/map/map-v2-renderer.ts:96` | `marker.on('click', () => onFeatureClick(feature));` |
| 38 | `src/components/map/map-routes.ts:378` | `polyline.on('click', onRouteClick);` |
| 39 | `src/components/map/map-routes.ts:379` | `hitArea.on('click', onRouteClick);` |
| 40 | `src/components/map/map-routes.ts:441` | `marker.on('click', () => {` |
| 41 | `src/components/map/map-routes.ts:858` | `marker.on('dragstart', () => {` |
| 42 | `src/components/map/map-routes.ts:862` | `marker.on('dragend', () => {` |
| 43 | `src/components/map/map-routes.ts:1139` | `straightLine.on('click', (e: any) => {` |
| 44 | `src/components/map/map-routes.ts:1299` | `map.on('click', correctionClickHandler);` |
| 45 | `src/components/map/map-routes.ts:1309` | `map.off('click', correctionClickHandler);` |

## 6. Listeners cleanup — pares `on` / `off`

| Archivo | `on` count | `off` count | Riesgo |
|---|---|---|---|
| `src/components/LocationMap.tsx` | 20 | 6 | ⚠ stale-closure |
| `src/components/MapScaleBar.tsx` | 1 | 1 | OK |
| `src/components/map/map-routes.ts` | 7 | 1 | ⚠ stale-closure |
| `src/components/map/map-v2-renderer.ts` | 1 | 0 | ⚠ stale-closure |
| `src/components/map/popup-recovery-mount.ts` | 2 | 0 | ⚠ stale-closure |
| `src/components/map/useEnrichmentTracker.ts` | 3 | 3 | OK |


## 7. Sistemas paralelos de fit / cámara

| API | Callers | Atraviesa cooldown? | Atraviesa clamp z12? | Bounds source |
|---|---|---|---|---|
| `requestSubsetFit` | 7 (HealthRepairPreviewDialog, use-health-filter-fit, use-selection-fit-on-start, use-my-catalog-popover-fit, UsersSidebar, SourceFilterBridge, subset-fit core) | SÍ | SÍ | coords explícitas o ids→markers |
| `window 'map-fit-bounds'` | 10 emisores (Index×2, use-route-focus-bus×2, SegmentBreakdown, CollectionFocusView, DocumentFocusView, DocumentContentManager, DocumentsPanel, OrphanFocusView, DuplicatesList) | NO | NO (cada emisor decide su propio `maxZoom`) | bounds en payload |
| `map.fitBounds` directo | LocationMap×7 + map-routes×3 + UploadPreviewDialog×1 | NO | NO | local |
| `map.flyTo` | LocationMap×7 | NO | NO | coord+zoom inline |
| `map.setView` | LocationMap×6 + useEnrichmentTracker×1 + UploadPreviewDialog×1 | NO | NO | coord+zoom inline |
| `map.panTo` | LocationMap:1798 (popup recenter) | NO | N/A | marker latlng |
| `centerOpenedPopupInVisibleMap` | LocationMap:238 (defn), 1430, 1791, 2588 | NO | N/A | marker latlng + sidebar offset |

**Conclusión:** la cámara tiene **5 buses paralelos** (`requestSubsetFit` + `map-fit-bounds` + 3 APIs Leaflet directas). Solo el primero respeta el subset-fit-contract. Es la deuda arquitectónica más relevante.

## 8. High-risk findings

- **5 buses de cámara coexistiendo** (ver §7). El usuario puede disparar pan/zoom manual y, antes de 4s, una llamada `flyTo` directa desde `LocationMap.tsx:501/637/1551/2307/2440/2465` mueve la cámara sin respetar el cooldown del subset-fit. Caso negativo NO cubierto por BL-002. **Candidate BL-021** abajo.
- **`maxZoom: 14`** aparece en `LocationMap.tsx:403`, `SegmentBreakdown.tsx:272`, `UploadPreviewDialog.tsx:355`, `map-routes.ts:768` (10), payloads `map-fit-bounds`. No es el mismo número en todos. Sin constante.
- **Padding `[50,50] / [60,60] / [80,80] / [24,24]`** según caller. Sin justificación documentada por contexto (focus / collection / route / preview).
- **Zooms inline `flyTo(..., 14|16)` y `setView(..., 11|12|3)`** en `LocationMap.tsx`. Sin enum `ZoomTarget`. Cubierto parcialmente por BL-017.
- **Listeners cleanup** — la tabla §6 marca con ⚠ los archivos donde `on` > `off`. Cada uno es un riesgo de stale-closure si el componente re-monta (BL-007 lo cubre parcialmente).
- **`setTimeout` con valores mágicos** — 71 ocurrencias. Especialmente sospechosos los `setTimeout(..., 250)` (debounces selección), `400`, `500`, `1000`, `4000` (cooldown). Sin tabla de delays nombrados.

## 9. Candidate backlog items (no creados aún)

| ID candidato | Descripción | Por qué no creado en esta pasada |
|---|---|---|
| BL-021 (candidate) | Hacer que `flyTo`/`setView`/`panTo` directos en `LocationMap` respeten el cooldown del subset-fit cuando vengan disparados por código (no por gesture). | Solapa con BL-015; podría resolverse al unificar buses. |
| BL-022 (candidate) | Centralizar variantes `isOwn*` en un único helper booleano. | Necesita análisis caso-por-caso para confirmar que todas las variantes piden lo mismo. |
| BL-023 (candidate) | Tabla de eventos `*-updated` / `*:changed` / `reload-locations` y consolidar a uno solo. | Riesgo medio; requiere reescritura amplia. |
| BL-024 (candidate) | Verificar relación `created_by` vs `ownerUserId` en queries y RLS. | Necesita inspección DB. |

## 10. Cross-references
- Backlog: BL-002, BL-007, BL-015, BL-017, BL-018.
- Memory: `mem://logic/map/subset-fit-contract`, `mem://style/map/poi-zoom-canon`.
- Audits previos: `uniformity-audit.md` U1–U11, `global-guards-audit.md`.
