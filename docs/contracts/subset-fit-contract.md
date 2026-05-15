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

## Referencias
- ADR-0005
- mem://logic/map/subset-fit-contract
- Código: `src/components/map/subset-fit.ts`, `src/components/LocationMap.tsx` ~2328-2490
