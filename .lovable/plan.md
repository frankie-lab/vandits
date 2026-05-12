# PR-POPUP-PERSIST

Persistencia visual temporal del marker cuyo popup está abierto, aunque su POI salga del subset filtrado tras una acción de recovery (Enriquecer, Reintentar, etc.).

## Regla canónica

- `filteredLocations` = verdad lógica (no se toca).
- `openPopupMarker` = excepción visual estrictamente temporal.
- El marker sobrevive al rebuild hasta `popupclose`. Si al cerrar ya no pertenece al subset, se elimina.

## Cambios

### 1. `src/components/map/map-layer-groups.ts`
Nuevo helper `clearAllGroupsExcept(preserved: L.Layer)` que evita `clearLayers()` sobre el grupo que contiene el marker preservado (Leaflet cierra popups al limpiar el grupo padre).

### 2. `src/components/LocationMap.tsx`
En el `useEffect` de rebuild de markers (dep: `[locationIds, ...]`):
- Leer `openPopupLocationId` antes de limpiar.
- Localizar `preservedMarker` en `markersRef`.
- Cleanup: usar `clearAllGroupsExcept(preservedMarker)`; saltar el id en el bucle de remoción individual.
- Loop de creación: saltar el id si ya existe el preservado; refrescar su icon con `setIcon(createCustomIcon(...))` para reflejar nuevo estado (color de aro, etc.) sin tocar el popup.
- `locationsRef`: incluir el POI preservado aunque esté fuera de `filteredLocations`, para que el popup tenga datos válidos hasta cerrarse.
- Nuevo `allowedMarkerIdsRef` que refleja el subset lógico actual.
- Handler `popupclose` a nivel mapa: si el id cerrado NO está en `allowedMarkerIdsRef`, eliminar su marker definitivamente.

### 3. Sin cambios en
- `viewport-culling.ts` (`keepIds` ya incluye `openPopupLocationId`).
- `popup-recovery-mount.ts`.
- Lógica de filtros, `useHealthFilterFit`, `requestSubsetFit`, `ZOOM_THRESHOLDS`, polaroid canon.

## Validación

- Activar healthFilter (rellenar huecos / reparar cadena / revisar / hardError).
- Abrir popup en un POI del subset.
- Disparar acción que mute el store y saque al POI del subset.
- Esperado: popup sigue abierto, icon actualizado, marker persiste hasta cerrar; al cerrar, marker se elimina si ya no pertenece al subset.

## Memoria

Registrar en `mem://logic/map/popup-persist-on-rebuild` y referenciar en `mem://index.md`.
