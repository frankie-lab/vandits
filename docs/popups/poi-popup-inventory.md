# POI Popup Inventory + UX Contract Audit

> Status: **DISCOVERY ONLY**. Zero implementation, zero refactor, zero
> file moves, zero UI changes, zero camera/subset-fit/marker-grammar
> changes. Read-only mapping of the current popup surface area.
>
> Companion to `docs/interaction-primitives.md`, `docs/contracts/popup-contract.md`
> and `docs/contracts/canon-change-policy.md`.
>
> **Canon Change Policy**: cualquier paso de unificación/refactor sobre
> los popups descritos aquí dispara un **Migration Impact Check**
> obligatorio. Ver
> [`../contracts/canon-change-policy.md`](../contracts/canon-change-policy.md).

---

## 1. Resumen ejecutivo

### Conteo

- **1 generador HTML monolítico** principal: `createPopupContent()`
  (`src/components/map/map-popups.ts`, 1201 LOC, ~786 LOC en la propia
  función). Cubre POI propio enriched/imported/empty, POI seguido,
  POI de curator (legacy) y POI admin/workspace.
- **3 generadores HTML auxiliares** secundarios:
  - `createPhotoPopup()` — popups de fotos OneDrive
    (`src/components/map/map-photo-layer.ts`).
  - `bindPopup(\`<div>…</div>\`)` inline en `LocationMap.tsx` para
    **home marker** (línea ~1206) y **user location marker**
    (línea ~1117).
  - `bindPopup(\`<div>…</div>\`)` inline en
    `src/components/map/map-v2-renderer.ts` (línea 83) — popup V2
    paralelo.
- **1 generador React imperativo** dentro del popup:
  `bindRecoveryMount()` (`popup-recovery-mount.ts`) monta
  `<UnenrichedRecoveryBlock>` en `[data-recovery-root]` con
  `createRoot` + `MutationObserver`. `<UnenrichedRecoveryBlock>`
  embebe `<NearbyPanel variant="inline">` (contexto cercano inline).
- **8+ call sites** de `marker.setPopupContent(...)` en `LocationMap.tsx`,
  más 2 en `map-popup-handlers.ts` (`notes-updated`, `photo-updated`).
- **4 caminos de apertura programática** del popup
  (`marker.openPopup()`): `LocationMap.tsx` (click handler + pendingPopup +
  external focus), `useEnrichmentTracker.ts`, handlers de
  `notes/photo updated`, `CollectionFocusView.tsx`.

### Top 3 violaciones de contrato más graves

1. **Color hex hardcodeado en HTML inline** en todo `createPopupContent`
   (`#dbeafe`, `#bfdbfe`, `#fef3c7`, `#8b5cf6`, `#16a34a`, `#92400e`,
   `#f0fdf4`, `#dc2626`, `#fee2e2`, etc.) — viola `design system tokens v1`
   y `style/tokens/color-codemod-phase-4`. Los tokens de
   `card-style-tokens.ts` sólo se usan parcialmente.
2. **SVG icons hardcodeados inline** en `createPopupContent`,
   `createPhotoPopup`, `home/user marker popups` y `map-v2-renderer`
   — viola la regla Core "No Emojis / SVG library via `icon-utils.tsx`".
   Hay además `★`/`☆`/`▶`/`✕` (caracteres tipográficos) que el contrato
   trata como pseudo-iconos.
3. **Mezcla de dominio + visual + acciones en un único string HTML**:
   `createPopupContent` calcula `canEnrich`, `isCuratorPoint`,
   `visitRelevance`, `userImageVisibility`, lee `customData`, decide
   permisos admin y emite HTML — violación del separador
   `StatusSurface` (proyección pura) vs `ContextualSurface` (acciones).

### Top 3 quick wins (no implementar — sólo identificados)

1. Eliminar la rama `isCuratorPoint` y todo el branching asociado:
   Core rule "Curators & Druids REMOVED" es definitiva, pero el código
   y los datos `ownership.curatorId/curatorIcon/curatorColor/curatorAvatar`
   siguen vivos en `createPopupContent` y `PopupOwnership`. Verificar y
   purgar.
2. Reemplazar el bloque inline "user location popup" y "home marker
   popup" por el shell común (mismo `OverlaySurface` Leaflet, mismo
   tokenizado).
