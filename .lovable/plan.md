

# Plan: Corregir 4 problemas del panel de itinerarios

## Problemas identificados

1. **Al seleccionar una ruta, las demas desaparecen** — `onFocusRoute` llama `setVisibleRouteIds(ids)` que limita la renderizacion solo a las rutas seleccionadas. Las demas dejan de mostrarse en el mapa.

2. **El drag-and-drop cierra la ventana del itinerario** — Al arrastrar y soltar, el `DndContext` provoca un re-render que resetea el estado `expanded` del `ParentRouteGroup`, cerrando el timeline desplegado.

3. **Faltan las opciones de Inicio/Meta/Fin** — El menu contextual (tres puntos) esta implementado en el codigo pero posiblemente no se esta renderizando porque la condicion `!isImported` bloquea todo el menu. Verificar que funcione para puntos de catalogo.

4. **El drag-and-drop no es persistente** — El `handleDragEnd` llama a `reorderSegments` pero NO llama a `reorderParentWaypoints` para persistir el orden de los puntos.

## Cambios propuestos

### 1. Atenuar rutas no seleccionadas en vez de ocultarlas (`use-route-orchestration.ts`)

En el efecto que despacha `map-show-route` (linea 82-168), cuando `hasPanelSelection` es true, cambiar la logica para mostrar TODAS las rutas con geometria, pero marcando cuales son las seleccionadas. Anadir un campo `selected: true/false` al payload de cada segmento.

En `map-routes.ts`, al renderizar segmentos del evento `map-show-route`, aplicar opacity 0.18 a los no seleccionados y opacity 1 a los seleccionados.

### 2. Evitar que DnD cierre el timeline (`RoutesListPanel.tsx`)

- Anadir `touchAction: 'none'` y aumentar `activationConstraint.distance` a 8px para evitar clics accidentales.
- Asegurar que el `handleDragEnd` NO provoque un re-render que colapse `expanded`. Usar `useRef` para `expanded` si es necesario, o memoizar correctamente el estado.
- Verificar que las keys de los componentes no cambian tras reordenar (usar IDs estables, no indices).

### 3. Asegurar visibilidad del menu Origen/Meta/Fin (`RoutesListPanel.tsx`)

- La condicion `!isImported` en linea 834 bloquea el menu contextual para rutas importadas. Los puntos de catalogo del itinerario deben poder recibir roles aunque la ruta padre sea importada.
- Cambiar la condicion: mostrar siempre el menu de roles para TimelineNode, independientemente de si la ruta padre es importada (las rutas GPS son inmutables, pero la asignacion de roles es del itinerario padre, no de la ruta).

### 4. Persistir el reorden de puntos (`RoutesListPanel.tsx`)

En `handleDragEnd` (linea 608-625), anadir la llamada a `reorderParentWaypoints` con los IDs de waypoints en su nuevo orden:

```typescript
if (newPointIds.length > 0) {
  reorderParentWaypoints(parent.id, newPointIds);
}
```

Actualmente solo se llama a `onReorderSegments` pero `reorderParentWaypoints` no se invoca nunca.

### 5. Panel no se cierra al editar (`Index.tsx`)

Linea 587: cambiar `isOpen={routeOrch.showRoutesPanel && !routeOrch.showRouteBuilder}` a `isOpen={routeOrch.showRoutesPanel}` para que permanezca abierto incluso con el builder activo. El builder se mostrara en paralelo (ya tiene su propio FloatingPanel).

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `src/domains/routes/hooks/use-route-orchestration.ts` | Mostrar todas las rutas con flag `selected` en el payload |
| `src/components/map/map-routes.ts` | Aplicar opacity por flag `selected` al renderizar |
| `src/components/RoutesListPanel.tsx` | Fix DnD cierre, persistir reorden puntos, mostrar menu roles siempre |
| `src/pages/Index.tsx` | Panel no se cierra con builder activo |

