

# Plan: Corregir drag-and-drop y persistencia en el panel de itinerarios

## Diagnostico raiz

El drag-and-drop no funciona por dos razones fundamentales:

1. **`buildUnifiedTimeline` ignora el orden guardado**: La funcion encadena segmentos por proximidad geografica (algoritmo greedy), no por la posicion (`position`) almacenada en DB. Aunque `reorderParentWaypoints` guarda posiciones correctamente, al recargarse los datos el timeline se reconstruye geograficamente, revirtiendo el orden visual.

2. **`loadRoutes()` recarga todo y cierra el panel**: Tanto `reorderParentWaypoints` como `reorderSegments` llaman a `loadRoutes()` al final, causando un refetch completo. Durante la recarga, el DndContext se desmonta y el estado visual se pierde.

## Cambios propuestos

### 1. Respetar el orden guardado en `buildUnifiedTimeline` (RoutesListPanel.tsx)

Modificar la funcion para que:
- Los child routes se ordenen por su campo `position` (ya existe en DB) en lugar del algoritmo greedy de proximidad geografica
- Los parent waypoints se ordenen por su campo `position` en lugar de interpolarse geograficamente
- Solo usar el fallback geografico cuando no hay posiciones definidas (todos = 0)
- Esto hace que el DnD sea realmente persistente

### 2. Actualizar orden local sin refetch (RoutesListPanel.tsx + use-routes.ts)

En `handleDragEnd`:
- Aplicar el reorden **localmente** primero (optimistic update) para que el timeline refleje el cambio inmediatamente sin colapsar
- Persistir en DB en background sin llamar a `loadRoutes()`
- En `reorderParentWaypoints` y `reorderSegments` de `use-routes.ts`: eliminar la llamada a `loadRoutes()` y en su lugar actualizar el estado local directamente (o no recargar en absoluto, dejando que el optimistic update sea suficiente)

### 3. Preservar `expanded` durante DnD (RoutesListPanel.tsx)

- Mover `expanded` a un `useRef` para que no cause re-render al actualizarse, y usar un `forceUpdate` solo cuando cambia intencionalmente (click en "Ocultar/Ver itinerario")
- Alternativamente, elevar el estado `expanded` al componente padre `RoutesListPanel` con un `Map<routeId, boolean>` para que sobreviva los re-renders de `ParentRouteGroup`

### 4. Corregir `reorderSegments` para guardar posicion (use-routes.ts)

Verificar que `reorderSegments` actualiza el campo `position` de cada child route en la tabla `routes`, no solo reordena in-memory. Actualmente probablemente ya lo hace, pero confirmar que el campo `position` se usa al cargar los children.

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `src/components/RoutesListPanel.tsx` | Reescribir `buildUnifiedTimeline` para respetar posiciones; optimistic update en `handleDragEnd`; preservar `expanded` |
| `src/domains/routes/hooks/use-routes.ts` | Eliminar `loadRoutes()` de `reorderParentWaypoints` y `reorderSegments`; optimistic local state update |

## Resultado esperado

- Arrastrar y soltar reordena items y el cambio persiste al recargar
- El panel no se cierra ni parpadea durante el DnD
- El orden del timeline refleja las posiciones guardadas en DB

