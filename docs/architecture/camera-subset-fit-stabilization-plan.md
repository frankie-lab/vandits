# Camera / Subset-Fit Stabilization Plan

_Plan gradual de convergencia hacia un único pipeline de cámara._

## Status

| Phase | Estado | PR / Commit |
|---|---|---|
| 1 — Freeze + Observability | **shipped (code-level)** | PR-CAMERA-PHASE-1 |
| 2 — Isolate | not started | — |
| 3 — Redirect | not started | — |
| 4 — Deprecate | not started | — |
| 5 — Remove | not started | — |

**Phase 1 entregado:**
- `FIT_REASONS` y `FitReason` congelados en `src/components/map/subset-fit.ts`. Cualquier `reason` fuera del enum dispara `console.warn` (no bloqueante).
- Flag dev `localStorage.vandits_debug_camera_fit` (`'true'`/`'false'`). Por defecto ON en `import.meta.env.DEV`, OFF en producción.
- `window.__cameraFitMetrics` con: `totalRequests`, `byReason`, `byMode`, `unknownReasons`, `coordsProvided`, `resolvedFromCoords`/`resolvedFromMarkers`, `cooldownSkipped`, `cooldownBypassedByAlways`, `directLeafletCalls`, `bypasses[]`, `lastRequest`. **Reset oficial in-place: `window.__cameraFitMetrics.reset()`** (método no-enumerable, no aparece en `JSON.stringify`). También expuesto como `resetCameraFitMetrics()`. La referencia del objeto se preserva entre resets.
- `installCameraFitObserver()` monkey-patch idempotente sobre `L.Map.prototype.{fitBounds,flyTo,setView}`. Solo activo cuando el flag está ON. Llamadas que no se originan en el listener canónico se cuentan como bypass + `console.warn`. NO altera el comportamiento (delega en la implementación original).
- Listener en `LocationMap.tsx` reporta `cooldownSkipped` / `cooldownBypassedByAlways` / `resolvedFrom: 'coords'|'markers'` vía `recordFitOutcome`.
- **Panel de QA dev (`src/components/debug/CameraFitQaPanel.tsx`)** — botón flotante "Camera QA" visible solo cuando `isCameraFitDebugEnabled()` (dev por defecto, prod opt-in vía `localStorage` o `?debugCameraFit=1`). Permite leer métricas en vivo (polling 500ms), etiquetar el snapshot con un selector de flujo (`F1..F12` + `AGGREGATE`), reset in-place, copiar JSON al portapapeles y descargar JSON. El payload exportado incluye `timestamp`, `route`, `viewportSize`, `flowLabel` y `metrics` completas. NO requiere abrir DevTools.
- Cero cambio de UX. Cooldown, padding, maxZoom y comportamiento visual idénticos.

**Inputs originales:**

**Inputs:**
- `docs/audits/constants-thresholds-inventory.md` §7 (5 buses paralelos)
- `docs/audits/event-bus-inventory.md` §7 (high-risk findings)
- `docs/audits/structural-risk-priority.md` T1-A
- `mem://logic/map/subset-fit-contract`

**Scope:** todo movimiento programático de la cámara Leaflet (`fitBounds`, `flyTo`, `setView`, `panTo`) y el evento `map-fit-bounds`. Fuera de scope: `panTo` para popup recenter, geolocation boot.

---

## 1. Canonical pipeline

