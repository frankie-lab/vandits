# Hardcoded Behaviors Audit

Auditoría de hardcodes explícitos e implícitos detectados en el código de aplicación.

Categorías:
- `hardcoded` — valor mágico inline (zoom, cooldown, color, key)
- `duplicated-behavior` — misma intención implementada en N sitios distintos
- `divergent-ownership` — múltiples fuentes de verdad para el mismo dato
- `partial-abstraction` — helper canónico existe pero no se usa en todos los sitios
- `legacy-path` — implementación antigua que sigue viva sin doc
- `undocumented-bypass` — guard/regla saltada localmente sin justificación en contrato
- `hidden-coupling` — dependencia implícita entre módulos que el contrato no expone

Severidades: `critical` / `high` / `medium` / `low`.

---

## H1 — Hardcodes explícitos

### HC-001 · `maxZoom: 14` duplicado en callers de fit
- **Categoría:** `hardcoded` + `duplicated-behavior`
- **Severidad:** medium
- **Archivos:**
  - `src/pages/Index.tsx:456, 467`
  - `src/components/CollectionFocusView.tsx:99`
  - `src/components/OrphanFocusView.tsx:75`
  - `src/components/SegmentBreakdown.tsx:272`
  - `src/domains/content/components/DocumentsPanel.tsx:288`
  - `src/domains/content/components/DocumentFocusView.tsx:299` (`maxZoom: 15`)
  - `src/domains/content/components/DocumentContentManager.tsx:186` (`maxZoom: 16`)
  - `src/domains/content/components/UploadPreviewDialog.tsx:355`
  - `src/domains/routes/hooks/use-route-focus-bus.ts:33, 55`
- **Contrato relacionado:** `subset-fit-contract` · `mem://style/map/poi-zoom-canon`
- **Observado:** cada caller fija su propio piso/techo de zoom (`14`, `15`, `16`, `18`, `19`, `20`). El canon `ZOOM_THRESHOLDS.richMin = 12` (token `map.zoom.richMin`) solo se usa dentro de `LocationMap.tsx:2336` (`FIT_CLAMP_ZOOM`).
- **Esperado:** todos los fits leen el clamp del token (`map.zoom.fitClamp` o `richMin`). Variantes (foco fino, preview, route) declaradas como tokens semánticos (`map.zoom.fitFine`, `map.zoom.fitOverview`).
- **Propuesta:** añadir `map.fit.*` al design-system y migrar los 9 callsites.
- **Backlog:** BL-017.

### HC-002 · `padding` de fit duplicado sin token
- **Categoría:** `hardcoded` + `duplicated-behavior`
- **Severidad:** low
- **Archivos:** `[60,60]` ×6, `[80,80]` ×4, `[50,50]` ×2, `[24,24]` ×1, `[16,16]`/`[12,12]` en otros.
- **Contrato:** `subset-fit-contract`.
- **Observado:** mismo concepto (margen de fit) implementado con 4 valores distintos sin política.
- **Esperado:** token `map.fit.padding.{compact,standard,wide}`.
- **Backlog:** BL-017.

