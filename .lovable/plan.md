

# Plan: Corregir visibilidad de rutas y marcadores al seleccionar un itinerario

## Diagnostico

He encontrado dos problemas principales:

1. **Los marcadores "extra" (circulos teal)** son los `routeWaypointMarkers` que se añadieron en el ultimo cambio. Los waypoints de la DB no tienen `location_id` (son coordenadas puras, no puntos de catalogo), asi que estos circulos no representan puntos de catalogo — son redundantes con los puntos que ya muestra el panel del itinerario.

2. **Las rutas (polilineas) no se ven** — La logica del orchestration hook deberia mostrarlas cuando el panel esta abierto (`showRoutesPanel = true`, `visibleRouteIds` vacio → muestra TODAS las rutas con geometria). Los 6 child routes tienen geometria. El problema probable es que el efecto no se re-dispara al abrir el panel o hay un conflicto con el evento `map-clear-route` que se emite en otro flujo.

## Cambios propuestos

### 1. Eliminar los waypoint markers extra (map-routes.ts + LocationMap.tsx + Index.tsx)
- Eliminar la funcion `showRouteWaypointMarkers`, `clearRouteWaypointMarkers` y su tipo `RouteWaypointMarkerData`
- Eliminar los listeners `map-show-route-waypoint-markers` y `map-clear-route-waypoint-markers` de LocationMap
- Eliminar la query a `route_waypoints` y el dispatch desde `onFocusRoute` en Index.tsx
- Los puntos del catalogo ya se muestran como marcadores normales del mapa

### 2. Asegurar visibilidad de rutas al abrir el panel (use-route-orchestration.ts)
- Añadir un log temporal o forzar el re-dispatch de `map-show-route` cuando `showRoutesPanel` cambia a `true`
- Verificar que la condicion `else if (showRoutesPanel)` efectivamente alcanza los child routes (que SI tienen `routeGeometry`)
- El parent route NO tiene geometria (`has_geometry: false`), pero sus 6 hijos SI — confirmar que `allRoutes` incluye los hijos

### 3. Simplificar onFocusRoute (Index.tsx)
- Al hacer click en un segmento: solo hacer `fitBounds` al area del segmento usando su geometria directamente (del route object), sin query a DB
- El evento `itinerary-segment-selected` ya maneja el highlighting/dimming de polilineas (opacity 0.18 para no seleccionadas)

### 4. Garantizar que al click en un itinerario padre se muestren todos sus tramos
- Cuando se hace click en el itinerario completo (no en un segmento individual), mostrar todos los child routes con sus polilineas
- Hacer fitBounds al area total del itinerario

## Resultado esperado
Al abrir el panel de Itinerarios y hacer click en una ruta:
- Se ven TODAS las polilineas de los tramos del itinerario
- El tramo seleccionado se resalta, los demas se atenuan (opacity 0.18)
- Los puntos de catalogo visibles en el mapa no cambian
- No aparecen marcadores extra innecesarios

