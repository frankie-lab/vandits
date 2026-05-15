# Uniformity Audit

Auditoría de comportamientos equivalentes implementados de forma divergente.
Mismo formato y categorías que `hardcoded-behaviors-audit.md`.

---

## U1 — FilterBar vs MyCatalogQuickFilters (popover)

- **Categoría:** `duplicated-behavior` + `partial-abstraction`
- **Severidad:** medium
- **Archivos:**
  - `src/components/FilterBar.tsx:66, 75–76` — `useFilteredLocations()` + `getBucketStats(filteredLocations, user?.id)`.
  - `src/components/toolbar/MyCatalogQuickFilters.tsx` — `getMyCatalogQuickCounts(...)` (`src/domains/content/lib/my-catalog-quick-counts.ts`).
- **Contrato:** `filter-axis-contract` · `mem://logic/content/location-bucket-matrix`.
- **Observado:** dos APIs de conteo paralelas:
  - `getBucketStats(locs, currentUserId)` → buckets globales (`myCatalog`, `catalogTotal`, `workspaceTotal`, …).
  - `getMyCatalogQuickCounts(allLocs, currentUserId, layerVisibility)` → counts segmentados por par `(visualState, healthFilter)` restringidos a `ownership='mine'`.
- **Divergencia:** ambos resuelven ownership, pero `getMyCatalogQuickCounts` re-implementa el filtrado por `getLocationOwnerUserId` (`my-catalog-quick-counts.ts:55`) sin compartir el matcher con `matchesLocationFilters`. Si la regla "qué cuenta como mine" cambia, hay dos sitios.
- **Esperado:** un único `countByBucket(filters, locs, ctx)` parametrizado; el popover y la toolbar consumen vistas distintas del mismo cálculo.
- **Backlog:** entra como sub-item de BL-014 (single-resolver).

---

## U2 — Subset-fit callers

- **Categoría:** `duplicated-behavior`
- **Severidad:** medium
- **Callers (canónico):**
  | Caller | reason | mode | minZoom | debounce | coords pre-resueltas |
  |---|---|---|---|---|---|
  | `use-selection-fit-on-start.ts:48` | `selection-fit` | implicit | — | 250ms | no |
  | `use-health-filter-fit.ts:69` | `health-filter` | `if-outside` | 7 | no | no |
  | `HealthRepairPreviewDialog.tsx:105` | `repair-preview` | `always` | 7 | no | no |
  | `use-my-catalog-popover-fit.ts:137` | `my-catalog-popover:*` | `always` | — | no | sí |
  | `UsersSidebar.tsx:390` | `user-filter` | `always` | — | no | sí |
  | `SourceFilterBridge.tsx:71` | `source-filter` | n/a | n/a | — | n/a |
- **Observado:** seis callers, tres reasons distintas, dos modes, dos políticas de minZoom, dos políticas de debounce, dos políticas de coords pre-resueltas. La mayoría heredada por copia.
- **Esperado:** tabla central en `subset-fit-contract` (Anexo: políticas por `reason`) y los hooks la consumen vía constante exportada — no la duplican en cada call.
- **Backlog:** parte de BL-015.

---

## U3 — Popup open/close paths

- **Categoría:** `partial-abstraction`
- **Severidad:** low (ADR-0001 ya consolidó la pieza crítica)
- **Archivos:**
  - `src/components/LocationMap.tsx:1407` (`map.on('popupopen')`) y `:1436` (`map.on('popupclose')`) — handlers únicos a nivel mapa.
  - `src/components/map/map-popup-handlers.ts:368, 451` — re-llaman `marker.openPopup()` tras setIcon.
  - `src/components/map/popup-recovery-mount.ts:51, 109` — handlers POR-MARKER de `popupopen/popupclose` para hidratar React.
  - `src/components/map/useEnrichmentTracker.ts:120` — `marker.openPopup()` programático tras enrichment.
- **Contrato:** `popup-contract` · ADR-0001.
- **Observado:** el deselect canónico vive en el handler único de mapa (correcto). Pero la apertura programática vive en 4 sitios distintos (re-icon, recovery mount, enrichment tracker, click handler). Cada uno asume condiciones (zoom, focus, viewport) sin tabla común.
- **Esperado:** un único `openPopupForLocation(locationId, { reason })` con telemetría. Los 4 callsites lo invocan.
- **Backlog:** no nuevo (deuda de medio plazo, queda en notas de `popup-contract`).

---

## U4 — Focus setters

