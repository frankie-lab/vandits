# Hardcode Inventory — Exhaustive

_Generated: 2026-05-15  •  Scope: `src/`  •  Doc-only_

## 1. Methodology

```
rg -n '[0-9a-f]{8}-[0-9a-f]{4}-...' src/    # UUIDs
rg -n "localStorage\.(get|set|remove)Item\(" src/
rg -n '\.fitBounds\(|\.flyTo\(|\.setView\(|\.panTo\(' src/  # camera literals
```
Inventario línea-a-línea. Cada literal sospechoso. Se incluyen también IDs hex no-UUID si superan 12 chars.

## 2. UUID literals

Total: 26.

| # | File:Line | UUID/Snippet |
|---|---|---|
| 1 | `src/test/poi-source.test.ts:14` | `const VIEWER = '11111111-1111-1111-1111-111111111111';` |
| 2 | `src/test/poi-source.test.ts:15` | `const OTHER = '22222222-2222-2222-2222-222222222222';` |
| 3 | `src/test/poi-shareability.test.ts:13` | `const VIEWER = '11111111-1111-1111-1111-111111111111';` |
| 4 | `src/test/poi-shareability.test.ts:14` | `const OTHER = '22222222-2222-2222-2222-222222222222';` |
| 5 | `src/test/poi-marker-grammar.test.ts:14` | `const VIEWER = '11111111-1111-1111-1111-111111111111';` |
| 6 | `src/test/poi-marker-grammar.test.ts:15` | `const OTHER = '22222222-2222-2222-2222-222222222222';` |
| 7 | `src/test/poi-filter-source.test.ts:10` | `const A = '11111111-1111-1111-1111-111111111111';` |
| 8 | `src/test/poi-filter-source.test.ts:11` | `const B = '22222222-2222-2222-2222-222222222222';` |
| 9 | `src/domains/content/lib/db-transformers.ts:104` | `'0f99a8d9-61b5-4376-a463-9aecd9ab7fe5',` |
| 10 | `src/domains/content/lib/db-transformers.ts:105` | `'2e002681-bac2-4c8c-a555-114f69b0da98',` |
| 11 | `src/domains/content/lib/db-transformers.ts:106` | `'7801ba70-d410-4ecc-9617-ceb8f29a7c1a',` |
| 12 | `src/domains/content/lib/db-transformers.ts:107` | `'951370e0-134e-4c2b-b5ae-4f3c9fd0fd83',` |
| 13 | `src/domains/content/lib/db-transformers.ts:108` | `'adf6945d-6f42-475a-a005-7c518904bd95',` |
| 14 | `src/domains/content/lib/db-transformers.ts:109` | `'c6c2c58d-601e-4fab-9005-dabc8e466a60',` |
| 15 | `src/domains/content/lib/db-transformers.ts:110` | `'d397b327-2b0b-4d58-9829-204865e773de',` |
| 16 | `src/domains/content/lib/db-transformers.ts:111` | `'fd4ef112-ca9f-47e8-937f-ad9e73dee00d',` |
| 17 | `src/domains/content/lib/db-transformers.ts:115` | `'1555901f-dd34-4096-a515-ea34c703edfb',` |
| 18 | `src/domains/content/lib/db-transformers.ts:116` | `'22222222-2222-2222-2222-222222222201',` |
| 19 | `src/domains/content/lib/db-transformers.ts:117` | `'22222222-2222-2222-2222-222222222202',` |
| 20 | `src/domains/content/lib/db-transformers.ts:118` | `'2990233a-715b-4eb7-83b3-207fa368a89c',` |
| 21 | `src/domains/content/lib/db-transformers.ts:119` | `'2bb2d2e6-b40f-4499-af05-bd8523edc054',` |
| 22 | `src/domains/content/lib/db-transformers.ts:120` | `'2ddd752a-23da-4dcb-a07c-06935140781c',` |
| 23 | `src/domains/content/lib/db-transformers.ts:121` | `'435a2dcf-4609-40ec-92ca-b5caeeaf914c',` |
| 24 | `src/domains/content/lib/db-transformers.ts:122` | `'a2b185ee-ce9d-4b27-86b9-c7b77b7c2c8b',` |
| 25 | `src/domains/content/lib/db-transformers.ts:123` | `'ef42e9d1-8424-45f0-a9b3-7148966bed11',` |
| 26 | `src/domains/content/lib/db-transformers.ts:124` | `'f441d89a-bc07-42c5-a9b5-750e32051162',` |