```text
┌───────────────────────────────────────────────────────────────────────┐
│ (1) caller                                                             │
│     consola / panel / sidebar / dialog / hook                          │
│     entrada permitida: ids[] | bounds | coords[]                       │
│     entrada prohibida: llamada Leaflet directa                         │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ (2) requestSubsetFit(input, { mode, reason, padding?, maxZoom? })      │
│     src/components/map/subset-fit.ts                                   │
│     - normaliza input a FitRequest                                     │
│     - valida reason (whitelist)                                        │
│     - valida mode ∈ {'always','if-outside'}                            │
│     - emite intent vía evento privado interno                          │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ (3) listener único en LocationMap.tsx                                  │
│     - única suscripción global                                         │
│     - resuelve mapRef vivo                                             │
│     - delega en (4)                                                    │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ (4) bounds resolver                                                    │
│     prioridad:                                                         │
│       1. coords explícitas en payload                                  │
│       2. bounds explícitos en payload                                  │
│       3. ids → markerLocations → L.latLngBounds                        │
│     fallback: noop + warn (NO mover cámara)                            │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ (5) cooldown policy                                                    │
│     - manualGestureLock: 4s desde último movestart/zoomstart/dragstart │
│     - mode 'always' → ignora gestureLock                               │
│     - mode 'if-outside' → respeta gestureLock + 40% overlap threshold  │
│     - reasons whitelisted bypass gestureLock                           │
│       ('user-filter', 'health-repair-preview')                         │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ (6) fit execution                                                      │
│     - clamp maxZoom = min(payload.maxZoom ?? 12, 14)                   │
│     - padding default = [60, 60]                                       │
│     - una sola llamada map.fitBounds(...)                              │
│     - emit telemetry { reason, mode, bypassed, ts }                    │
└───────────────────────────────────────────────────────────────────────┘
```

**Invariantes del pipeline:**

| # | Invariante |
|---|---|
| I1 | Solo `subset-fit.ts` y el listener único conocen la API Leaflet de cámara para "fit". |
| I2 | `requestSubsetFit` es el único entry point para movimiento programático "ver subconjunto". |
| I3 | Cualquier `flyTo`/`setView`/`fitBounds` fuera del listener pertenece a (a) boot, (b) popup recenter, (c) botones explícitos del usuario. Lista cerrada y nombrada. |
| I4 | El cooldown se aplica en un único punto (paso 5). No hay guards duplicados en callers. |
| I5 | `reason` es enum cerrado. PRs nuevos requieren añadir el valor al enum y documentarlo. |
| I6 | Telemetría es obligatoria en producción para detectar bypasses. |

---

## 2. Inventory classification

Clasificación de los callsites detectados en `constants-thresholds-inventory.md` §7. Una fila por callsite.

### 2.1 Canonical (mantener tal cual)

| File:Line | API | Notas |
|---|---|---|
| `src/components/map/subset-fit.ts:59` | `requestSubsetFit` (definición) | Núcleo del pipeline. |
| `src/components/discovery/HealthRepairPreviewDialog.tsx:105` | `requestSubsetFit` | reason: `health-repair-preview`. |
| `src/components/discovery/use-health-filter-fit.ts:69` | `requestSubsetFit` | reason: `health-filter`. |
| `src/components/discovery/use-selection-fit-on-start.ts:48` | `requestSubsetFit` | reason: `selection-on-start`. |
| `src/components/toolbar/use-my-catalog-popover-fit.ts:137` | `requestSubsetFit` | reason: `my-catalog-popover`. |
| `src/components/UsersSidebar.tsx:390` | `requestSubsetFit` | reason: `user-filter`. |
| `src/components/poi/SourceFilterBridge.tsx:71` | `requestSubsetFit` | reason: `source-filter`. |
| `src/components/LocationMap.tsx:355` | `addEventListener('map-fit-bounds')` | **Migra a listener interno de `requestSubsetFit`**, mantener mientras dure la transición. |

### 2.2 Legacy (migrable a `requestSubsetFit` 1-a-1)

Emisores de `map-fit-bounds`. Cada uno traduce a `requestSubsetFit(input, { mode, reason })` con `reason` específico.

| File:Line | Reason propuesto | Mode propuesto | Notas |
|---|---|---|---|
| `src/pages/Index.tsx:455` | `index-route-focus` | `always` | revisar payload original. |
| `src/pages/Index.tsx:466` | `index-route-focus` | `always` | duplicado del anterior; consolidar. |
| `src/domains/routes/hooks/use-route-focus-bus.ts:26` | `route-focus` | `always` | bus interno de routes; sustituirlo por hook que llame `requestSubsetFit`. |
| `src/domains/routes/hooks/use-route-focus-bus.ts:48` | `route-focus` | `always` | idem. |
| `src/components/SegmentBreakdown.tsx:272` | `segment-focus` | `always` | payload con `maxZoom: 14, padding: [80,80]`. |
| `src/components/CollectionFocusView.tsx:96` | `collection-focus` | `always` | |
| `src/domains/content/components/DocumentFocusView.tsx:292` | `document-focus` | `always` | |
| `src/domains/content/components/DocumentContentManager.tsx:179` | `document-content` | `always` | |
| `src/domains/content/components/DocumentsPanel.tsx:287` | `documents-panel` | `always` | |
| `src/components/OrphanFocusView.tsx:72` | `orphan-focus` | `always` | |
| `src/components/DuplicatesList.tsx:346` | `duplicates-focus` | `always` | |

