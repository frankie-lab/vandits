

# Plan: Hacer que todos los itinerarios funcionen como "Carnavales - Galicia"

## Diagnostico

La ruta **"2020 - Carnavales - Galicia"** funciona correctamente porque tiene **12 parent waypoints**, todos con `location_id` apuntando a ubicaciones reales del catalogo. Fue creada manualmente via RouteBuilder.

La ruta **"SS24 Avila Nevando"** (importada) solo tiene **2 parent waypoints** (inicio y fin de la ruta general), ambos sin `location_id`. Esto ocurre porque `saveImportedRoutes` solo crea waypoints a partir de los **extremos de cada tramo hijo**, no de los puntos del documento.

## Problema raiz

El codigo actual (linea 360-423 de FileUploadZone.tsx) crea parent waypoints asi:
- Un waypoint por cada inicio de tramo hijo (`routes[ri].coordinates[0]`)
- Un waypoint para el fin del ultimo tramo

Esto produce solo 2 waypoints (inicio + fin) cuando hay 1 solo tramo. Los 9 puntos del documento nunca se insertan como waypoints del parent.

La vinculacion con `location_id` implementada previamente es correcta pero solo aplica a esos 2 extremos.

## Solucion

### Paso 1: Insertar todos los puntos del documento como parent waypoints intermedios

Despues de crear los waypoints de extremos (linea 360-423), insertar **todos los puntos del documento** que no coincidan ya con un extremo. Para cada uno:
1. Calcular su posicion relativa sobre la geometria de la ruta (proyeccion al punto mas cercano de la LineString)
2. Asignar `location_id` usando la logica existente de `findClosestLocation` (catalogo > documento)
3. Reordenar posiciones de todos los parent waypoints antes de la insercion final

### Paso 2: Aislar vista del mapa al seleccionar un itinerario

Cuando se selecciona un itinerario en el panel:
1. Emitir evento `itinerary-focus` con los `location_id` de sus waypoints
2. En `LocationMap.tsx`, escuchar el evento y atenuar/ocultar marcadores que no pertenecen al itinerario
3. Al deseleccionar, restaurar todos los marcadores

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/domains/content/components/FileUploadZone.tsx` | Insertar puntos del documento como parent waypoints intermedios con `location_id`, ordenados por proximidad a la geometria |
| `src/pages/Index.tsx` | Emitir evento `itinerary-focus` con location IDs del itinerario seleccionado |
| `src/components/LocationMap.tsx` | Filtrar/atenuar marcadores no pertenecientes al itinerario enfocado |

## Resultado esperado

- Todos los itinerarios importados mostraran sus puntos en el timeline, igual que Galicia
- Cada punto tendra badge "Catalogo" si coincide con un punto aprobado
- Al seleccionar un itinerario, el mapa mostrara solo los marcadores de ese itinerario
- Un mismo punto de catalogo puede aparecer en multiples itinerarios sin duplicacion