- **Categoría:** `divergent-ownership`
- **Severidad:** low
- **Setters:**
  - `setFocusedLocation` (canónico, `focus-selection-contract`).
  - `useDocumentFocus` (`src/domains/content/hooks/use-document-focus.ts`) — focus de documento, ortogonal a POI.
  - `useRouteFocusBus` — focus de ruta (`map-fit-bounds` directo).
- **Observado:** tres conceptos de "focus" coexisten sin contrato común. Cada uno tiene su propia regla de pan/zoom y su propia limpieza.
- **Esperado:** documentar en `focus-selection-contract` la matriz `focusType ∈ {poi, document, route} × {setter, reset, sideEffect}`.
- **Backlog:** no nuevo (mejora del contrato existente).

---

## U5 — Ownership resolution

- **Categoría:** `divergent-ownership`
- **Severidad:** high
- **Detalle:** ver HI-001 en `hardcoded-behaviors-audit.md`.
- **Backlog:** BL-014.

---

## U6 — `healthFilter` vs `visualState`

- **Categoría:** `duplicated-behavior`
- **Severidad:** medium
- **Archivos:**
  - `src/domains/content/lib/location-filtering.ts:132` (`visualState` matcher) y `:199` (`healthFilter` matcher con `includeHealth` flag).
  - `src/domains/content/hooks/use-filtered-locations.ts` exporta `useFilteredLocations` y `useFilteredLocationsIgnoringHealth` — dos hooks porque algunos consumidores necesitan el universo SIN healthFilter.
- **Observado:** los dos ejes viven en el mismo matcher pero con asimetrías:
  - `visualState` siempre se aplica.
  - `healthFilter` es opcional según `includeHealth`.
  - El popover trata uno como "cierra cámara" y el otro como "no cierra cámara" (HI-002).
- **Esperado:** declarar en `filter-axis-contract` la "policy" de cada eje: `{ closesPopover, triggersFit, includedInDefault }`. Centralizar el matcher con un `axisRegistry`.
- **Backlog:** no nuevo (mejora del contrato).

---

## U7 — `LocationMap` listeners globales

- **Categoría:** `hidden-coupling`
- **Severidad:** low (cubierto en `duplicate-listeners-audit.md`)
- **Listeners en `LocationMap.tsx`:**
  - `map.on('popupopen')` L1407
  - `map.on('popupclose')` L1436
  - `map.on('movestart'/'zoomstart'/'dragstart')` (`lastUserInteractionAt`)
  - `window.addEventListener('map-fit-bounds')` L355
  - `window.addEventListener('lovable:owner-identity-updated')` L2140
  - listener único de `subset-fit` (`subset-fit.ts`).
- **Observado:** dos buses (`map-fit-bounds` y `subset-fit`) compiten por mover la cámara. El cooldown solo aplica a `subset-fit`. Ningún test asegura `count === 1` en cada listener (ver BL-012).
- **Esperado:** unificar en BL-015; añadir test de count.
- **Backlog:** BL-015 + BL-012.

---

## U8 — Heavy operation triggers

- **Categoría:** `partial-abstraction`
- **Severidad:** medium (ya documentado en `heavy-operations-contract` BL-006)
- **Archivos cableados:** solo `src/components/toolbar/use-my-catalog-popover-fit.ts:83, 141` y `src/components/toolbar/MyCatalogQuickFilters.tsx` invocan `startOperation`/`finishOperation`.
- **No cableados:** lanes existentes (`EnrichmentLane`, `GeocodingLane`, `OperationsLane`, `image-recovery-job-store`) llevan su propio progreso por canal.
- **Esperado:** en Fase 2 todas las lanes registran sus ops en el store unificado.
- **Backlog:** BL-006 (existente).

---

## U9 — Marker grammar vs legacy icon factory

- **Categoría:** `partial-abstraction`
- **Severidad:** low
- **Archivos:**
  - `src/components/map/map-icons.ts` → `createCustomIcon(...)` — SoT de POI.
  - `src/components/LocationMap.tsx:438, 967, 998, 1508` y `src/components/map/map-photo-layer.ts:35` — `L.divIcon` directo para markers no-POI.
- **Observado:** correcta separación POI vs overlay; sin embargo no hay un `createOverlayIcon` que documente la familia.
- **Esperado:** ver HI-009 en `hardcoded-behaviors-audit.md`.
- **Backlog:** no.

---

## U10 — Visibility vs filtering

