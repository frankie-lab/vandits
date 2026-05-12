# PR-4A.1 — Auto-focus mapa al subconjunto

Un único contrato canónico para "haz fit a este subconjunto de POIs", reutilizable desde cualquier consola (preview de reparación, selección, salud, etc.) — pero **cableado solo en los dos triggers aprobados**. El resto queda explícito vía CTA.

## Principio rector

> Filtrar ≠ mover cámara. Seleccionar/Reparar = sí puede mover cámara, con guardarraíles.

## 1) Helper único `requestSubsetFit` (nuevo)

Archivo: `src/components/map/subset-fit.ts`

API:
```ts
requestSubsetFit(locationIds: string[], opts?: {
  mode?: 'always' | 'if-outside';   // default 'if-outside'
  reason: 'repair-preview' | 'selection-start' | 'health-cta' | string;
})
```

Evento: `SUBSET_FIT_BOUNDS_EVENT = 'subset-fit-bounds-request'`.

Comportamiento del listener (en `LocationMap.tsx`, mismo patrón que `COLLECTION_FIT_BOUNDS_EVENT`):

- Resuelve coordenadas vía `markersRef.current.get(id)`. Si un id no está montado (culling), **fallback** a `locationsRef`/`getLocationById` para obtener lat/lng del store.
- 0 puntos → no-op.
- 1 punto → si `always` o fuera de viewport: `flyTo([lat,lng], max(zoom, clamp), 0.6)`. Si dentro: no-op.
- N puntos → `bounds = L.latLngBounds(pts)`. 
  - Modo `if-outside` (default): calcula `insideRatio`. Si `insideRatio < 0.4` (umbral 40%) → `flyToBounds(bounds, { padding:[60,60], maxZoom: CLAMP, duration: 0.6 })`. Si ≥40% dentro → no-op.
  - Modo `always`: siempre `flyToBounds`.
- **Clamp de zoom**: `CLAMP = ZOOM_THRESHOLDS.richMin` (≈ z12) para no saltar a z18 con dos puntos juntos.
- **Cooldown de intención manual**: si el usuario hizo `pan`/`zoom`/`drag` en los últimos **4s**, abortar el fit (silencioso). Se mantiene un `lastUserInteractionAt` en `LocationMap` enganchando una vez a `map.on('movestart zoomstart dragstart', ...)` con guard `e.originalEvent != null` (ignora fits programáticos).
- Animación: `flyTo` / `flyToBounds` (no `fitBounds` duro).

## 2) Triggers cableados ahora

### A. Preview de reparación (`HealthRepairPreviewDialog`)
- En `useEffect` con deps `[open, scope.ids.join('|')]`: si `open && scope.ids.length > 0` → `requestSubsetFit(scope.ids, { mode: 'if-outside', reason: 'repair-preview' })`.
- El diálogo es modal pero no full-screen → el mapa detrás se reencuadra y el contexto queda visible al cerrar.
- Sin clamp adicional ni segundo fit al confirmar.

### B. Selección 0 → N (modo Seleccionar de `FilterBar`)
- Hook nuevo `useSelectionFitOnStart` (en `src/components/discovery/use-selection-fit-on-start.ts`): observa `selectedLocations.length`.
  - Cuando pasa de `0` → `>0`: programa `setTimeout` 250ms (debounce). Si al disparar sigue habiendo selección, llama `requestSubsetFit(selectedIds, { mode: 'if-outside', reason: 'selection-start' })`.
  - Cancela el timeout si baja a 0 o si cambia drásticamente antes de disparar.
  - **No re-fit** en cambios incrementales (1→2, 2→3, etc.). El primer fit cubre la intención inicial; el resto respeta orientación.
- Montado en `FilterBar.tsx` solo cuando `mode === 'select'` para evitar trabajo en otros modos.

## 3) Triggers explícitamente NO cableados

- Filtros normales (Geo / Tipo / Tags / búsqueda): no mueven cámara.
- `healthFilter` activo (modo Mantener): no mueve cámara automáticamente. Se difiere a un PR posterior la introducción de un CTA secundario "Ver subconjunto en mapa" en `HealthFilterActionCTA` (no entra ahora).

## 4) Cambios de archivos

**Nuevos**
- `src/components/map/subset-fit.ts` — helper + tipo de evento.
- `src/components/discovery/use-selection-fit-on-start.ts` — hook de debounce 0→N.

**Editados**
- `src/components/LocationMap.tsx`
  - Listener de `SUBSET_FIT_BOUNDS_EVENT` (nuevo `useEffect`, simétrico al de colecciones).
  - `lastUserInteractionAt` ref + handlers `movestart/zoomstart/dragstart` con guard de `originalEvent`.
- `src/components/discovery/HealthRepairPreviewDialog.tsx`
  - `useEffect` que dispara `requestSubsetFit` al abrir con `scope.ids`.
- `src/components/FilterBar.tsx`
  - Llamada a `useSelectionFitOnStart(selectedLocations)` dentro del bloque de `mode === 'select'` (o siempre con guard interno).

**Memoria**
- Nueva `mem://logic/map/subset-fit-contract` con el contrato (helper, evento, umbrales, cooldown, clamp).
- Update `mem://index.md` Core: línea breve recordando que cualquier consola que quiera "ver su subconjunto" debe usar `requestSubsetFit`, y que filtros NO mueven cámara.

## 5) QA manual

1. Abrir mapa en Galicia. Activar `healthFilter='partial'` → click "Rellenar huecos" → diálogo se abre y mapa hace fly suave a los 14 puntos europeos. Cerrar → el viewport queda en esa vista (correcto).
2. Repetir con todos los puntos ya visibles en pantalla → el mapa NO se mueve (insideRatio ≥ 40%).
3. Modo Seleccionar: seleccionar 5 puntos dispersos vía "Seleccionar N filtrados" → tras 250ms el mapa se reencuadra una vez. Añadir/quitar puntos uno a uno → el mapa NO se mueve.
4. Mover el mapa manualmente, e inmediatamente abrir el preview de reparación → el fit se aborta por cooldown (4s). Esperar 5s y reintentar → fit se ejecuta.
5. Aplicar filtro Geo "Portugal" → mapa NO se mueve.
6. Toggle de colección → sigue funcionando con `requestCollectionFit` (sin regresión).
7. Selección con 1 punto seleccionado fuera del viewport → flyTo a ese punto con clamp z12.
8. Ver consola: no warnings, no doble fit en el mismo gesto.

## 6) Fuera de alcance (futuro)

- CTA "Ver subconjunto" en filtro de salud (modo Mantener).
- Fit a subconjunto desde gallery / lista del Catálogo.
- PR-4B (CatalogSummary, ContextBar).

## Notas técnicas

- Reutilizamos el patrón `dispatchEvent` ya validado por `requestCollectionFit` para mantener `LocationMap` como única autoridad sobre la cámara.
- El cooldown de intención manual debe vivir en `LocationMap` (cerca de `mapRef`), no en el helper, porque el helper no sabe de mapa.
- El guard `e.originalEvent != null` en `movestart`/`zoomstart` es imprescindible: sin él, el propio `flyTo` programático resetea el cooldown y bloquea fits posteriores legítimos.
- El listener no necesita deps en `[]` aparte de leer markers/locations actuales vía refs (igual que `COLLECTION_FIT_BOUNDS_EVENT`).
