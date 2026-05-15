# Contract — Subset Fit

## Propósito
Encuadrar la cámara sobre un subconjunto explícito de POIs sin acoplar el caller a Leaflet.

## Variables canónicas
| Variable | Tipo | Notas |
|---|---|---|
| `SUBSET_FIT_BOUNDS_EVENT` | `'subset-fit-bounds-request'` | nombre del evento DOM |
| `SubsetFitMode` | `'always' \| 'if-outside'` | semántica abajo |
| `SubsetFitDetail.locationIds` | `string[]` | obligatorio |
| `SubsetFitDetail.coords` | `Array<[lat,lng]>?` | opcional, **prioritario** sobre markersRef |
| `SubsetFitDetail.minZoom` | `number \| null` | piso de zoom opcional |
| `SubsetFitDetail.reason` | `string` | telemetría/debug |

## Ownership
- Helper único: `requestSubsetFit(ids, opts)` en `src/components/map/subset-fit.ts`.
- Listener único: `useEffect` en `LocationMap.tsx` (~línea 2332).
- Cualquier consola que quiera mover cámara DEBE pasar por aquí.

## Source of truth
El listener en `LocationMap`. El caller solo declara intención.

## Eventos canónicos
Triggers cableados hoy:
| Caller | mode | reason | minZoom |
|---|---|---|---|
| `HealthRepairPreviewDialog` | `if-outside` | `repair-preview` | 7 |
| `use-selection-fit-on-start` | `if-outside` | `selection-start` | (default) |
| `use-health-filter-fit` | `if-outside` | `health-filter` | 7 |
| `UsersSidebar` (filtro usuario) | `always` | `user-filter` | sin |
| `use-my-catalog-popover-fit` | `always` | `my-catalog-popover:*` | sin |
| `SourceFilterBridge` | `if-outside` | `source-filter` | (default) |

## Semántica de mode
- **`always`** = acción explícita del usuario. **No respeta** el cooldown manual de 4s. Siempre encuadra.
- **`if-outside`** = encuadre oportunista. Solo encuadra si <40% del subset está en viewport actual. Respeta cooldown manual de 4s tras gesto real.

## Resolución de coords (orden estricto)
1. Si `detail.coords` existe y tiene válidas → usar esas.
2. Si no, para cada id: `markersRef.get(id).getLatLng()`.
3. Si no hay marker, `locationsRef.get(id).coordinates`.
4. Si quedan ids sin coords y `pts.length===0` y no hay `preCoords` → reintentar 1 vez en el siguiente frame (rAF).

## Cálculo del zoom
- `naturalZoom = map.getBoundsZoom(bounds, false, padding)`.
- `clamped = min(naturalZoom, FIT_CLAMP_ZOOM)` con `FIT_CLAMP_ZOOM = ZOOM_THRESHOLDS.richMin (~z12)`.
- Si `minZoom` definido: `final = max(clamped, minZoom)`.
- Animación: `flyTo(center, finalZoom, { duration: 0.6 })`.

## Forbidden writes
- Llamadas directas a `mapRef.flyToBounds` / `fitBounds` desde consolas (FilterBar, diálogos, popovers). Deben usar `requestSubsetFit`.
- Pasar `mode: 'always'` desde filtros pasivos (Geo/Tipo/búsqueda).
- Bloquear `mode: 'always'` con cooldown.

## Invariantes
1. El listener es **único**.
2. `mode: 'always'` ignora cooldown manual.
3. Bounds completos del subset (sin recortar a "región dominante").
4. Subset vacío → no-op silencioso (el caller decide qué hacer).
5. Las coords pre-resueltas evitan el viewport culling (z≥7 solo monta markers en viewport).

## Ejemplos válidos
- Click "Enriquecidos" en popover Mis POI: emite `mode='always', coords=[[lat,lng]…]` con TODO el subset → fit completo aunque la cámara esté en otra región.
- Activar chip "Reparar cadena": `mode='if-outside', minZoom: 7` → encuadra solo si la cámara no contenía ya >40% del subset.

## Anti-patrones detectados
- (Resuelto) `mode: 'always'` era ignorado por cooldown global. Corregido aislando el guard a `if-outside`.
- (Vigilar) Calleres que pasan ids pero no `coords` cuando saben que sus markers no están montados (riesgo de fit parcial bajo culling).

## Validation Notes (revisión manual contra código real)