3. Reemplazar `★/☆/▶/✕` por SVG del icon library; centralizar
   `formatRegistrationDate` (re-implementado localmente).

---

## 2. Inventario por variante

> Notación: **AF** = `src/components/map/map-popups.ts`,
> **LM** = `src/components/LocationMap.tsx`,
> **PH** = `src/components/map/map-photo-layer.ts`,
> **V2** = `src/components/map/map-v2-renderer.ts`,
> **RM** = `src/components/map/popup-recovery-mount.ts`,
> **PA** = `src/domains/content/hooks/use-popup-actions.ts`.

### 2.1 POI propio enriched (`isOwn=true`, `isPointEnriched=true`)

| Campo | Contenido |
|---|---|
| Generador | `createPopupContent` (AF:415) rama `if (isEnriched && enriched)` (AF:635) |
| Activación | click marker → `marker.openPopup()` (LM:1791); rebuild via `setPopupContent` (LM:1907, 1960, 2015, 2077) |
| Datos | `GeoLocation.enrichedData` (descripcion, indice_interes, clasificacion, datos_geograficos, etiquetas, fuentes, observacion, punto_destacado, cultural_context), `customData` (visited, user_rating, notes), `ownership` |
| Acciones visibles | Re-enriquecer, Notas, Eliminar, Toggle visited, Rating 1–5, Filter-link chips (tags geo/clasificación/temáticos), Toggle secciones colapsables |
| Estados visuales | status bar gradient (criteria color), badge "Mi punto" azul, fecha registro, hero image, secciones colapsables `<details>`, badges colección, badges tags personales/source |
| Estados health/enrichment | `statusInfo` derivado de `getCriteriaColor` (criteria), `progressBarHtml` oculto que se activa durante re-enrich. **No** integra `getPointHealthRings` (los rings viven en el marker, no en el popup) |
| Superficie técnica | **HTML string** vía `marker.bindPopup(string)` + mount React imperativo (`UnenrichedRecoveryBlock`) suspendido para esta variante (no hay `[data-recovery-root]` cuando hay descripcion) |
| Mezcla visual + dominio + acciones | **Sí, total**: cálculo de visit-relevance, ratings, permisos admin, `canEditLocation` todos inline en HTML |
| Cierre | `closeButton: true` + `closeOnClick` (default Leaflet) + ESC nativo. **No** hay `onClose(reason)` unificado |
| Focus/camera | Click: `openPopup` + `centerOpenedPopupInVisibleMap`. **No** llama `requestSubsetFit`. `autoPan: false` con `autoPanPadding*` calculado desde CSS vars del header/bottom |
| Duplicación | Status bar gradient duplica visualmente health rings; badge "Mi punto" repetido vs sidebar; `formatRegistrationDate` local |
| Violaciones de contrato | Hex hardcodeados; SVG inline; mezcla dominio/visual; sin `onClose(reason)` |
| Primitives mapping | `OverlaySurface` (non-modal anchored) shell + `ContextualSurface` body + `StatusSurface` para badges/status bar + `ObservableAction` para botones + `FocusEmitter` para `centerOpenedPopupInVisibleMap` |

### 2.2 POI propio imported (`isOwn=true`, enriched=false, description≠'')

| Campo | Contenido |
|---|---|
| Generador | `createPopupContent` rama `else` (cuando `!isEnriched`) — fallback "ficha mínima" + bloque `[data-recovery-root]` |
| Activación | Igual que enriched |
| Datos | `location.name`, `description`, sin `enrichedData.descripcion` |
| Acciones visibles | Notas, Eliminar, Toggle visited, Rating, + `<UnenrichedRecoveryBlock>` (CTA "Enriquecer" único — `mem://logic/content/enrichment-trigger-unified`) |
| Estados visuales | status bar gradient (criteria status `unknown` o `previous`), ownership badge "Mi punto", host `[data-recovery-root]` |
| Estados health/enrichment | `progressBarHtml` host listo; recovery block React montado por `bindRecoveryMount` (RM:47) |
| Superficie técnica | **HTML string + React mount imperativo** (dual). El recovery block se re-monta cada vez que `setPopupContent` reemplaza el DOM, vigilado por `MutationObserver` |
| Mezcla | Sí. La rama de "Enrich button" enriched + "no enrich button — usar RecoveryBlock" empuja la decisión a tiempo de renderizado del string |
| Cierre | Igual que 2.1 |
| Focus/camera | Igual que 2.1 |
| Duplicación | El host `[data-recovery-root]` se reinstancia en cada `setPopupContent` — tres mecanismos coexisten para preservar el recovery: rule `popup-persist-on-rebuild` + `viewport-culling.keep-always` + `popup-recovery-mount` `MutationObserver` |
| Violaciones | Dual rendering frágil; mezcla string/React; mismas violaciones de tokens/SVG que 2.1 |
| Primitives | Mismo mapping que 2.1 + `BlockingOperation` (progress bar host) bound al popup |