### HC-003 · `COOLDOWN_MS = 4000` inline
- **Categoría:** `hardcoded`
- **Severidad:** low
- **Archivo:** `src/components/LocationMap.tsx:2335`.
- **Contrato:** `subset-fit-contract` (invariante #2).
- **Observado:** literal `4000` sin export. Mencionado en docstrings de varios callers (`use-selection-fit-on-start.ts:12`, `use-health-filter-fit.ts:19`, `use-my-catalog-popover-fit.ts`) — referencia documental sincronizada a mano.
- **Esperado:** `export const SUBSET_FIT_COOLDOWN_MS` en `src/components/map/subset-fit.ts`.
- **Backlog:** BL-017.

### HC-004 · `DEBOUNCE_MS = 250` aislado
- **Categoría:** `hardcoded`
- **Severidad:** low
- **Archivo:** `src/components/discovery/use-selection-fit-on-start.ts:20`.
- **Observado:** debounce solo en este hook; `use-health-filter-fit` y `use-my-catalog-popover-fit` no debouncean.
- **Esperado:** decisión explícita en `subset-fit-contract` sobre cuándo cada caller debe debouncear.
- **Backlog:** BL-017 (sub-item).

### HC-005 · `setTimeout` con números mágicos
- **Categoría:** `hardcoded`
- **Severidad:** low
- **Archivos representativos:**
  - `src/shared/progress/EnrichmentLane.tsx:173` — `5000`
  - `src/domains/content/components/EnrichmentProgressIndicator.tsx:63` — `3000`
  - `src/components/RoutesListPanel.tsx:531, 625` — `2000`
  - `src/domains/content/components/DocumentFocusView.tsx:376` — `2500`
  - `src/domains/content/components/FileUploadZone.tsx:345` — `800` (min spinner)
  - `src/components/LocationMap.tsx:932` — `50` / `800`
  - `src/shared/geography/geocode-batch.ts:87` — `1100` (rate limit OSM)
  - `src/domains/content/lib/db-transformers.ts:66` — `500 * attempt` (backoff)
  - `src/pages/Index.tsx:193` — `500`
- **Observado:** ningún módulo central de timings.
- **Esperado:** `src/shared/timings.ts` con `UI_TOAST_AUTOHIDE_MS`, `UI_HIGHLIGHT_MS`, `MIN_SPINNER_MS`, `OSM_RATE_LIMIT_MS`, etc.
- **Backlog:** BL-019.

### HC-006 · Clases tailwind de color sin tokens semánticos
- **Categoría:** `hardcoded` + `duplicated-behavior`
- **Severidad:** medium
- **Archivos:**
  - `src/components/toolbar/MyCatalogQuickFilters.tsx:49–50, 199` (`bg-emerald-500/10`, `bg-red-500/10`)
  - `src/components/FilterBar.tsx:214, 249, 259` (`text-amber-600`, `bg-amber-100`)
  - `src/components/IncompleteLocationsPanel.tsx:228` (`bg-red-500`)
  - `src/components/LayersPanel.tsx:10` (`text-amber-500`)
  - `src/components/UserMenu.tsx:366, 401, 513, 523, 537` (`text-amber-*`, `bg-amber-*`)
  - `src/components/LocationPhotoSearch.tsx:194, 325` y `LocationPhotoMenu.tsx:163–174`
  - `src/components/AdminPanel.tsx:540` (`bg-amber-500/10`)
  - `src/components/LocationMap.tsx:2965, 2998` (dot legend)
- **Contrato:** `mem://style/tokens/design-system-v1` · `mem://style/tokens/color-codemod-phase-4`.
- **Observado:** colores ad-hoc para estados semánticos (warning, success, danger, mesa-de-trabajo).
- **Esperado:** tokens `--state-warning`, `--state-success`, `--state-danger`, `--workspace` con variants en `bg-*`/`text-*`.
- **Backlog:** entra como continuación natural de la fase 4 del color codemod (sin BL nuevo).

### HC-007 · Hex colors inline para markers/paletas
- **Categoría:** `hardcoded`
- **Severidad:** medium
- **Archivos:**
  - `src/components/MarkerStateRulesPanel.tsx:15` — `SAMPLE_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#6b7280']`
  - `src/components/MarkerStateRulesPanel.tsx:24` — `DEFAULT_ACCENT = '#3b82f6'`
  - `src/components/CollectionAppearanceDialog.tsx:30, 32` — paleta inline 8+ hex
  - `src/components/LocationMap.tsx:963, 995, 1118, 2270` — `#16a34a` (home), `#3b82f6` (gps), `#3b82f6` (header tooltip + route default)
- **Contrato:** `mem://style/visual-icon-standards` · `mem://style/map/marker-classification-v3`.
- **Observado:** muestras visuales y defaults sin pasar por tokens.
- **Esperado:** `swatchPalette()` y `--marker-default` en design-system.
- **Backlog:** BL-020.

### HC-008 · `localStorage` keys sin registro central ni convención
- **Categoría:** `hardcoded` + `duplicated-behavior`
- **Severidad:** medium
- **Keys detectadas:**
  - prefijo `vandits-`: `vandits-icon-library`, `vandits-layer-visibility`, `vandits-ownership-filter`, `vandits-route-engine-defaults`, `vandits-transport-selections`
  - prefijo `vandits_` (snake): `vandits_hidden_curators`, `vandits_hidden_druids`, `vandits_hidden_followed_users`
  - prefijo `geodata-`: `geodata-enrichment-criteria`, `geodata-map-center-config`, `geodata-measurement-units`
  - sin prefijo: `enrichment-criteria`, `REMEMBER_ME_KEY`, `SOUNDS_ENABLED_KEY`, `AUTO_KEY`, `PHOTO_LAYER_STORAGE_KEY`
- **Archivos:** 14 ficheros acceden a `localStorage` directamente; ningún wrapper.
- **Observado:** tres convenciones de naming, escrituras y lecturas duplicadas (e.g. `vandits-layer-visibility` se lee en `use-layer-visibility.ts`, `use-route-orchestration.ts`, `use-document-focus.ts`).
- **Esperado:** módulo `src/shared/storage/keys.ts` exportando constantes + helpers `read/write/remove` tipados, prefijo único `vandits-*`, migración de `vandits_*`/`geodata-*`/`enrichment-criteria` con backfill.
- **Curatoría legacy:** `vandits_hidden_curators` y `vandits_hidden_druids` quedan limpiadas en `use-layer-visibility.ts:95-96` (Curators & Druids REMOVED, ver Core memory). Confirmar que la limpieza se sigue ejecutando para nuevos perfiles.
- **Backlog:** BL-016.

### HC-009 · `userId` hardcoded — sandbox mirror
- **Categoría:** `hardcoded` (intencional, doc'd)
- **Severidad:** low
- **Archivo:** `mem://preferences/sandbox-user-mirror` (`f04b3b95-7308-4b74-b3c7-7e819767c5fb`).
- **Observado:** no hay literales del UID en `src/`. La memoria está bien documentada; los componentes que muestran `#sandbox-agent` lo hacen vía `username-registry`.
- **Esperado:** mantener. Vigilar que ningún PR introduzca el literal en código.
- **Backlog:** no.

### HC-010 · Roles/permisos hardcodeados en gating de UI
- **Categoría:** `hardcoded` + `duplicated-behavior`
- **Severidad:** medium
- **Archivos:**
  - `src/components/AdminPanel.tsx` — `isMaster()` invocado 12+ veces (`AdminPanel.tsx:419, 433, 475, 479, 483, 487, 491, 495, 499, 503, 507`) como guard de cada tab.
  - `src/components/UserMenu.tsx:202–204, 484` — `hasPermission(...) || isAdmin() || isMaster()` repetido por sección.
  - `src/components/LocationPhotoSearch.tsx:122, 134, 167, 169` — folder de Storage cambia entre `'default'` y `user.id` según `isAdminMode`.
- **Observado:** la lógica de "qué puede ver/escribir un master" vive desperdigada por componente.
- **Esperado:** un solo `useAdminCapability(tab)` o tabla `ADMIN_TAB_PERMISSIONS` consultada en un layout único.
- **Backlog:** no nuevo (vive en backlog del dominio Identity, fuera de scope de esta auditoría).

### HC-011 · `is_admin` checks vs `isAdmin()` helper
- **Categoría:** `partial-abstraction`
- **Severidad:** low
- **Observado:** existen `usePermissions().isAdmin()` y `isMaster()`, pero el componente `LocationPhotoSearch` recibe `isAdminMode: boolean` como prop, mezclando capa de permisos con prop UI.
- **Esperado:** componentes consumen el hook directamente o reciben capability tipada (`canSetOfficialPhoto: boolean`).
- **Backlog:** no.

---

## H2 — Hardcodes implícitos

### HI-001 · Bypass de `getLocationOwnerUserId` en LocationMap
- **Categoría:** `divergent-ownership` + `undocumented-bypass`
- **Severidad:** high
- **Archivo:** `src/components/LocationMap.tsx:2124`
  ```ts
  const ownerUid = (location as any).ownerUserId ?? (location as any)._docUserId ?? null;
  ```
- **Contrato:** `mem://logic/content/location-owner-resolver` (Core: "owner resolver único").
- **Observado:** el resolver canónico `getLocationOwnerUserId(loc)` está importado en el mismo fichero (`LocationMap.tsx:2124` está en el handler `lovable:owner-identity-updated` repaint loop) pero esta línea concreta replica la lógica inline. Idéntica fórmula al helper, pero sin pasar por él.
- **Esperado:** sustituir por `getLocationOwnerUserId(location)` para que cualquier evolución del resolver (p.ej. añadir `place.created_by`) propague.
- **Propuesta:** edit-1-line; añadir lint custom que prohíba `\.ownerUserId\s*\?\?\s*.*_docUserId` fuera de `location-owner.ts`.
- **Backlog:** BL-014.

### HI-002 · Política de cierre del popover divergente entre ejes
- **Categoría:** `hidden-coupling`
- **Severidad:** low
- **Archivo:** `src/components/toolbar/MyCatalogQuickFilters.tsx:6–11` (docstring).
- **Observado:** `healthFilter` cierra popover (porque dispara fit), `visualState` no (porque no mueve cámara). La regla está en docstring del componente, no en `subset-fit-contract` ni en `filter-axis-contract`.
- **Esperado:** invariante en `filter-axis-contract`: "cualquier eje cuyo cambio dispare `requestSubsetFit` debe cerrar la UI flotante que lo emitió".
- **Backlog:** no nuevo (queda como nota a añadir al contrato en próxima revisión).

### HI-003 · `minZoom` floor por caller, sin política
- **Categoría:** `duplicated-behavior` + `hidden-coupling`
- **Severidad:** medium
- **Archivos:**
  - `src/components/discovery/use-health-filter-fit.ts:75` → `minZoom: 7`
  - `src/components/discovery/HealthRepairPreviewDialog.tsx:108` → `minZoom: 7`
  - `src/components/UsersSidebar.tsx:386–390` → SIN minZoom (comentario explícito: "queremos ver TODOS los puntos del owner")
  - `src/components/toolbar/use-my-catalog-popover-fit.ts` → SIN minZoom (docstring línea 13)
  - `src/components/discovery/use-selection-fit-on-start.ts` → SIN minZoom
- **Observado:** cada caller decide su propio floor sin tabla central.
- **Esperado:** `subset-fit-contract` añade tabla `reason → minZoomFloor` (autoritativa).
- **Backlog:** no nuevo (mejora del contrato existente).

### HI-004 · Bypass de cooldown solo para `mode:'always'`
- **Categoría:** `undocumented-bypass` (resuelto, queda nota)
- **Severidad:** low
- **Archivo:** `src/components/LocationMap.tsx:2357`.
- **Estado:** documentado en `subset-fit-contract` Validation Notes (BL-003).
- **Acción:** ninguna; mantener vigilancia.

### HI-005 · `useV2Flags` con cache módulo-singleton TTL 60s
- **Categoría:** `hidden-coupling`
- **Severidad:** low
- **Archivo:** `src/hooks/use-v2-flags.ts:30–32` — `let cachedFlags`, `let cacheTime`, `CACHE_TTL = 60_000`.
- **Observado:** flags pueden divergir entre tabs durante 60s. El componente que las consume no expone el TTL.
- **Esperado:** documentar en ADR de feature flags V2 + invalidate vía `realtime` cuando cambie `app_settings`.
- **Backlog:** no nuevo (deuda conocida del dominio V2).

### HI-006 · Bucket Storage cambia entre `'default'` y `user.id` según rol
- **Categoría:** `hidden-coupling` + `hardcoded`
- **Severidad:** medium
- **Archivo:** `src/components/LocationPhotoSearch.tsx:122` — `const folder = isAdminMode ? 'default' : user.id;`
- **Observado:** literal `'default'` para imágenes oficiales; convención no documentada.
- **Esperado:** constante `OFFICIAL_PHOTOS_FOLDER` exportada + ADR breve sobre layout del bucket.
- **Backlog:** no nuevo.

### HI-007 · Coexistencia de dos buses de fit
- **Categoría:** `legacy-path` + `duplicated-behavior`
- **Severidad:** high
- **Sistemas:**
  1. `requestSubsetFit(ids, { mode, reason, coords?, minZoom? })` — canónico (`subset-fit-contract`).
  2. `window.dispatchEvent(new CustomEvent('map-fit-bounds', { detail: { bounds, padding, maxZoom } }))` — legacy.
- **Callers de `map-fit-bounds`:**
  - `src/pages/Index.tsx:455, 466`
  - `src/components/CollectionFocusView.tsx:96`
  - `src/components/OrphanFocusView.tsx:72`
  - `src/components/SegmentBreakdown.tsx:272`
  - `src/components/DuplicatesList.tsx:346`
  - `src/domains/content/components/DocumentsPanel.tsx:287`
  - `src/domains/content/components/DocumentFocusView.tsx:292`
  - `src/domains/content/components/DocumentContentManager.tsx:179`
  - `src/domains/routes/hooks/use-route-focus-bus.ts:26, 48`
- **Listener:** `src/components/LocationMap.tsx:355` (`addEventListener('map-fit-bounds', handleFitBounds)`).
- **Observado:** `map-fit-bounds` sigue siendo la vía para fits con `bounds` precalculados (collections, documents, routes). NO pasa por cooldown ni por la pipeline canónica de `subset-fit`.
- **Esperado:** `requestSubsetFit` acepta `bounds` directos como variante (`mode:'always'`, `coords` derivable de bounds), y `map-fit-bounds` queda deprecado con shim.
- **Backlog:** BL-015.

### HI-008 · `bounds inline` calculados en cada caller
- **Categoría:** `duplicated-behavior`
- **Severidad:** low
- **Archivos:** `Index.tsx:456, 467`, `SegmentBreakdown.tsx:272`, `CollectionFocusView.tsx`, `DocumentsPanel.tsx`, `DocumentFocusView.tsx` — todos hacen `[[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]`.
- **Esperado:** helper `boundsFromCoords(coords)` en `src/components/map/`.
- **Backlog:** se cubre en BL-015 (refactor del bus único).

### HI-009 · `divIcon` para markers no-POI dispersos
- **Categoría:** `partial-abstraction`
- **Severidad:** low
- **Archivos:** `LocationMap.tsx:438` (nearby-ref), `:967` (home), `:998` (user_gps), `:1508` (cluster), `map-photo-layer.ts:35`.
- **Contrato:** `mem://constraints/poi-icon-single-source-of-truth` (aplica a POIs).
- **Observado:** los 5 callsites son no-POI y no violan el SoT de POIs, pero comparten patrón (lectura de `getMarkerSizeConfig().{home,user_gps,nearby_result}` + template HTML inline). No hay factory común para overlays.
- **Esperado:** `createOverlayIcon(kind, options)` en `src/components/map/map-overlay-icons.ts`.
- **Backlog:** no nuevo.

---

# Resumen ejecutivo

| Severidad | Findings |
|---|---|
| critical | 0 |
| high | 2 (HI-001, HI-007) |
| medium | 6 (HC-001, HC-006, HC-007, HC-008, HC-010, HI-003, HI-006) |
| low | 11 |

Acciones inmediatas (alta severidad):
1. **HI-001** — corregir bypass `_docUserId` en `LocationMap.tsx:2124` (1 línea, sin riesgo). → BL-014.
2. **HI-007** — diseñar unificación de `map-fit-bounds` en `requestSubsetFit`. → BL-015 (proyecto).

Acciones medias (consolidables en una "Fase de tokens 5"):
3. **HC-001 + HC-002 + HC-003 + HC-004 + HI-003** — tabla canónica de `map.fit.*` + `subset-fit` constants. → BL-017.
4. **HC-008** — registro central de `localStorage` keys. → BL-016.
5. **HC-006 + HC-007** — completar codemod de color a tokens semánticos. → ya cubierto por color codemod fase 4.
6. **HC-005 + HC-009** — `src/shared/timings.ts`. → BL-019.
