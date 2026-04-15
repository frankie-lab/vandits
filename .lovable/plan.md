

# Plan: Ordenacion drag-and-drop y gestion de puntos especiales en itinerarios

## Contexto actual

El panel de itinerarios (`RoutesListPanel.tsx`) ya tiene DnD implementado para **reordenar tramos (segments)** usando `@dnd-kit`. Tambien existe `reorderSegments` y `reorderParentWaypoints` en `use-routes.ts` para persistir el orden en DB. Sin embargo, los **puntos (TimelineNode)** no son arrastrables, no hay mecanismo para asignar Origen/Meta/Fin manualmente, y no hay sincronizacion bidireccional punto-sidebar <-> mapa.

## Cambios propuestos

### 1. Hacer arrastrables TODOS los items del timeline (puntos + tramos)

**Archivo**: `src/components/RoutesListPanel.tsx`

- Actualmente solo los `TimelineSegment` estan envueltos en `SortableTimelineItem`. Extender el DnD para que los `TimelineNode` (puntos) tambien sean arrastrables.
- Cada item del timeline necesita un ID estable para DnD: los segmentos ya usan `route.id`, los puntos usaran `waypoint.id` o un ID sintetico basado en coordenadas.
- Al soltar un item, recalcular el orden completo del timeline y persistir:
  - Puntos: llamar a `reorderParentWaypoints` (ya existe)
  - Tramos: llamar a `reorderSegments` (ya existe)
- Las rutas GPS importadas (`sourceDocumentId`) siguen siendo inmutables: sus tramos no se pueden mover, solo los puntos de catalogo y waypoints libres.

### 2. Asignacion manual de Origen, Meta y Fin

**Archivo**: `src/components/RoutesListPanel.tsx`

- Cada punto en el timeline tendra un menu contextual (click derecho o boton) con opciones:
  - **Marcar como Origen**: Asigna el punto como inicio del itinerario (puede ser "Casa" del perfil del usuario aunque las rutas no lleguen a ella)
  - **Marcar como Meta**: Un punto de catalogo o waypoint que representa el destino principal
  - **Marcar como Fin**: Punto final del itinerario (puede ser "Casa")
- Estas asignaciones se persisten en `route_preferences` (JSONB) del route padre como `{ originWaypointId, metaWaypointId, endWaypointId }`.
- Los badges "Origen", "Destino" actuales se actualizaran para reflejar estas asignaciones manuales en vez de inferirlas automaticamente.

**Archivo**: `src/domains/routes/hooks/use-routes.ts`

- Añadir funcion `updateRoutePreferences(routeId, prefs)` para guardar las asignaciones de origen/meta/fin.

### 3. Sincronizacion bidireccional sidebar <-> mapa

**Archivos**: `src/components/RoutesListPanel.tsx`, `src/components/LocationMap.tsx`, `src/components/map/map-routes.ts`

- **Sidebar -> Mapa**: Al hacer click en un punto del timeline, emitir evento `itinerary-point-selected` con `{ lat, lng, waypointId }`. El mapa hara:
  - `flyTo` al punto con zoom apropiado
  - Pulsar/resaltar el marcador correspondiente (bounce o anillo pulsante temporal)
- **Mapa -> Sidebar**: Al hacer click en un marcador que pertenece al itinerario abierto, emitir evento que el `RoutesListPanel` escucha para:
  - Hacer scroll hasta ese punto en la lista
  - Resaltarlo visualmente (fondo highlight temporal)
- El mecanismo ya existe parcialmente para tramos (evento `map-route-selected` -> auto-expand + scroll), se extiende a puntos individuales.

### 4. El panel NO se cierra durante la edicion

**Archivo**: `src/pages/Index.tsx`

- Actualmente, la condicion `isOpen={routeOrch.showRoutesPanel && !routeOrch.showRouteBuilder}` cierra el panel al abrir el builder. Cambiar para que el panel de itinerarios permanezca abierto mientras se editan asignaciones (Origen/Meta/Fin) — solo se cierra al abrir el RouteBuilder completo para edicion de waypoints.
- Distinguir entre "edicion ligera" (reordenar, asignar roles) que mantiene el panel abierto, y "edicion completa" (RouteBuilder) que lo reemplaza.

### 5. Evento de resaltado de punto en el mapa

**Archivo**: `src/components/map/map-routes.ts`

- Añadir funcion `highlightItineraryPoint(map, lat, lng)` que muestra un anillo pulsante temporal (2s) alrededor del marcador mas cercano a esas coordenadas.

**Archivo**: `src/components/LocationMap.tsx`

- Listener para `itinerary-point-selected` que invoca el highlight y `flyTo`.

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `src/components/RoutesListPanel.tsx` | DnD para puntos, menu contextual Origen/Meta/Fin, click handler bidireccional, listener mapa->sidebar |
| `src/components/LocationMap.tsx` | Listener `itinerary-point-selected`, highlight pulsante |
| `src/components/map/map-routes.ts` | Funcion `highlightItineraryPoint` |
| `src/domains/routes/hooks/use-routes.ts` | Funcion `updateRoutePreferences` |
| `src/pages/Index.tsx` | Ajustar condicion de cierre del panel |

## Resultado esperado

- Todos los items (puntos y tramos) se pueden reordenar con drag-and-drop
- Opciones manuales para asignar Origen, Meta y Fin (incluyendo "Casa")
- Las rutas GPS importadas permanecen inmutables
- Click en sidebar resalta en mapa; click en mapa resalta y hace scroll en sidebar
- El panel de ordenacion no se cierra mientras se edita

