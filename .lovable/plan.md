## PR-POI-SOURCE-FIX-1A — Reactivar gates en zoom + minZoom en user-filter

Dos fixes acotados, ambos en helpers únicos. BUG-1 (polaroid) queda diferido a auditoría aparte (PR-MAP-ZOOM-POLAROID-AUDIT).

---

### Fix 1 · `applyLayerVisibility` se re-ejecuta en `zoomend`

**Causa raíz**: `applyLayerVisibility(layers, zoom, gates)` se invoca cuando cambia `layers` o al `init`, pero NO cuando el usuario hace zoom. Resultado: cruzar z=7 (followed), z=6 (app) o z=8 (source) no recalcula visibilidad, y los grupos siguen como estaban en el último cambio de capas (típicamente ocultos al abrir el mapa en z≈3).

**Cambio único**: en `src/components/LocationMap.tsx`, dentro del `useEffect` que ya monta el mapa Leaflet (donde se llama `initLayerGroups(map)`), añadir:

```ts
const handleZoomEnd = () => {
  applyLayerVisibility(layersRef.current, map.getZoom(), zoomGatesRef.current);
};
map.on('zoomend', handleZoomEnd);
// cleanup:
map.off('zoomend', handleZoomEnd);
```

`layersRef` y `zoomGatesRef` ya existen (o se crean trivialmente con `useRef` espejo del estado actual de capas/gates). Sin cambios en el helper `applyLayerVisibility`.

---

### Fix 2 · "Ver solo sus puntos" pasa `minZoom: 7`

**Causa raíz**: `src/components/UsersSidebar.tsx:386` llama:
```ts
requestSubsetFit(ids, { mode: 'always', reason: 'user-filter', coords });
```
sin `minZoom`. La memoria `subset-fit-contract` ya documenta `minZoom 7` para `user-filter`, pero el código no lo pasa. Para usuarios con POIs dispersos el fit calcula z<7 → quedan bajo el gate `followed` → 0 markers tras filtrar.

**Cambio único**: una línea en `UsersSidebar.tsx:386`:
```ts
requestSubsetFit(ids, { mode: 'always', reason: 'user-filter', coords, minZoom: 7 });
```
El listener de `subset-fit.ts` ya soporta `minZoom`.

---

### Fuera de alcance

- BUG-1 polaroid: diferido a `PR-MAP-ZOOM-POLAROID-AUDIT` (confirmar canon `richMin` vs `heroMin` y decidir si polaroid entra en z≥12 o z≥15).
- No se tocan `DEFAULT_ZOOM_GATES` ni el matcher `filterBySource`.
- No se tocan `applyViewportCulling`, `subset-fit listener`, ni `UnenrichedRecoveryBlock`.

---

### Verificación

Manual en `/`:
1. Home a z≈3 → solo propios visibles, followed/app/source ocultos.
2. Zoom-in cruzando z=7 → triángulos invertidos de followed aparecen.
3. Zoom-out por debajo de z=7 → followed desaparecen.
4. Click "Ver solo sus puntos" sobre Sandbox → cámara hace fit y se queda en z≥7 → triángulos del usuario visibles.
5. Propios siempre visibles, sin cambios respecto al estado actual.

Automatizado:
- `bunx vitest run src/test/poi-layer.test.ts` (sigue verde, sin tocar el helper).

---

### Memoria a actualizar

- `mem://logic/poi/source-pipeline-canonical`: añadir nota "el caller (LocationMap) DEBE re-invocar `applyLayerVisibility` en `zoomend`; los gates no reaccionan solos".
- `mem://logic/map/subset-fit-contract`: confirmar/reforzar "el caller debe pasar `minZoom` cuando un gate posterior podría ocultar el subset (ej: `user-filter` → `minZoom: 7`)".
