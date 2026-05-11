# Arquitectura visual del mapa por zoom — plan por olas

## Dolor confirmado

1. **Lentitud al hacer zoom** con ~5k puntos hoy (rebuild completo del cluster en cada cambio).
2. **Saturación visual** en vista global (z0–z9): todos los puntos compiten visualmente, incluso los del usuario.
3. **Imposible distinguir "los míos"** del resto cuando todo se mezcla en el mismo cluster.
4. **Escala futura**: decenas de miles → millones de puntos. La galería personal puede ser pequeña (200) o enorme (50k), y la densidad por área varía drásticamente.

## Principio rector

> El mapa es **una galería de puntos**, no un mapa de carreteras. La representación cambia por **modo de zoom**, no solo por tamaño. Los puntos del usuario tienen siempre prioridad visual sobre el resto.

Se mantienen como **invariantes congeladas** (no se tocan):
- 3 estados de marker (verde / gris / naranja) vía `getPointVisualState`
- 3 anillos de salud (rojo / amarillo / naranja) vía `getPointHealthRings`
- `collection-tint-ring` por colección
- Regla "verde nunca marca error"

Lo que cambia es **cuándo se dibujan** y **con qué fidelidad**, según zoom y capa.

---

## Ola 1 — `renderMode` por zoom (semanas, bajo riesgo)

**Objetivo**: bajar coste de render por marker en zoom lejano sin tocar la simbología.

Añadir parámetro `renderMode` al helper único `createCustomIcon` (mantiene la "single source of truth"):

| Zoom | renderMode | Representación |
|---|---|---|
| z0–z9 | `micro` | Círculo plano 4–6px con color del estado. Sin tint, sin health rings, sin gradiente, sin SVG complejo. `divIcon` mínima o `circleMarker` canvas. |
| z10–z13 | `compact` | SVG actual SIN gradiente ni health rings. Tint sí. ~18px. |
| z14–z16 | `standard` | Comportamiento actual completo (gradiente + tint + health rings). |
| z17+ | `rich` | Igual que standard + thumbnail si existe `user_image_url`. |

El `zoomend` listener (ya existe en línea 1179) decide `renderMode` y dispara repintado del cluster.

**Por qué primero**: 80% del beneficio percibido, 20% del esfuerzo. No rompe nada porque solo simplifica visualmente en zooms donde el detalle no es legible de todos modos.

---

## Ola 2 — Capa "míos" priorizada (separada del cluster general)

**Objetivo**: que el usuario distinga siempre sus puntos del catálogo común y de seguidos.

Dividir en **3 panes Leaflet con z-index escalonado**:

```text
pane "others"     z-index: 400   → catálogo común + seguidos
pane "mine"       z-index: 500   → user_places del usuario
pane "selection"  z-index: 600   → focused / selected / hover
```

- Cada pane tiene **su propio MarkerClusterGroup**.
- En `micro` mode (z0–z9):
  - `mine` se dibuja **siempre encima** y nunca se agrupa en clusters mixtos.
  - `others` puede usar densidad agresiva (clusterRadius 80) o incluso una **heatmap layer** opcional.
- En `standard`/`rich`: vuelven a convivir pero `mine` mantiene halo sutil.

Reutiliza el bucket ya existente (`getBucketStats`: `myCatalog`, `myWorkspace`, `followedCatalog`, `followedWorkspace`).

---

## Ola 3 — Render canvas para `micro` (preparación a millones)

Sólo cuando `renderMode === 'micro'` y `visibleCount > 20.000`:

- Sustituir divIcon por **una sola capa canvas** (`L.canvas` + `L.circleMarker`) para `others`.
- `mine` sigue como divIcon (preserva interactividad fina).
- Coste por punto cae de ~2KB DOM a ~40 bytes canvas. Permite 200k+ puntos visibles sin freeze.

Trigger: contador de markers visibles tras filtros. Si baja de 20k al hacer zoom, se reactiva divIcon.

---

## Ola 4 — Diff incremental del cluster

Hoy: cualquier cambio de filtro reconstruye el cluster entero (`clearLayers` + `addLayers`).
Nuevo: mantener un `Map<locationId, marker>` y aplicar **diff**:
- Añadidos → `addLayers(nuevos)`
- Eliminados → `removeLayers(viejos)`
- Modificados → `marker.setIcon(...)` in-place (ya se hace en líneas 1471, 1601, 1613)

Beneficio: toggles de colección y filtros pasan de O(n) a O(diff).

---

## Ola 5 — Viewport-aware loading (escala real a millones)

Cuando el dataset total supere ~50k:
- No cargar todo el dataset en cliente.
- `useDatabaseSync` consulta por **bbox + zoom**: `SELECT … WHERE geohash IN (tiles_visibles)`.
- Cache LRU por tile en cliente.
- Mantener `mine` siempre completo (galería personal cabe en memoria).

Esta ola requiere índice geohash/PostGIS y es la única que toca backend. Se difiere hasta que el dataset real lo justifique.

---

## Qué de tu propuesta **ya existe** (no se reimplementa)

- markercluster con `maxClusterRadius:50` y `disableClusteringAtZoom:16` → línea 1211
- Listeners `zoomend` → línea 1179, 1744
- 3 estados de marker congelados → `getPointVisualState`
- Helper único `createCustomIcon` (173 líneas) → se **extiende**, no se sustituye por 5 factorías separadas (rompería la regla "single source of truth")

## Qué de tu propuesta **se renombra**

- "Micro-puntos globales" / "puntos 2–3 px" → `renderMode: 'micro'`
- "Marcador rico con imagen" → `renderMode: 'rich'`
- "Capa ultraligera para zoom lejano" → Ola 3 (canvas en `micro`)
- "Capa prioritaria userCatalogLayer" → Ola 2 (pane `mine`)

---

## Detalles técnicos

**Archivos afectados (olas 1–2, sin tocar backend):**
- `src/components/map/map-icons.ts` (+param `renderMode`)
- `src/components/LocationMap.tsx` (zoomend dispatcher + dos cluster groups)
- `src/index.css` (panes z-index, estilo `.micro-dot`)

**No se toca:**
- `getPointVisualState`, `getPointHealthRings`, lógica de tint
- `collection-tint-ring`, health rings (siguen apilados fuera)
- Buckets (`getBucketStats`), filtros, store

**Memorias relevantes:** `marker-classification-v3`, `health-rings-rule`, `map/visibility-rule-approval-gated`.

---

## Orden recomendado

1. **Ola 1** (renderMode) — soluciona lentitud de zoom y saturación global ya.
2. **Ola 2** (pane "míos") — soluciona "no distingo los míos".
3. **Ola 4** (diff incremental) — soluciona lentitud de filtros/toggles.
4. **Ola 3** (canvas) — cuando empieces a ver >20k visibles.
5. **Ola 5** (viewport loading) — cuando el dataset total supere ~50k.

Olas 1 + 2 + 4 cubren el 95% del dolor actual sin tocar backend ni romper invariantes.