### 2.3 Transitional (uso interno permitido temporalmente, debe nombrarse y aislarse)

Llamadas Leaflet directas en `LocationMap.tsx` que son "fit semántico disfrazado". Quedan permitidas hasta migrar a helpers internos nombrados (`fitToCurrentView`, `fitToHome`, …) que internamente usen el mismo pipeline.

| File:Line | API | Helper propuesto | Migración |
|---|---|---|---|
| `LocationMap.tsx:303` | `setView` | `bootMapToHome` | Fase 2. |
| `LocationMap.tsx:312` | `fitBounds` | `fitInternal('boot')` | Fase 2. |
| `LocationMap.tsx:336` | `fitBounds` | `fitInternal('cluster')` | Fase 2. |
| `LocationMap.tsx:365` | `fitBounds` | listener `map-fit-bounds` legacy — eliminable cuando 2.2 esté migrado. | Fase 4. |
| `LocationMap.tsx:367` | `setView([20,0],3)` | `resetWorldView` | Fase 2. |
| `LocationMap.tsx:403/405` | `fitBounds` / `setView` | `fitInternal('focus')` | Fase 2. |
| `LocationMap.tsx:807` | `fitBounds` | `fitInternal('layer')` | Fase 2. |
| `LocationMap.tsx:1858` | `fitBounds` | `fitInternal('rebuild')` | Fase 2. |
| `LocationMap.tsx:2580` | `setView` | `recenterForPopup` | Fase 2. |
| `src/components/map/useEnrichmentTracker.ts:113` | `setView` | `fitInternal('enrichment-track')` | Fase 2. |
| `src/components/map/map-routes.ts:635/719/768` | `fitBounds` | `fitInternal('route-render')` | Fase 3 (route domain). |
| `src/domains/content/components/UploadPreviewDialog.tsx:353/355` | `setView` / `fitBounds` | mapa local, NO el principal | Excluido del pipeline (mapa secundario). |

### 2.4 Forbidden (debe convertirse a 2.1 o 2.3, nunca quedarse aquí)

Llamadas Leaflet directas que mueven la cámara principal sin ninguna semántica de boot/popup/botón explícito.

| File:Line | API | Acción |
|---|---|---|
| `LocationMap.tsx:501` | `flyTo([lat,lng], zoom||16, { duration: 0.8 })` | Convertir a `requestSubsetFit({coords:[[lat,lng]]}, { mode:'always', reason:'... ' })`. Identificar caller. |
| `LocationMap.tsx:637` | `flyTo([lat,lng], max(zoom,14))` | idem. |
| `LocationMap.tsx:843/845` | `setView`/`flyTo([lat,lng], INITIAL_GEOLOCATION_ZOOM)` | Aceptable como boot (excepción documentada). Mover a helper `bootGeolocation`. |
| `LocationMap.tsx:926/928` | `setView`/`flyTo([lat,lng],12)` | Botón "Go home" → helper `goHome`. |
| `LocationMap.tsx:949` | `setView([lat,lng],11)` | "Locate me" → helper `locateMe`. Cubierto por `mem://logic/map/locate-me-button-contract`. |
| `LocationMap.tsx:1551` | `flyTo([lat,lng],16)` | Identificar caller; probablemente `nearby-marker-clicked`. |
| `LocationMap.tsx:1798` | `panTo(marker.getLatLng())` | Aceptable: popup recenter (no fit). Mover a `centerOpenedPopupInVisibleMap` si no está ya. |
| `LocationMap.tsx:2307` | `flyTo([lat,lng], max(zoom,14))` | Probable consumidor de evento `map-fly-to`; revisar y migrar. |
| `LocationMap.tsx:2440/2465` | `flyTo([lat,lng], target)` / `flyTo(center, finalZoom)` | idem. |
| `LocationMap.tsx:2588` | `centerOpenedPopupInVisibleMap` | Aceptable (popup). |

