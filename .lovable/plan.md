
## Sistema de Rutas e Itinerarios

### Fase 1: Base de datos y modelo
- Tabla `routes` (nombre, descripción, modo transporte, usuario, geometría)
- Tabla `route_waypoints` (puntos ordenados, location_id opcional, modo entre tramos)
- RLS para que cada usuario gestione sus rutas

### Fase 2: API de Routing
- **A pie / En coche**: Usar [OSRM](https://router.project-osrm.org) (gratuito, sin API key)
- **Multimodal (vuelos/ferry)**: Líneas rectas entre puntos lejanos (>100km) con indicador de "vuelo/ferry", ya que no existe API gratuita de vuelos/ferries con rutas reales
- Edge function `calculate-route` que consulte OSRM y devuelva la geometría

### Fase 3: UI en el mapa
- Botón "Crear itinerario" en la toolbar
- Modo de selección: click en puntos del mapa para añadirlos al itinerario (ordenados)
- Panel lateral con la lista de waypoints (reordenables con drag & drop)
- Selector de modo por tramo (🚶 a pie / 🚗 coche / ✈️ vuelo / ⛴️ ferry)
- Polyline coloreada sobre el mapa con la ruta calculada

### Fase 4: Gestión
- Lista de itinerarios guardados
- Exportar como GPX/KML
- Compartir con seguidores

### Limitaciones
- OSRM gratuito no calcula rutas de ferry reales — se mostrarían como líneas rectas sobre el mar
- No hay API pública gratuita para rutas de vuelos — se trazaría un arco entre aeropuertos
- Para rutas reales de ferry/avión se necesitaría un servicio de pago (Google Directions API, Rome2Rio, etc.)

### ¿Quieres que empiece por la Fase 1 (base de datos) y avancemos paso a paso?