## 3. `localStorage` keys (hardcoded strings)

Total: 76.

| # | File:Line | Snippet |
|---|---|---|
| 1 | `src/contexts/IconLibraryContext.tsx:18` | `const stored = localStorage.getItem('vandits-icon-library');` |
| 2 | `src/contexts/IconLibraryContext.tsx:33` | `localStorage.setItem('vandits-icon-library', lib);` |
| 3 | `src/contexts/IconLibraryContext.tsx:40` | `localStorage.setItem('vandits-icon-library', lib);` |
| 4 | `src/components/RouteSettingsPanel.tsx:97` | `localStorage.setItem('vandits-route-engine-defaults', JSON.stringify(config));` |
| 5 | `src/hooks/use-map-theme.ts:75` | `if (localStorage.getItem(AUTO_KEY) === 'true') {` |
| 6 | `src/hooks/use-map-theme.ts:76` | `localStorage.setItem(AUTO_KEY, 'false');` |
| 7 | `src/hooks/use-map-theme.ts:87` | `try { return localStorage.getItem(AUTO_KEY) === 'true'; } catch { return false; }` |
| 8 | `src/hooks/use-map-theme.ts:91` | `localStorage.setItem(AUTO_KEY, String(enabled));` |
| 9 | `src/hooks/use-layer-visibility.ts:56` | `const raw = localStorage.getItem(STORAGE_KEY);` |
| 10 | `src/hooks/use-layer-visibility.ts:81` | `const ownership = localStorage.getItem('vandits-ownership-filter');` |
| 11 | `src/hooks/use-layer-visibility.ts:86` | `const hiddenUsers = localStorage.getItem('vandits_hidden_followed_users');` |
| 12 | `src/hooks/use-layer-visibility.ts:93` | `localStorage.removeItem('vandits-ownership-filter');` |
| 13 | `src/hooks/use-layer-visibility.ts:94` | `localStorage.removeItem('vandits_hidden_followed_users');` |
| 14 | `src/hooks/use-layer-visibility.ts:95` | `localStorage.removeItem('vandits_hidden_curators');` |
| 15 | `src/hooks/use-layer-visibility.ts:96` | `localStorage.removeItem('vandits_hidden_druids');` |
| 16 | `src/hooks/use-layer-visibility.ts:104` | `localStorage.setItem(STORAGE_KEY, JSON.stringify(state));` |
| 17 | `src/hooks/use-export-tracking.ts:23` | `const stored = localStorage.getItem(LOCAL_STORAGE_KEY);` |
| 18 | `src/hooks/use-export-tracking.ts:35` | `localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(record));` |
| 19 | `src/hooks/use-export-tracking.ts:105` | `localStorage.removeItem(LOCAL_STORAGE_KEY);` |
| 20 | `src/lib/sounds.ts:49` | `const stored = localStorage.getItem(SOUNDS_ENABLED_KEY);` |
| 21 | `src/lib/sounds.ts:58` | `localStorage.setItem(SOUNDS_ENABLED_KEY, enabled ? 'true' : 'false');` |
| 22 | `src/lib/sounds.ts:80` | `const stored = localStorage.getItem(SOUND_PREFS_KEY);` |
| 23 | `src/lib/sounds.ts:92` | `localStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs));` |
| 24 | `src/components/AuditPanel.tsx:231` | `const raw = localStorage.getItem(lsKey);` |
| 25 | `src/components/AuditPanel.tsx:342` | `const was = localStorage.getItem(key);` |
| 26 | `src/components/AuditPanel.tsx:343` | `localStorage.setItem(key, was === 'true' ? 'false' : 'true');` |
| 27 | `src/components/AuditPanel.tsx:344` | `const now = localStorage.getItem(key);` |
| 28 | `src/components/AuditPanel.tsx:346` | `if (was !== null) localStorage.setItem(key, was);` |
| 29 | `src/components/AuditPanel.tsx:347` | `else localStorage.removeItem(key);` |
| 30 | `src/components/AuditPanel.tsx:363` | `const raw = localStorage.getItem(key);` |
| 31 | `src/components/AuditPanel.tsx:371` | `localStorage.setItem(key, JSON.stringify(state));` |
| 32 | `src/components/AuditPanel.tsx:373` | `const check = JSON.parse(localStorage.getItem(key)!);` |
| 33 | `src/components/AuditPanel.tsx:377` | `localStorage.setItem(key, JSON.stringify(state));` |
| 34 | `src/components/AuditPanel.tsx:393` | `const raw = localStorage.getItem(key);` |
| 35 | `src/components/AuditPanel.tsx:398` | `localStorage.setItem(key, JSON.stringify(prev));` |
| 36 | `src/components/AuditPanel.tsx:399` | `const check = JSON.parse(localStorage.getItem(key)!);` |
| 37 | `src/components/AuditPanel.tsx:404` | `localStorage.setItem(key, JSON.stringify(prev));` |
| 38 | `src/components/MapCenterSettings.tsx:19` | `const stored = localStorage.getItem(STORAGE_KEY);` |
| 39 | `src/components/MapCenterSettings.tsx:32` | `localStorage.setItem(STORAGE_KEY, JSON.stringify(config));` |
| 40 | `src/shared/preferences/use-list-grouping.ts:19` | `const v = localStorage.getItem(STORAGE_KEY);` |
| 41 | `src/shared/preferences/use-list-grouping.ts:38` | `try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }` |
| 42 | `src/components/LocationMap.tsx:183` | `const stored = localStorage.getItem('geodata-measurement-units');` |
| 43 | `src/pages/Auth.tsx:61` | `const remembered = localStorage.getItem(REMEMBER_ME_KEY) === 'true';` |
| 44 | `src/pages/Auth.tsx:64` | `const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);` |
| 45 | `src/pages/Auth.tsx:158` | `localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');` |
| 46 | `src/pages/Auth.tsx:160` | `localStorage.setItem(REMEMBERED_EMAIL_KEY, email);` |
| 47 | `src/pages/Auth.tsx:162` | `localStorage.removeItem(REMEMBERED_EMAIL_KEY);` |
| 48 | `src/components/UserProfileEditor.tsx:324` | `const cached = localStorage.getItem('vandits-transport-selections');` |
| 49 | `src/components/UserProfileEditor.tsx:709` | `localStorage.setItem('vandits-transport-selections', JSON.stringify(cached));` |
| 50 | `src/components/UserProfileEditor.tsx:722` | `localStorage.setItem('geodata-map-center-config', JSON.stringify(mapConfig));` |
| 51 | `src/components/UserProfileEditor.tsx:723` | `localStorage.setItem('geodata-measurement-units', mapData.measurement_units);` |
| 52 | `src/components/UserProfileEditor.tsx:731` | `localStorage.setItem('vandits-route-engine-defaults', JSON.stringify(routeEngineDefaults));` |
| 53 | `src/test/layer-visibility.test.ts:91` | `localStorage.setItem('vandits-layer-visibility', JSON.stringify({` |
| 54 | `src/test/layer-visibility.test.ts:102` | `const stored = JSON.parse(localStorage.getItem('vandits-layer-visibility')!);` |
| 55 | `src/test/layer-visibility.test.ts:108` | `localStorage.setItem('vandits-layer-visibility', JSON.stringify({` |
| 56 | `src/shared/preferences/storage.ts:17` | `const raw = localStorage.getItem(lsKey(unitId, scope, entityId));` |
| 57 | `src/shared/preferences/storage.ts:25` | `localStorage.setItem(lsKey(unitId, scope, entityId), JSON.stringify(overrides));` |
| 58 | `src/shared/preferences/storage.ts:29` | `localStorage.removeItem(lsKey(unitId, scope, entityId));` |
| 59 | `src/domains/routes/hooks/use-route-orchestration.ts:14` | `const raw = localStorage.getItem('vandits-layer-visibility');` |
| 60 | `src/components/map/map-photo-layer.ts:108` | `return localStorage.getItem(PHOTO_LAYER_STORAGE_KEY) === 'true';` |
| 61 | `src/components/map/map-photo-layer.ts:115` | `localStorage.setItem(PHOTO_LAYER_STORAGE_KEY, String(visible));` |
| 62 | `src/test/enrichment-helpers.test.ts:34` | `localStorage.setItem('geodata-enrichment-criteria', JSON.stringify({ _updatedAt: Date.now() + 100000 }));` |
| 63 | `src/test/enrichment-helpers.test.ts:41` | `localStorage.removeItem('geodata-enrichment-criteria');` |
| 64 | `src/components/map/map-utils.ts:9` | `const stored = localStorage.getItem(CRITERIA_STORAGE_KEY);` |
| 65 | `src/domains/content/store/duplicates-helpers.ts:9` | `const stored = localStorage.getItem(PENDING_DUPLICATES_KEY);` |
| 66 | `src/domains/content/store/duplicates-helpers.ts:17` | `localStorage.setItem(PENDING_DUPLICATES_KEY, JSON.stringify(duplicates));` |
| 67 | `src/domains/content/store/duplicates-helpers.ts:25` | `const stored = localStorage.getItem(RESOLVED_DUPLICATES_KEY);` |
| 68 | `src/domains/content/store/duplicates-helpers.ts:33` | `localStorage.setItem(RESOLVED_DUPLICATES_KEY, JSON.stringify(pairIds));` |
| 69 | `src/domains/content/store/enrichment-helpers.ts:15` | `const stored = localStorage.getItem('geodata-enrichment-criteria');` |
| 70 | `src/domains/content/hooks/use-document-focus.ts:83` | `const raw = localStorage.getItem('vandits-layer-visibility');` |
| 71 | `src/domains/content/components/EnrichmentCriteriaConfig.tsx:143` | `const stored = localStorage.getItem(STORAGE_KEY);` |
| 72 | `src/domains/content/components/EnrichmentCriteriaConfig.tsx:156` | `const stored = localStorage.getItem(STORAGE_KEY);` |
| 73 | `src/domains/content/components/EnrichmentCriteriaConfig.tsx:168` | `localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...criteria, _updatedAt: Date.now() }));` |
| 74 | `src/domains/content/components/EnrichmentCriteriaEditor.tsx:102` | `const saved = localStorage.getItem('enrichment-criteria');` |
| 75 | `src/domains/content/components/EnrichmentCriteriaEditor.tsx:118` | `const saved = localStorage.getItem('enrichment-criteria');` |
| 76 | `src/domains/content/components/EnrichmentCriteriaEditor.tsx:127` | `localStorage.setItem('enrichment-criteria', JSON.stringify(criteria));` |

