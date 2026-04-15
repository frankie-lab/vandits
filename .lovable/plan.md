


# Plan: Vincular marcadores de catalogo a waypoints de itinerarios importados

## Estado: ✅ COMPLETADO

## Cambios realizados

### FileUploadZone.tsx — Waypoints intermedios del documento
- `saveImportedRoutes` ahora inserta **todos los puntos del documento** como parent waypoints (no solo inicio/fin)
- Cada punto se proyecta sobre la geometría de la ruta para calcular su posición relativa
- Se asigna `location_id` priorizando catálogo > documento
- Los puntos cercanos a endpoints existentes se omiten para evitar duplicados

### Index.tsx — Evento itinerary-focus
- Al seleccionar un itinerario, se emite `itinerary-focus` con los `location_id` de sus waypoints
- Al cerrar el panel de itinerarios, se limpia el foco

### LocationMap.tsx — Filtrado visual por itinerario
- Estado `itineraryFocusIds` para rastrear los markers del itinerario activo
- Los markers que no pertenecen al itinerario enfocado se atenúan (opacity 0.15)
- Al deseleccionar, todos los markers vuelven a su estado normal
