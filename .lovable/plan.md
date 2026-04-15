

# Plan: Vincular marcadores de catalogo a waypoints de itinerarios importados

## Problema

Cuando se importa un archivo con rutas, el sistema:
1. Guarda los puntos del archivo como `locations` (mesa de trabajo)
2. Detecta cuales coinciden con el catalogo (badge "Ya existe")
3. Crea rutas con waypoints, pero **nunca enlaza los waypoints con las locations del catalogo**

El timeline del itinerario usa `wp.locationId` para mostrar el badge "Catalogo" y el icono de marcador. Como los waypoints importados no tienen `location_id`, el itinerario aparece sin marcadores de catalogo.

## Solucion

### Paso 1: Enriquecer `saveImportedRoutes` con matching de catalogo

Modificar `FileUploadZone.tsx` para que `saveImportedRoutes` reciba los `matchingPointIds` y las locations del documento. Para cada waypoint del parent itinerary:

1. Buscar si alguna location del documento esta dentro de 250m del waypoint
2. Si esa location tiene un match con catalogo (esta en `matchingPointIds`), buscar la `location_id` del punto de catalogo real en BD
3. Asignar ese `location_id` al waypoint

```text
Flujo actual:
  Archivo -> locations (sin location_id en waypoints)

Flujo corregido:
  Archivo -> locations
         -> waypoints con location_id cuando hay match catalogo
```

### Paso 2: Pasar datos de matching al guardado de rutas

En `handlePreviewConfirm` y `handleConfirmDeduplication`, pasar la informacion de matching a `saveImportedRoutes`:
- Las locations del documento guardadas
- Los IDs de matching con catalogo
- Las locations existentes del catalogo para resolver el `location_id` real

### Paso 3: Resolver `location_id` del catalogo

Dentro de `saveImportedRoutes`, para cada coordenada de waypoint del parent:
1. Buscar locations del documento que esten cerca (< 250m)
2. Si alguna esta en `matchingPointIds`, buscar la location de catalogo correspondiente (`is_approved = true`) por proximidad
3. Insertar el waypoint con `location_id` apuntando a la location de catalogo

### Paso 4: Incluir locations nuevas del documento

Para puntos que NO coinciden con catalogo pero si estan en el documento (nuevos):
- Asignar su `location_id` al ID de la location recien guardada en el documento
- Esto permite que el timeline muestre todos los puntos del documento, no solo los de catalogo

## Archivos a modificar

1. **`src/domains/content/components/FileUploadZone.tsx`**
   - Ampliar la firma de `saveImportedRoutes` para recibir `documentLocations` y `existingCatalogLocations`
   - Implementar la logica de proximity matching para asignar `location_id` a parent waypoints
   - Pasar los datos necesarios desde `handlePreviewConfirm` y `handleConfirmDeduplication`

## Resultado

- Los itinerarios importados mostraran marcadores de catalogo (badge azul "Catalogo") para puntos que coincidan con el catalogo existente
- Los puntos nuevos del documento tambien apareceran vinculados en el timeline
- Los puntos de catalogo no se re-enriquecen (solo se referencian)
- El mismo punto de catalogo puede aparecer en multiples itinerarios sin duplicacion