### 2.3 POI propio empty (`isOwn=true`, sin description ni enrichedData)

| Campo | Contenido |
|---|---|
| Generador | `createPopupContent` rama `else` — idéntico shell que 2.2 |
| Activación | Click marker en POI empty. Core rule "Unenriched Waypoint Click" exige abrir Proximity Context — implementado vía `<UnenrichedRecoveryBlock>` embebiendo `<NearbyPanel variant="inline">` |
| Datos | `location.name`, `coordinates` |
| Acciones visibles | Recovery block (Enriquecer + Nearby inline) + Notas + Eliminar |
| Superficie técnica | HTML string + React mount imperativo |
| Mezcla | Sí |
| Cierre | Igual |
| Focus/camera | Igual + el contexto cercano marca `setNearbyPopupContextId(id)` que altera el render del *siguiente* popup (registro global mutable — ver §6) |
| Violaciones | Estado global `nearbyContextId` (mutable singleton sin React state) — funcional pero opaco a Devtools |
| Primitives | Igual que 2.2 + `StatefulSelection` candidato para `nearbyContextId` |

### 2.4 POI seguido (`isOwn=false`, `ownerName` presente)

| Campo | Contenido |
|---|---|
| Generador | `createPopupContent` con `ownership.isOwn=false` |
| Activación | Click marker followed |
| Datos | Mismos campos + `ownerName`, `isFollowing` |
| Acciones visibles | "+ Adoptar y Visitar" (combina visit + adopt), "Añadir a mi colección" (gradient verde), Rating personal (si admin), filter-link chips. **No** muestra Notas/Eliminar (no es del usuario) |
| Estados visuales | Badge "De {ownerName}" gradient ambar (`#fef3c7→#fde68a`); botón "+ Adoptar" azul (`#eff6ff`); admin warning amarillo si `canEditLocation && !isOwn` |
| Superficie técnica | HTML string (+ recovery mount si no enriched) |
| Mezcla | Sí. Curated-only sharing boundary (PR-1) decide qué datos pasan al popup — pero el popup no verifica, asume que `location` ya pasó `isShareablePoi` |
| Cierre | Igual |
| Focus/camera | Igual |
| Duplicación | Badge "De X" no comparte componente con sidebar `UsersSidebar` (que usa triángulo+nombre); admin warning duplicado con `PointContextActions.tsx` |
| Violaciones | Hex hardcodeados de gradients; identidad cromática del owner (canon PR-OWNER-IDENTITY-2.6) **no se refleja en el popup** — el badge usa ambar fijo, no el OKLCH persistido del owner |
| Primitives | Igual que 2.1 + el badge debería leer `getOwnerIdentityColor(uid)` |

### 2.5 POI de curator/druid (legacy — `isCuratorPoint = !!ownership.curatorId`)

| Campo | Contenido |
|---|---|
| Generador | Múltiples ramas `if (isCuratorPoint)` dentro de `createPopupContent` (AF:535, 679, 695, 719, 843, 852) |
| Activación | Nunca debería activarse — Core rule "Curators & Druids REMOVED" |
| Datos | `ownership.curatorId/curatorIcon/curatorColor/curatorAvatar` (legacy) |
| Estado | **Código muerto candidato.** El interface `PopupOwnership` (AF:209–214) aún declara `curatorId/curatorIcon/curatorColor/curatorAvatar`; el HTML aún ramifica para mostrar "Enriquecido {fecha}" en verde y rating ponderado IA+Comunidad |
| Violaciones | Viola Core rule de purga curators; mantiene branching ortogonal en toda la función |
| Plan | Verificar callers de `getLocationOwnership` y confirmar que `curatorId` siempre es `undefined` en producción → eliminar ramas |

