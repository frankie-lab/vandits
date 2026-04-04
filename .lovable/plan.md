
## Sistema de Rutas e Itinerarios

### Fase 1: Base de datos y modelo ✅
- Tabla `routes` (nombre, descripción, modo transporte, usuario, geometría)
- Tabla `route_waypoints` (puntos ordenados, location_id opcional, modo entre tramos)
- RLS para que cada usuario gestione sus rutas

### Fase 2: API de Routing ✅
- **A pie / En coche**: Usar [OSRM](https://router.project-osrm.org) (gratuito, sin API key)
- **Multimodal (vuelos/ferry)**: Líneas rectas entre puntos lejanos (>100km) con indicador de "vuelo/ferry"
- Edge function `calculate-route` que consulte OSRM y devuelva la geometría

### Fase 3: UI en el mapa ✅
- Botón "Crear itinerario" en la toolbar
- Modo de selección: búsqueda de lugares + selección de ubicaciones del usuario
- Panel lateral con la lista de waypoints (reordenables con drag & drop)
- Selector de modo por tramo (🚶 a pie / 🚗 coche / ✈️ vuelo / ⛴️ ferry)
- Polyline coloreada sobre el mapa con la ruta calculada

### Fase 4: Gestión ✅
- Lista de itinerarios guardados con toggle de visibilidad persistente
- Edición de itinerarios existentes

## Motor de Recomendación de Rutas Multimodales ✅

### Tablas de referencia
- `transport_modes`: 10 modos (mochilero, moto propia/alquiler, coche propio/alquiler, barco propio/alquiler, ferry, avión línea/privado) con velocidades, costes, puntuaciones de confort/flexibilidad/autonomía/riesgo/carga/escénico
- `travel_profiles`: 6 perfiles predefinidos (económico, rápido, aventurero, escénico, confortable, mochilero) con pesos de criterios

### Motor de Scoring (Edge Function `score-routes`)
- Genera combinaciones de modos viables para cada tramo
- Calcula coste, tiempo, y puntuaciones cualitativas
- Aplica scoring ponderado según preferencias del usuario
- Filtra por presupuesto y tiempo máximo

### Explicación IA (Edge Function `explain-routes`)
- Usa Lovable AI (Gemini) para generar análisis razonado
- Compara ventajas/inconvenientes de cada alternativa

### UI: Panel "Asesor de Viaje"
- Formulario con origen, destino y paradas intermedias (búsqueda geográfica)
- 6 perfiles de viaje predefinidos con pesos configurables
- Sliders para ajuste manual de criterios
- Restricciones de presupuesto y tiempo
- Cards de resultados con barras de score y desglose por tramo
- Análisis IA desplegable

### Preparado para futuro
- Datos de referencia editables en BD por masters
- Estructura preparada para APIs externas (vuelos, ferries, alquiler, meteorología)
- Sistema de pesos completamente configurable