- **Categoría:** `divergent-ownership` (acotado, ya documentado)
- **Severidad:** medium
- **Archivos:**
  - `filteredLocations` (`useFilteredLocations`) — universo lógico tras filtros del store.
  - `markerLocations` — subset físicamente renderizado (filteredLocations ∩ viewport culling z≥7).
  - Visibility per-source (`use-layer-visibility.ts` + `applyLayerVisibility`) — corte adicional por `layerGroupKey` y zoom gates.
- **Observado:** tres conceptos (filtrar, cullar, ocultar por capa) componen la cadena visible. Cada caller debe saber cuál usar:
  - counts → `filteredLocations`.
  - fit por usuario → `filteredLocations` (no markerLocations, ver Core memory subset-fit).
  - render → `markerLocations`.
- **Esperado:** comentario en `visibility-contract` con la regla `filteredLocations ⊇ markerLocations` + ejemplo de cuándo usar cada subset (ya parcialmente documentado).
- **Backlog:** no nuevo.

---

## U11 — Eventos `lovable:*` sin registro central

- **Categoría:** `hidden-coupling`
- **Severidad:** low
- **Inventario:**
  | Evento | Dispatcher | Listener |
  |---|---|---|
  | `lovable:apply-source-filter` | `SourceHashtag.tsx`, `SourceFilterBridge.tsx` | `SourceFilterBridge.tsx` |
  | `lovable:follow-changed` | `UsersSidebar.tsx:305, 344` | `Index.tsx:196` |
  | `lovable:image-recovery-job-tick` | `image-recovery-job-store.ts:150` | `RecoverImagesPanel.tsx:256` |
  | `lovable:list-grouping-changed` | `use-list-grouping.ts:14` | (consumidores) |
  | `lovable:my-catalog-popover-applied` | `MyCatalogQuickFilters.tsx` | `use-my-catalog-popover-fit.ts:5` |
  | `lovable:my-catalog-popover-empty` | idem | idem |
  | `lovable:open-users-sidebar` | `FloatingToolbar.tsx:694, 713` | `UsersSidebar.tsx:133` |
  | `lovable:owner-identity-updated` | `owner-identity-store.ts:13, 35` | `LocationMap.tsx:2140`, `UsersSidebar.tsx:116` |
  | `lovable:profile-updated` | `use-auth.ts:227` | `use-auth.ts:96` |
- **Observado:** 9 eventos con `detail` schemas heterogéneos. Solo `events.ts:43` declara una constante (`MY_CATALOG_POPOVER_APPLIED_EVENT` etc.); el resto son strings inline.
- **Esperado:** `src/domains/events.ts` (existe) ampliado para registrar TODOS los eventos `lovable:*` con tipo `detail` y dispatcher/listener allowlist.
- **Backlog:** BL-018.

---

# Uniformity candidates (ranking de consolidación)

Lista priorizada de abstracciones que deberían existir / unificarse.

1. **Single fit bus** (`requestSubsetFit` absorbe `map-fit-bounds`) → BL-015. Resuelve U2, U7, U10 parcial, HC-001, HC-002, HI-007, HI-008.
2. **Owner resolver enforcement** (lint + corrección de LocationMap:2124) → BL-014. Resuelve U5, HI-001.
3. **`map.fit.*` tokens + `SUBSET_FIT_COOLDOWN_MS`/`DEBOUNCE_MS` exportados** → BL-017. Resuelve HC-001..004, HI-003.
4. **Storage keys registry** (`src/shared/storage/keys.ts` + helpers tipados) → BL-016. Resuelve HC-008.
5. **Event registry** (`src/domains/events.ts` ampliado a 9 eventos) → BL-018. Resuelve U11.
6. **Timings module** (`src/shared/timings.ts`) → BL-019. Resuelve HC-005, HC-009.
7. **Color tokens fase 5** (semantic state colors `--state-{warning,success,danger}` + workspace) — continuación natural del codemod. Resuelve HC-006, HC-007.
8. **`countByBucket()` único** (FilterBar/MyCatalogQuickFilters comparten) — sub-item BL-014. Resuelve U1.
9. **Filter axis registry** (`{ closesPopover, triggersFit, … }` por eje) — mejora `filter-axis-contract`. Resuelve U6, HI-002.
10. **Overlay icon factory** (`createOverlayIcon`) — opcional. Resuelve U9, HI-009.

Las 6 primeras son las que cierran findings `high`/`medium` y deberían entrar al backlog técnico activo. Las 4 últimas son mejoras de contrato + abstracciones convenientes.
