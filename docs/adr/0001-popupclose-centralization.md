# ADR-0001 — Centralización de `popupclose`

## Problema
Cada marker registraba `marker.on('popupclose', handler)` en su factory. El handler capturaba `focusedLocationId` por closure, produciendo:
- Stale closures: tras un re-render, `popupclose` leía el `focusedLocationId` anterior y deselectaba mal.
- Múltiples handlers compitiendo en el mismo evento.
- Imposibilidad de reconciliar markers preservados sin races con `popupclose`.

## Decisión
- Eliminar todo `marker.on('popupclose')`.
- Registrar **un único** `map.on('popupclose')` durante la inicialización del mapa.
- Leer el estado actual con `useLocationsStore.getState()` (no closure) dentro del handler.

## Consecuencias
- Cero stale closures sobre `focusedLocationId` en el cierre de popups.
- `openPopupLocationId` se mantiene local a `LocationMap`.
- `keepIds` (focused ∪ openPopup) protege markers de ser eliminados durante reconciliación.

## Tradeoffs
- Cualquier lógica per-popup debe enrutarse por id en el handler central.
- El comentario en `LocationMap.tsx:1801` debe permanecer como guardarraíl.

## Archivos afectados
- `src/components/LocationMap.tsx` (líneas ~1409, ~1436-1446, ~1660-1714, ~1801)
- (eliminado) handlers per-marker en factories de markers
