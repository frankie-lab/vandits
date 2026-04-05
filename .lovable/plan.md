
## Plan: Reconstruir Itinerarios desde cero

### Concepto simplificado
Un itinerario tiene **un punto de partida (A)** y **un punto de destino (B)**, con un **modo de transporte** y **preferencias de vía** (rápida/paisajística).

### Lo que se ELIMINA:
- ❌ Destinos intermedios (add destination)
- ❌ Ida y vuelta (round trip)
- ❌ Color de ida / color de vuelta
- ❌ Porcentaje de diferencia en la vuelta
- ❌ Etapas múltiples (stages)
- ❌ Máximo horas de conducción por etapa
- ❌ Notas por etapa
- ❌ Reordenación drag-and-drop de waypoints
- ❌ Columnas de BD: `is_round_trip`, `avoid_same_return`, `outbound_color`, `accepted_modes`

### Lo que se CONSERVA:
- ✅ Punto de origen (con selector de ubicación / Home / búsqueda)
- ✅ Punto de destino (con selector de ubicación / Home / búsqueda)
- ✅ Modo de transporte (walking, driving, flight, ferry)
- ✅ Preferencia de vía (rápida / paisajística)
- ✅ Nombre y descripción del itinerario
- ✅ Cálculo de ruta via edge function (OSRM)
- ✅ Visualización en mapa
- ✅ Guardar / eliminar itinerarios
- ✅ Lista de itinerarios guardados

### Cambios en BD (migración):
1. Tabla `routes`: eliminar columnas `is_round_trip`, `avoid_same_return`, `outbound_color`, `accepted_modes`; añadir `transport_mode` (text) y `road_preference` (text, default 'fastest')
2. Tabla `route_waypoints`: simplificar a solo 2 registros (origen pos=0, destino pos=1) por ruta

### Cambios en código:
1. **`RouteBuilder.tsx`**: Reescribir simplificado — solo origen, destino, modo, preferencia, calcular, guardar
2. **`use-routes.ts`**: Simplificar para reflejar nuevo esquema
3. **`RoutePreferences.tsx`**: Simplificar a solo la preferencia rápida/paisajística
4. **Edge function `calculate-route`**: Sin cambios (ya soporta 2 waypoints)
5. **`RoutesListPanel.tsx`**: Adaptar a nuevo esquema simplificado

### Orden de ejecución:
1. Migración de BD
2. Reescribir `use-routes.ts`
3. Reescribir `RouteBuilder.tsx`
4. Simplificar `RoutePreferences.tsx`
5. Adaptar componentes dependientes