### 2.6 POI admin / workspace edit (cualquier POI con `canEnrich=true && !isOwn`)

| Campo | Contenido |
|---|---|
| Generador | `createPopupContent` con `adminEditWarning` HTML (AF:522–529) |
| Activación | Usuario con permisos admin viendo POI ajeno no-curator |
| Acciones visibles | Banner amarillo "Modo Admin: Puedes editar este punto de {ownerName}" + acceso a todos los botones de edición |
| Violaciones | Permiso admin se evalúa visualmente en HTML — debería ser `StatusSurface` separado |
| Primitives | `StatusSurface` (banner) + `Selectable` para botones admin |

### 2.7 Home marker popup

| Campo | Contenido |
|---|---|
| Generador | Template literal inline en `LocationMap.tsx:1206-1215` |
| Activación | Click sobre home marker (configurado en `mapCenterConfig.homeLocation`) |
| Datos | `name`, `lat`, `lng` |
| Acciones | Ninguna |
| Superficie | HTML string inline, sin shell común |
| Violaciones | Color `#6b7280` hardcodeado; no usa `card-style-tokens` |
| Primitives | `OverlaySurface` + `StatusSurface` (read-only) |

### 2.8 User location popup

| Campo | Contenido |
|---|---|
| Generador | Template literal inline en `LocationMap.tsx:1117-1129` |
| Activación | Click sobre marker de geolocalización |
| Datos | `userLocation.source`, `lat`, `lng`, `accuracy` |
| Acciones | Ninguna |
| Violaciones | Texto "Tu zona aproximada" / "Tu ubicación" hardcodeado; color `#3b82f6` hardcodeado |
| Primitives | `OverlaySurface` + `StatusSurface` |

### 2.9 Photo popup (OneDrive)

| Campo | Contenido |
|---|---|
| Generador | `createPhotoPopup()` en `src/components/map/map-photo-layer.ts:64` |
| Activación | Click sobre marker foto (`PHOTO_LAYER_EVENT` toggle layer) |
| Datos | `PhotoIndexEntry` (thumbnail_url, name, lat/lng, …) |
| Acciones | (consultar archivo — fuera del scope POI propiamente dicho) |
| Superficie | HTML string, `className: 'custom-popup'`, `maxWidth: 320` |
| Mezcla | Limitada (no acciones de dominio) |
| Cierre | Defaults Leaflet |
| Violaciones | No comparte shell ni tokens con POI popup |
| Primitives | Mismo `OverlaySurface` shell debería envolver photo + POI body |

### 2.10 V2 renderer popup (paralelo)

| Campo | Contenido |
|---|---|
| Generador | Template inline en `src/components/map/map-v2-renderer.ts:83` |
| Activación | Render de `MapFeature[]` V2 (places/waypoints) — convive con `locations` legacy |
| Datos | `feature.name`, `entityType`, `ownershipSource` |
| Acciones | Ninguna; `onFeatureClick` callback externo opcional |
| Estado | **Pregunta abierta**: ¿este popup va a sustituir a `createPopupContent` o sólo aparece en flows V2-only? (V2 Architecture Active según Core) |
| Violaciones | Visual divergente, sin badges, sin status bar, sin tokens |
| Primitives | Mismo `OverlaySurface` shell |

### 2.11 Popup con `UnenrichedRecoveryBlock` (variante composicional)

- No es una variante separada — es un **bloque que se monta** dentro
  de 2.2/2.3 vía `bindRecoveryMount`.
- Componente: `src/domains/content/components/UnenrichedRecoveryBlock.tsx`
  (664 LOC).
- Cumple Core rule "Contexto cercano = INLINE en popup".
- Riesgo: ciclo de vida React fuera del React tree principal (createRoot
  imperativo + MutationObserver).

### 2.12 Popup con `<NearbyPanel variant="inline">` (composicional)