Eventos relacionados a migrar/desambiguar: `map-fly-to`, `map-go-home`, `map-reset-view`, `map-show-route`, `map-clear-route` (todos en `event-bus-inventory.md` §2).

---

## 3. API freeze proposal

Propuesta de contrato congelado. Documentar y enforced via lint en Fase 1; no implementar todavía.

### 3.1 Payload shape (`FitRequest`)

```ts
type FitInput =
  | { kind: 'ids';    ids: string[] }
  | { kind: 'bounds'; bounds: L.LatLngBoundsExpression }
  | { kind: 'coords'; coords: Array<[number, number]> };

type FitOptions = {
  mode: 'always' | 'if-outside';
  reason: FitReason;             // enum cerrado
  padding?: [number, number];    // default [60, 60]
  maxZoom?: number;              // clamp ≤ 14
  minZoom?: number;              // opcional, default sin floor
};

type FitRequest = FitInput & FitOptions;
```

### 3.2 Modes

| Mode | Semántica | Respeta gesture cooldown? |
|---|---|---|
| `always` | Movimiento siempre. Caller asume que el usuario espera mover cámara. | NO |
| `if-outside` | Solo mueve si el subset NO está visible al ≥40%. | SÍ |

### 3.3 Reasons (enum inicial)

```ts
type FitReason =
  // canonical (ya existen)
  | 'health-repair-preview'
  | 'health-filter'
  | 'selection-on-start'
  | 'my-catalog-popover'
  | 'user-filter'
  | 'source-filter'
  // migración legacy `map-fit-bounds`
  | 'route-focus'
  | 'segment-focus'
  | 'collection-focus'
  | 'document-focus'
  | 'document-content'
  | 'documents-panel'
  | 'orphan-focus'
  | 'duplicates-focus'
  | 'index-route-focus'
  // Fase futura (cuando se migren `map-fly-to` etc.)
  | 'nearby-marker'
  | 'route-preview';
```

PRs nuevos: añadir valor al enum + entry en `mem://logic/map/subset-fit-contract` con justificación.

### 3.4 Coords precedence

Resolver bounds en este orden estricto. Primer match gana:

1. `kind === 'coords'` → `L.latLngBounds(coords)`.
2. `kind === 'bounds'` → usar tal cual.
3. `kind === 'ids'`    → `markerLocations.filter(l => ids.includes(l.id))` → `latLngBounds`.

Si los 3 fallan o el resultado no es válido → noop + `console.warn` con `reason`.

### 3.5 Cooldown semantics

- `manualGestureLock` se arma con `movestart`/`zoomstart`/`dragstart` por **gesto humano** únicamente. Movimiento programático NO arma el lock.
- TTL: 4000ms desde el último gesto.
- Se libera explícitamente cuando se clickea un botón/control nombrado en la whitelist (`user-filter`, `health-repair-preview`, `selection-on-start`).
- `mode:'always'` ignora el lock por definición.
- `mode:'if-outside'` respeta el lock + el threshold del 40%.

### 3.6 Ownership

- Definición y modificación de `FitRequest` / `FitReason` / cooldown vive en `src/components/map/subset-fit.ts`.
- Listener único vive en `LocationMap.tsx`. Ningún otro componente añade listener para `map-fit-bounds`.
- Helpers internos (`fitInternal`, `bootMapToHome`, `goHome`, `locateMe`, `centerOpenedPopupInVisibleMap`) viven en `LocationMap.tsx` o sub-módulo `src/components/map/internal-camera.ts`. Nunca exportados al exterior.

---

## 4. Runtime observability proposal

Telemetría temporal (sin persistir en DB). Activable por flag `VITE_DEBUG_CAMERA=1`.

### 4.1 Logging temporal

```ts
// Dentro del paso (6) fit execution
console.debug('[camera]', {
  reason,
  mode,
  inputKind,
  bypassedGestureLock: bool,
  appliedPadding,
  appliedMaxZoom,
  ts: performance.now(),
});
```