## 4. Camera-API literals — coords, zoom, padding inline

Total: 33.

| # | File:Line | Call |
|---|---|---|
| 1 | `src/components/LocationMap.tsx:238` | `const centerOpenedPopupInVisibleMap = useCallback((marker: L.Marker, rightPanelWidth = 0) => {` |
| 2 | `src/components/LocationMap.tsx:303` | `mapRef.current.setView(` |
| 3 | `src/components/LocationMap.tsx:312` | `mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });` |
| 4 | `src/components/LocationMap.tsx:336` | `mapRef.current.fitBounds(latLngBounds, {` |
| 5 | `src/components/LocationMap.tsx:365` | `mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });` |
| 6 | `src/components/LocationMap.tsx:367` | `mapRef.current.setView([20, 0], 3);` |
| 7 | `src/components/LocationMap.tsx:403` | `mapRef.current.fitBounds(bounds, { padding: [80, 80], animate: true, maxZoom: 14 });` |
| 8 | `src/components/LocationMap.tsx:405` | `mapRef.current.setView(bounds[0], Math.max(mapRef.current.getZoom(), 12), { animate: true });` |
| 9 | `src/components/LocationMap.tsx:501` | `mapRef.current.flyTo([lat, lng], zoom \|\| 16, { duration: 0.8 });` |
| 10 | `src/components/LocationMap.tsx:637` | `mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 });` |
| 11 | `src/components/LocationMap.tsx:807` | `mapRef.current.fitBounds(bounds, {` |
| 12 | `src/components/LocationMap.tsx:843` | `map.setView([lat, lng], INITIAL_GEOLOCATION_ZOOM);` |
| 13 | `src/components/LocationMap.tsx:845` | `map.flyTo([lat, lng], INITIAL_GEOLOCATION_ZOOM, { duration: 0.8 });` |
| 14 | `src/components/LocationMap.tsx:926` | `mapRef.current.setView([lat, lng], 12);` |
| 15 | `src/components/LocationMap.tsx:928` | `mapRef.current.flyTo([lat, lng], 12, { duration: 0.8 });` |
| 16 | `src/components/LocationMap.tsx:949` | `mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 11);` |
| 17 | `src/components/LocationMap.tsx:1430` | `centerOpenedPopupInVisibleMap(marker, getDocumentFocusPanelWidth());` |
| 18 | `src/components/LocationMap.tsx:1551` | `mapRef.current.flyTo([latitude, longitude], 16, { duration: 1.2 });` |
| 19 | `src/components/LocationMap.tsx:1754` | `// autoPan desactivado: `centerOpenedPopupInVisibleMap` lo sustituye y` |
| 20 | `src/components/LocationMap.tsx:1791` | `centerOpenedPopupInVisibleMap(this, getDocumentFocusPanelWidth());` |
| 21 | `src/components/LocationMap.tsx:1798` | `map.panTo(marker.getLatLng(), { animate: true, duration: 0.4 });` |
| 22 | `src/components/LocationMap.tsx:1858` | `mapRef.current.fitBounds(bounds, {` |
| 23 | `src/components/LocationMap.tsx:2307` | `map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });` |
| 24 | `src/components/LocationMap.tsx:2440` | `map.flyTo([lat, lng], target, { duration: 0.6 });` |
| 25 | `src/components/LocationMap.tsx:2465` | `map.flyTo(center, finalZoom, { duration: 0.6 });` |
| 26 | `src/components/LocationMap.tsx:2580` | `mapRef.current.setView(` |
| 27 | `src/components/LocationMap.tsx:2588` | `centerOpenedPopupInVisibleMap(marker, rightPanelWidth);` |
| 28 | `src/components/map/useEnrichmentTracker.ts:113` | `mapRef.current.setView(` |
| 29 | `src/components/map/map-routes.ts:635` | `mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [60, 60], animate: true });` |
| 30 | `src/components/map/map-routes.ts:719` | `mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], animate: true });` |
| 31 | `src/components/map/map-routes.ts:768` | `mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], maxZoom: 10, animate: true });` |
| 32 | `src/domains/content/components/UploadPreviewDialog.tsx:353` | `if (allBoundsPoints.length === 0) { map.setView([20, 0], map.getMinZoom()); return; }` |
| 33 | `src/domains/content/components/UploadPreviewDialog.tsx:355` | `if (bounds.isValid()) { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 }); requestAnimationFrame(forcePreviewTilesVisible); }` |