- Embebido dentro de `UnenrichedRecoveryBlock`.
- Marca `setNearbyPopupContextId(id)` cuando el usuario abre el panel de
  contexto → altera el render del *siguiente* popup (registro global
  mutable).

### 2.13 Popup con barra de progreso (composicional)

- `progressBarHtml` (AF:499-509) emite `<div id="popup-progress-${id}">`
  oculto en todos los popups.
- Activado externamente por `useEnrichmentTracker` / `use-popup-actions`
  mediante manipulación DOM directa (`document.getElementById`).
- Violación: efecto secundario sobre DOM externo al React tree.

---

## 3. Generadores — tabla resumen

| Generador | Archivo | LOC | Tipo | Output |
|---|---|---|---|---|
| `createPopupContent` | `src/components/map/map-popups.ts:415` | ~786 | HTML string monolítico | POI propio/seguido/curator/admin |
| `buildImageSection` | AF:251 | aux | HTML string | hero image |
| `buildCollectionChipsPlaceholder` | AF:166 | aux | HTML string | chips colecciones |
| `buildPersonalTagsBlock` | AF:187 | aux | HTML string | tags personales |
| `buildSourceHashtagsBlock` | AF:227 | aux | HTML string | source hashtags |
| `createPhotoPopup` | `map-photo-layer.ts:64` | ~80 | HTML string | foto OneDrive |
| `bindPopup(\`<div>…\`)` home | `LocationMap.tsx:1206` | ~10 | inline | home marker |
| `bindPopup(\`<div>…\`)` user | `LocationMap.tsx:1117` | ~13 | inline | user location |
| `bindPopup(\`<div>…\`)` V2 | `map-v2-renderer.ts:83` | ~7 | inline | feature V2 |
| `bindRecoveryMount` | `popup-recovery-mount.ts:47` | ~70 | React imperativo | `UnenrichedRecoveryBlock` |
| `setupNotesUpdatedHandler` | `map-popup-handlers.ts:353` | — | `setPopupContent` re-render | sync notes |
| `setupPhotoUpdatedHandler` | `map-popup-handlers.ts:385` | — | `setPopupContent` re-render | sync foto |

### 3.1 Quién dispara `setPopupContent` (8+ call sites)

```text
LocationMap.tsx:1907  → store collections subscription
LocationMap.tsx:1960  → enrichmentKey effect (per-location loop)
LocationMap.tsx:2015  → realtime tick coalesced refresh
LocationMap.tsx:2077  → (otro effect — confirmar contexto)
map-popup-handlers.ts:367  → notes-updated event
map-popup-handlers.ts:450  → photo-updated event
```

Cada call site re-renderiza el HTML completo y reemplaza el DOM →
dispara el `MutationObserver` de `popup-recovery-mount` que remonta el
React root. Tres mecanismos coexistentes para preservar el popup
(rule `popup-persist-on-rebuild` + `viewport-culling.keep-always` +
`MutationObserver`) — frágil bajo refactor.

### 3.2 Quién dispara `marker.openPopup()`

```text
LocationMap.tsx:1791       → click handler estándar
LocationMap.tsx:1980       → pendingPopupRef (apertura diferida)
LocationMap.tsx:2604       → focusedLocationId external sync
useEnrichmentTracker.ts:120 → tras burst de enrichment
map-popup-handlers.ts:368, 451 → re-open tras setPopupContent si estaba abierto
CollectionFocusView.tsx     → indirecto vía setFocusedLocation → openPopup
```

→ **6 caminos de apertura** sin abstracción común. Cualquier
unificación de `FocusEmitter` debe migrarlos todos coordinadamente.

---

## 4. Problemas de UI detectados

1. **Colores hex hardcodeados** en >100 lugares de `createPopupContent`.
   Lista parcial: `#dbeafe`, `#bfdbfe`, `#1e40af`, `#fef3c7`, `#fde68a`,
   `#92400e`, `#fcd34d`, `#f0fdf4`, `#dcfce7`, `#86efac`, `#166534`,
   `#8b5cf6`, `#7c3aed`, `#16a34a`, `#22c55e`, `#dc2626`, `#fee2e2`,
   `#3b82f6`, `#f59e0b`, `#d1d5db`, `#6b7280`, `#9ca3af`, `#374151`,
   `#1d4ed8`, `#93c5fd`, `#ede9fe`, `#5b21b6`, `#a16207`, `#78350f`.
   Mezclado con tokens parciales de `card-style-tokens` (`COLOR.*`,
   `CARD.*`, `FONT.*`, `HIGHLIGHT.*`, `OBSERVATION.*`,
   `SECTION_HEADER.*`).