Cada bypass detectado (caller que llama Leaflet directo a `fitBounds`/`flyTo`/`setView` sin pasar por el pipeline) genera:

```ts
console.warn('[camera-bypass]', { stack, file, line });
```

### 4.2 Metrics in-memory (window.__camera__)

```ts
window.__camera__ = {
  callers: Map<reason, count>,
  bypasses: Array<{ stack, ts }>,
  cooldownHits: number,
  cooldownBypasses: number,
  lastFit: { reason, mode, ts },
};
```

Inspeccionable en DevTools sin instrumentación externa.

### 4.3 Caller frequency

Tras 2 semanas con telemetría activa en sesiones de QA:

- Top reasons por frecuencia → confirmar enum.
- Reasons con frecuencia 0 → eliminar del enum.
- Bypasses detectados → backlog item por callsite.

### 4.4 Bypass detection (estática)

Lint rule custom (eslint-plugin local) en Fase 1:

```js
// reglas:
'no-direct-fitbounds': error si `*.fitBounds(` aparece fuera de `subset-fit.ts` y `LocationMap.tsx` (líneas allowlist).
'no-direct-flyto':     error si `*.flyTo(`     aparece fuera de allowlist nombrada en `LocationMap.tsx`.
'no-map-fit-event':    error si `'map-fit-bounds'` aparece en `new CustomEvent` o `addEventListener`.
```

Allowlist mantenida como comentario `// camera-allowlist:reason=boot` en cada línea permitida.

---

## 5. Migration strategy

Cinco fases. Cada fase es PR-aislable y NO bloquea las siguientes hasta su merge.

### Fase 1 · Freeze (1 PR)

**Objetivo:** congelar la deuda. Ningún PR nuevo puede empeorar.

- Añadir lint rules `no-direct-fitbounds`, `no-direct-flyto`, `no-map-fit-event` con allowlist de líneas actuales (snapshot).
- Documentar el contrato (`mem://logic/map/subset-fit-contract` ya existe; añadir sección "API freeze" con §3 de este doc).
- Sin cambios de código de aplicación.

**Riesgo:** muy bajo. Solo herramienta.

### Fase 2 · Isolate (2-3 PRs)

**Objetivo:** dar nombre a las llamadas Leaflet directas legítimas en `LocationMap.tsx`.

- Crear `src/components/map/internal-camera.ts` con helpers nombrados: `bootMapToHome`, `resetWorldView`, `goHome`, `locateMe`, `recenterForPopup`, `fitInternal(reason)`.
- Migrar callsites de §2.3 a esos helpers. Cero cambio de comportamiento.
- Reducir allowlist del lint a solo esos helpers + `subset-fit.ts`.

**Riesgo:** medio-bajo. Refactor mecánico, sin cambio de UX.

### Fase 3 · Redirect (1 PR por emisor de `map-fit-bounds`)

**Objetivo:** migrar los 10 emisores de `map-fit-bounds` a `requestSubsetFit`.

- Una PR por emisor (paralelizable). Cada PR:
  - Añade `reason` al enum.
  - Sustituye `window.dispatchEvent(new CustomEvent('map-fit-bounds', ...))` por `requestSubsetFit(...)`.
  - Mantiene el listener `map-fit-bounds` en `LocationMap` para no romper si quedan rezagados.
- Telemetría reporta cuándo un emisor migrado deja de disparar el evento legacy.

**Riesgo:** bajo por PR. UX idéntica si la traducción es 1-a-1.

### Fase 4 · Deprecate (1 PR)

**Objetivo:** eliminar el listener `map-fit-bounds`.

- Verificar via telemetría que `map-fit-bounds` no se emite hace ≥7 días.
- Eliminar listener en `LocationMap.tsx:355`.
- Lint rule pasa de `warn` a `error` para `'map-fit-bounds'`.
- Forbidden callsites de §2.4 ya tratados en Fase 2/3.

**Riesgo:** bajo si telemetría confirma uso cero.

### Fase 5 · Remove (cleanup, 1 PR)

**Objetivo:** retirar telemetría temporal y allowlists redundantes.

- Reducir telemetría a un breaker (warn-only) que mida solo bypasses.
- Eliminar comentarios `// camera-allowlist:` ya no necesarios.
- Cerrar BL-002, BL-003, BL-012, BL-015 en backlog.

**Riesgo:** trivial.

### Cronograma estimado

| Fase | PRs | Esfuerzo | Bloqueante para |
|---|---|---|---|
| 1 Freeze | 1 | XS | nada |
| 2 Isolate | 2-3 | M | Fase 4 |
| 3 Redirect | 10 (1 por emisor) | M (paralelizable) | Fase 4 |
| 4 Deprecate | 1 | XS | Fase 5 |
| 5 Remove | 1 | XS | nada |

---

## 6. Explicit non-goals

- **NO reescritura masiva de `LocationMap.tsx`.** El componente queda intacto en estructura. Solo se renombran callsites a helpers internos.
- **NO cambio de UX.** Cooldown, padding, maxZoom y comportamiento visual quedan idénticos en Fase 1-3. Cualquier cambio de UX requiere ADR separado.
- **NO eliminación inmediata de legacy.** `map-fit-bounds` listener vive hasta Fase 4, validado por telemetría.
- **NO migración de `panTo` ni `centerOpenedPopupInVisibleMap`.** Quedan fuera del pipeline (popup recenter ≠ fit).
- **NO migración del mapa secundario en `UploadPreviewDialog`.** Es un mapa local independiente.
- **NO unificación de eventos `*-updated` / `locations:*`.** Es Tier 2-B, plan separado.
- **NO refactor de `map-routes.ts` durante Fase 1-2.** Se aborda en Fase 3 (route domain).

---

## 7. Cross-references

- Inventarios: `docs/audits/event-bus-inventory.md`, `docs/audits/constants-thresholds-inventory.md`.
- Priorización: `docs/audits/structural-risk-priority.md` T1-A.
- Memory: `mem://logic/map/subset-fit-contract`, `mem://logic/map/locate-me-button-contract`, `mem://logic/map/popup-persist-on-rebuild`.
- Backlog: BL-002 (cooldown), BL-003 (popover Mis POI, pending-manual-qa), BL-012 (E2E test), BL-015 (unify fit buses), BL-017 (fit tokens).
- Contratos relacionados: `subset-fit-contract`, `popup-contract`, `danger-zones` en `LocationMap.tsx`.

---

## 8. Camera QA — trace buffer (genérico)

Para que el QA manual no dependa de DevTools, todos los logs `[camera-fit-trace]` se reflejan también en un buffer global cuando el debug flag está activo.

- **Helper único:** `traceCameraFit(label, payload?)` en `src/components/debug/camera-fit-trace.ts`. Genérico (NO específico de F1) — cualquier flujo que necesite dejar rastro para QA de cámara llama a este helper.
- **Buffer global:** `window.__cameraFitTrace: CameraFitTraceEvent[]` (`{ timestamp, iso, label, payload? }`). Ring buffer cap = 500, drop-oldest.
- **Gate:** `isCameraFitDebugEnabled()`. Off → no-op. Console y push viajan juntos: prefijo de consola = `[camera-fit-trace]`.
- **API:** `ensureCameraFitTraceBuffer()`, `getCameraFitTrace()`, `resetCameraFitTrace()`.
- **Panel (`CameraFitQaPanel`):**
  - Sección "Trace events: N". Si N = 0 → warning rojo "No trace captured".
  - Botón **Reset** limpia metrics + trace en una sola acción.
  - Copy/Download JSON exportan `{ timestamp, route, viewportSize, flowLabel, metrics, trace }` para cualquier flujo seleccionado, no solo F1.
- **Labels canónicos** (genéricos, sin prefijo de flujo):
  - `MyCatalogQuickFilters.applyAll click` / `applyVisual click` / `applyHealth click`
  - `popover-fit handler RECEIVED event`
  - `popover-fit subset computed`
  - `popover-fit coords resolved`
  - `popover-fit requestSubsetFit`
  - `LocationMap SUBSET_FIT listener received`
- **Non-goal:** sin cambios de comportamiento de cámara. Solo instrumentación.