| Inv. | Estado | Archivo | Símbolo | Evidencia | Backlog |
|---|---|---|---|---|---|
| 1 (listener único) | **validated** | `src/components/LocationMap.tsx` | `addEventListener(SUBSET_FIT_BOUNDS_EVENT, handler)` L.2486 | Único registro; cleanup `removeEventListener` L.2491 | BL-002 |
| 2 (`mode:'always'` ignora cooldown) | **validated** | `src/components/LocationMap.tsx` | guard L.2357 | `if (mode !== 'always' && Date.now() - lastUserInteractionAt < COOLDOWN_MS) return;` — la negación blinda el caso `always` | BL-003 |
| `detail.coords` prioritario sobre markers | **validated** | `src/components/map/subset-fit.ts` + `LocationMap.tsx` | resolución L.2328-2407 | Helper `requestSubsetFit` (subset-fit.ts:59) acepta `coords?`; listener resuelve en orden coords→markersRef→locationsRef | — |
| 3 (bounds completos del subset) | **validated** | `src/components/LocationMap.tsx` | construcción `bounds` L.~2380-2400 | Itera todos los puntos resueltos sin recortar a región dominante | — |
| 4 (subset vacío = no-op) | **validated** | `src/components/LocationMap.tsx` | early return cuando `pts.length===0` y no hay reintento posible | El reintento rAF aplica solo si hay ids sin coords; vacío real → no flyTo | — |
| 5 (coords pre-resueltas evitan culling) | **validated** | `src/components/toolbar/use-my-catalog-popover-fit.ts` + listener | Caller pasa `coords` calculadas desde el subset filtrado completo, no desde `markersRef` | Documentado y verificado en pasadas anteriores | BL-004 |
| Único helper emisor `requestSubsetFit` | **validated** | `src/components/map/subset-fit.ts` | export L.59 | rg de `dispatchEvent.*SUBSET_FIT_BOUNDS_EVENT` solo aparece dentro de `subset-fit.ts` y en re-emisión interna del listener (L.2407, autorizada) | — |
| Cooldown se arma con gestos reales | **validated** | `src/components/LocationMap.tsx` | `lastUserInteractionAt = Date.now()` L.2343 dentro de handlers `movestart/zoomstart/dragstart` | Cleanup correcto en el mismo `useEffect` | — |

## Referencias
- ADR-0005
- mem://logic/map/subset-fit-contract
- Código: `src/components/map/subset-fit.ts`, `src/components/LocationMap.tsx` L.2335-2491

## Phase 1 — Freeze + Observability (PR-CAMERA-PHASE-1)

| Item | Estado | Archivo | Evidencia |
|---|---|---|---|
| `FitReason` enum congelado | **validated** | `src/components/map/subset-fit.ts` | `FIT_REASONS` const + `FitReason` type. Reasons fuera del enum → `console.warn` (no bloqueante en Phase 1). |
| Flag debug | **validated** | `src/components/map/subset-fit.ts` | `isCameraFitDebugEnabled()` lee `localStorage.vandits_debug_camera_fit`. Default ON en dev. |
| Métricas runtime | **validated** | `src/components/map/subset-fit.ts` | `window.__cameraFitMetrics` (interface `CameraFitMetrics`). Reset oficial in-place vía `window.__cameraFitMetrics.reset()` (método no-enumerable, ignorado por `JSON.stringify`). También exportado como `resetCameraFitMetrics()`. NO usar `Object.assign` manual salvo fallback de emergencia. |
| Observer de bypasses | **validated** | `src/components/map/subset-fit.ts` | `installCameraFitObserver()` monkey-patcha `L.Map.prototype.{fitBounds,flyTo,setView}`. Idempotente. Auto-init en browser. |
| Hook listener (cooldown/source) | **validated** | `src/components/LocationMap.tsx` | `recordFitOutcome({ cooldownSkipped|cooldownBypassedByAlways, resolvedFrom })` invocado en cada rama del handler. |
| Behavior preservation | **validated** | listener handler L.2350-2502 | Sin cambios de comportamiento; solo telemetría. Cooldown, clamp, padding, maxZoom intactos. |

Plan completo: `docs/architecture/camera-subset-fit-stabilization-plan.md`.

## Phase 1 — Camera QA trace buffer

| Item | Estado | Archivo | Evidencia |
|---|---|---|---|
| `window.__cameraFitTrace` espejo de `[camera-fit-trace]` | **validated** | `src/components/debug/camera-fit-trace.ts` | `traceCameraFit(label, payload?)` push + `console.debug('[camera-fit-trace]', ...)`. Gate `isCameraFitDebugEnabled()`. Ring buffer cap 500. |
| Reset unificado (metrics + trace) | **validated** | `src/components/debug/CameraFitQaPanel.tsx` | `handleReset()` invoca `window.__cameraFitMetrics.reset()` y `resetCameraFitTrace()`. |
| Export JSON incluye trace | **validated** | `src/components/debug/CameraFitQaPanel.tsx` | `buildExportPayload(metrics, trace, flowLabel)` añade `trace` al payload Copy/Download para cualquier `flowLabel`. |
| Sección "Trace events: N" + warning si 0 | **validated** | `src/components/debug/CameraFitQaPanel.tsx` | Banner rojo "No trace captured" cuando `traceCount === 0`. |