## 5. Magic strings — roles / channels / sources

| Token | Comentario |
|---|---|
| `'admin'` / `'owner'` | Role strings en RLS-related code; deberían estar en enum `app_role`. |
| `'sandbox-agent@vandits.test'` (uid `f04b3b95-...`) | Sandbox mirror documentado en core memory; aceptable pero merece constante exportada. |
| `'web_import'` / `'manual'` / `'kml'` / `'gpx'` / `'geojson'` / `'csv'` | Canales de import; existe `shouldAutoApproveImport` pero los strings se replican en parsers. |
| `'owner-v2.6-no-green-no-gray'` | `palette_version` literal; debería ser constante. |

## 6. High-risk findings

- **UUID hardcodeados en código de aplicación**. Cualquier UUID literal en `src/` (no en migraciones, no en seeds) es un acoplamiento a un usuario/registro específico. Revisar la tabla §2 fila por fila. Sandbox uid (`f04b3b95-7308-4b74-b3c7-7e819767c5fb`) está documentado pero idealmente debería vivir en `src/shared/constants/sandbox.ts`.
- **`localStorage` keys sin centralizar** (BL-016). 76 ocurrencias. Riesgo: typo en una key rompe persistencia silenciosamente.
- **Camera literals inline** — `padding: [50,50]`, `[80,80]`, `[60,60]`, `[24,24]`, `maxZoom: 14`, `maxZoom: 10`, `setView([20, 0], 3)`, `flyTo(..., 16)`, `flyTo(..., 14)`, `setView(..., 12)`, `setView(..., 11)`. Once paddings y siete zooms distintos sin nombrar. Detallado por categoría en `constants-thresholds-inventory.md`.
- **`palette_version` string literal** se repite en allocator + queries. Si cambia, hay que actualizar N sitios.
- **Magic strings de canal de import** se duplican en parsers a pesar del helper canónico — posible candidato a enum exportado.

## 7. Cross-references
- `hardcoded-behaviors-audit.md` (HC-001..011, HI-001..009) — primera pasada.
- Backlog: BL-016 (localStorage keys), BL-017 (fit tokens), BL-014 (ownership bypass), BL-020 (hex residuals).