2. **SVG inline en todos los botones y badges** — bypassa
   `app_settings.icon_library` y `icon-utils.tsx`. Caracteres `★/☆/▶/✕`
   usados como iconos.
3. **Tres familias divergentes de ownership badge** (azul "Mi punto",
   ambar "De X", verde curator) con gradients hardcoded, distintos
   de los usados en sidebar y marker tooltip.
4. **Estados textuales redundantes**: `statusLabels` local
   (`Completado/Pendiente actualizar/Sin ficha IA/Sin procesar`) no
   comparte fuente con la marker palette canónica (`enriched/imported/empty`)
   ni con el contrato visual `getPointVisualState`.
5. **Sin sincronización con identidad cromática del owner**
   (canon PR-OWNER-IDENTITY-2.6). El badge "De X" usa ambar fijo en
   vez del color OKLCH persistido.
6. **`autoPan` y `autoPanPadding*` recomputados inline** desde
   CSS vars en cada bind — coste no trivial, sin memoización.

---

## 5. Problemas de arquitectura

1. **Generación dual** (HTML string + React mount) en el mismo popup.
   Coordinada por `MutationObserver` — funciona pero es frágil ante
   cualquier cambio de timing de `setPopupContent`.
2. **Lógica de dominio en el renderer**: `canEnrich`, `isCuratorPoint`,
   `visitRelevance`, `userImageVisibility`, permisos admin, validez de
   foto GPS, todos calculados o leídos en `createPopupContent`.
3. **8+ call sites de `setPopupContent`** sin abstracción común. No
   existe `refreshPopup(locationId)` único.
4. **6 caminos de apertura** del popup. `useEnrichmentTracker`,
   `CollectionFocusView`, click handler, pendingPopup, external focus
   y re-open tras handlers compiten.
5. **Tres mecanismos coexistentes** para persistencia del popup ante
   rebuilds: `popup-persist-on-rebuild` rule + `viewport-culling`
   `keep-always` set + `popup-recovery-mount` `MutationObserver`.
6. **Estado global mutable** `nearbyContextId` (singleton fuera de
   React) altera el render del siguiente popup.
7. **DOM externo** manipulado por `progressBarHtml` + handlers que
   buscan por `document.getElementById('popup-progress-…')`.
8. **`PopupOwnership` mezcla owner + curator + admin** en un único
   shape — viola separación de concerns.
9. **`map-v2-renderer` y `createPopupContent` no comparten shell** —
   dos universos visuales coexisten.

---

## 6. Duplicidades concretas

- `formatRegistrationDate` (local en `createPopupContent`) vs `formatTimeAgo`
  (importado) — convenciones distintas.
- Badge ownership repetido en popup, sidebar (`UsersSidebar`),
  marker tooltip (`buildHoverTooltipHtml`).
- Status bar gradient replica visualmente health rings sin compartir
  helper (`getCriteriaColor` vs `getPointHealthRings`).
- Admin warning HTML parcialmente duplicado en
  `src/domains/content/components/PointContextActions.tsx`.
- Photo popup vs POI popup: dos shells distintos, mismo Leaflet.
- Home/user popup vs POI popup: tres shells distintos en el mismo mapa.
- `★/☆` para rating aparece en al menos 3 ramas (`weighted-rating`,
  `indice_interes`, `user_rating`).
- `centerOpenedPopupInVisibleMap` se llama tras `openPopup` en click
  handler, pero no tras los otros 5 caminos de apertura.

---

## 7. Violaciones de contrato (referenciadas)

| Contrato | Violación | Ubicación |
|---|---|---|
| `docs/contracts/popup-contract.md` | Mezcla dominio/visual/acciones | AF:415–1201 |
| `popup-matrix-rule` (`mem://style/popup/matrix-rule`) | Variantes no derivadas de matriz canónica `visualState × ownership` | AF branching |
| `popup-collapsible-sections` | Implementado vía `<details>` + tokens parciales | AF:132–158 |
| `popup-dimensions-and-scrolling` | Implementado pero `POPUP_MAX_HEIGHT` recomputado inline; `min-width: 360 / max-width: 360` ok | AF:92, LM:1746–1747 |
| `popup-persist-on-rebuild` (`mem://logic/map/popup-persist-on-rebuild`) | Cumplido vía 3 mecanismos paralelos (riesgo) | RM, viewport-culling, rule |
| Core "Contexto cercano = INLINE" | Cumplido | `UnenrichedRecoveryBlock` + `<NearbyPanel inline>` |
| `unenriched-waypoint-click-behavior` | Cumplido vía recovery block | RM + AF rama no-enriched |
| Marker palette 3 estados únicos | El popup usa labels propios (`Completado/Pendiente/…`) en vez de `enriched/imported/empty` | AF:438–443 |
| `poi-icon-single-source-of-truth` | Cumplido en marker; el popup no usa `createCustomIcon` (no aplica) | — |
| Design system tokens v1 | Violado masivamente (hex inline) | AF entero |
| Color codemod Phase 4 | Violado | AF entero |
| No Emojis / SVG library | Violado (SVG inline + `★☆▶✕`) | AF, V2, PH, LM home/user |
| Curators & Druids REMOVED | Violado (branching legacy aún presente) | AF:435, 695, 843, 852 |
| Followed POI grammar (PR-OWNER-IDENTITY-2.6) | Badge no usa `getOwnerIdentityColor` | AF:463 |

---

## 8. Mapping a primitives (preliminar, sin prescribir API)

| Bloque actual | Primitive recomendado |
|---|---|
| Leaflet popup wrapper (`bindPopup` + opciones) | `OverlaySurface` (non-modal, anchored, `onClose(reason)`) |
| Body React del POI (todas las variantes 2.1–2.6) | `ContextualSurface` (entity-bound a `location.id`) |
| Status bar / ownership badge / health badges / criteria color | `StatusSurface` (pointer-transparent, pure projection) |
| Botones `popup-action-btn` (enrich, notes, delete, visit, rating, add-to-collection) | `Selectable` + `ObservableAction` con `opId` único — hoy emiten `CustomEvent('popup-action')` sin opId |
| `marker.openPopup` + `centerOpenedPopupInVisibleMap` + `flyTo` post-enrich | `FocusEmitter` con reason canónico (`popup-open`, `popup-persist-rebuild`, `enrichment-burst`) |
| `progressBarHtml` + DOM imperativo | `BlockingOperation` lane bound al popup |
| `UnenrichedRecoveryBlock` (React imperativo) | `ContextualSurface` montado nativo (sin `createRoot` manual) |
| `<NearbyPanel variant="inline">` | `ContextualSurface` anidado |
| Photo popup, home popup, user popup, V2 popup | Mismo `OverlaySurface` shell, distintos `ContextualSurface` body |
| `nearbyContextId` singleton mutable | `StatefulSelection` axis registrado |

---

## 9. Riesgos

1. **`createPopupContent` es zona peligrosa**: ~786 LOC monolíticos,
   acoplados a `card-style-tokens`, `enrichment card schema`,
   `getCriteriaColor`, `parseLocalizacionToLinks`, `formatTimeAgo`,
   filter-link delegation. Cualquier refactor coordinado debe preservar
   visualmente cada rama.
2. **`popup-recovery-mount` + `MutationObserver`** depende del timing
   de `setPopupContent`. Migrar a React puro requiere desactivar el
   observer y reemplazar 8+ call sites con un mismo helper de refresh.
3. **6 caminos de apertura** — migrar a `FocusEmitter` exige cubrir
   click, pendingPopup, enrichmentTracker, focused sync, handlers
   re-open, CollectionFocusView. Olvidar uno deja popups que no se
   abren.
4. **`viewport-culling.keep-always`** comparte ownership del popup
   abierto — cualquier cambio en lifecycle debe mantener `keepIds`.
5. **`map-v2-renderer`** convive con popup legacy: ¿es zona muerta o
   activa? La duplicación se resolverá distinto según la respuesta.
6. **`PopupOwnership.curator*`** — si hay datos legacy en BD/cache, la
   purga puede romper instancias en producción hasta que se confirme
   limpieza.
7. **`progressBarHtml` + handlers** — sustituir por React requiere
   coordinar con `use-popup-actions.ts` (647 LOC).

---

## 10. Quick wins (listado — NO implementar)

- **QW-1**: Tokenizar todos los hex inline → `card-style-tokens` /
  CSS vars del design system. Bajo riesgo si se preserva el output
  visual.
- **QW-2**: Sustituir SVG inline por referencias a icon library;
  reemplazar `★/☆/▶/✕`.
- **QW-3**: Centralizar `formatRegistrationDate` en un helper único.
- **QW-4**: Confirmar muerte de curators y eliminar todo branching
  `isCuratorPoint` + campos curator de `PopupOwnership`.
- **QW-5**: Memoizar el cómputo de `autoPanPadding*` (hoy se ejecuta
  en cada `bindPopup`).
- **QW-6**: Unificar home/user/V2 popups bajo el mismo helper de
  "popup informativo simple" (no POI).
- **QW-7**: Añadir `opId` a `CustomEvent('popup-action', …)` para
  cumplir contrato `ObservableAction` antes del refactor mayor.
- **QW-8**: Hacer que el badge "De {ownerName}" lea
  `getOwnerIdentityColor(uid)` (canon PR-OWNER-IDENTITY-2.6).

---

## 11. Plan preliminar de unificación (sin compromiso)

Cada fase exige su propio **Migration Impact Check** según
`docs/contracts/canon-change-policy.md`. Orden sugerido:

1. **Fase 0 — Quick wins QW-1..QW-8** (visual + dead code). Sin cambio
   estructural.
2. **Fase 1 — Extraer `StatusSurface`s puros** (status bar, ownership
   badge, criteria badges, admin warning) a componentes/helpers
   read-only. Sin cambiar la generación HTML aún.
3. **Fase 2 — Centralizar apertura** detrás de `FocusEmitter`:
   `requestPopupOpen({ locationId, reason })` consumido por los 6
   caminos. Sin tocar contenido.
4. **Fase 3 — Centralizar refresh** detrás de `refreshPopup(locationId)`
   único, sustituyendo los 8+ `setPopupContent` directos. Mantiene
   el `MutationObserver` provisional.
5. **Fase 4 — Migrar body a `ContextualSurface` React** (montaje
   nativo en `popupopen`), eliminando el HTML string. Retira
   `popup-recovery-mount` (el recovery block se vuelve hijo React
   normal). Riesgo alto — requiere preservar `popup-persist-on-rebuild`.
6. **Fase 5 — Unificar photo/home/user/V2 popups** bajo el mismo
   `OverlaySurface` shell.
7. **Fase 6 — Promocionar `nearbyContextId` a `StatefulSelection`**.

---

## 12. Deuda explícita y open questions

- **OQ-1**: ¿`ownership.curatorId` está realmente muerto en producción?
  Confirmar con auditoría de `getLocationOwnership` callers.
- **OQ-2**: ¿`map-v2-renderer.ts` popup convive con legacy o lo va a
  sustituir? Si lo sustituye, el plan de unificación cambia.
- **OQ-3**: ¿Hay popups de POI fuera del mapa (sidebar focus views,
  collection focus view, document focus view) que también muestren
  ficha POI completa y deban entrar en el inventario? Confirmar con
  `DocumentFocusView.tsx`, `CollectionFocusView.tsx`,
  `PointContextActions.tsx` (1028 LOC).
- **OQ-4**: ¿`canEnrich` se evalúa igual en el popup que en el resto
  de la app (admin panel, sidebars)? Si diverge, la centralización
  cambia el comportamiento.
- **OQ-5**: ¿`use-popup-actions.ts` (647 LOC) debería formar parte de
  este inventario como capa "popup action contract"?
- **OQ-6**: `LocationMap.tsx:2077` — confirmar contexto de este call
  site específico (efecto adicional de `setPopupContent` no
  documentado en §3.1).

---

## 13. Histórico

- 2026-05 — Inventario inicial creado tras Pilot 1 y la política
  Canon Change Policy. Discovery puro, sin código tocado.
