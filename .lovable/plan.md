

El usuario cambia la norma de visibilidad. Hasta ahora los puntos workspace eran visibles en el mapa general; ahora quiere que **solo aparezcan dentro de la vista del documento** del que provienen. Solo cuando se promuevan a Catálogo o se vinculen a un Itinerario, aparecerán en sus capas correspondientes en el global.

## Norma nueva

| Estado del punto | Mapa general | Vista del documento |
|---|---|---|
| Workspace (`is_approved=false`, ligado a `document_id`) | ❌ Oculto | ✅ Visible (gris/naranja/teardrop según enriquecimiento) |
| Catálogo (`is_approved=true`) | ✅ Visible (azul cielo) | ✅ Visible |
| Vinculado a `route` (itinerario) | ✅ Visible cuando ruta toggleada | ✅ Visible |
| Punto manual sin documento | ✅ Visible (Workspace global) | n/a |

Implicación clave: **un punto Workspace deja de tener presencia en el mapa global por el mero hecho de existir.** Necesita una "promoción" explícita (Catálogo o vinculación a ruta) para volver a aparecer fuera de su documento.

## Dónde tocar (mínimo, transversal)

### 1. Filtrado en `useMapData` / `getFilteredLocations` (locations-store)

Único punto de verdad para qué puntos llegan al mapa. Añadir regla:

```text
Si el mapa NO está en modo "vista de documento":
   excluir puntos donde:
     - is_approved = false
     - document_id != null
     - NO están vinculados a ninguna route del usuario
```

El "modo vista de documento" ya existe (`activeDocumentId` global, ver `mem://architecture/document-view-persistence`). Cuando está activo, se mantiene el filtro existente `filterByDocumentId`.

### 2. Verificación de vinculación a ruta

Para no ocultar puntos que sí forman parte de un itinerario activo, necesitamos saber qué `location_id`s están referenciados en `route_waypoints`. Dos opciones:

- **A)** Cargar set `linkedLocationIds: Set<string>` al iniciar (una query agregada `SELECT DISTINCT location_id FROM route_waypoints WHERE user_id = …`) y refrescar cuando cambien rutas. Bajo coste, simple.
- **B)** Vista SQL `locations_with_route_link` y filtrar en BD. Más invasivo.

Recomiendo **A** — un nuevo selector ligero en el store, refrescado por evento `routes-changed`.

### 3. Capa "Workspace" en el panel Capas

Hoy la capa Workspace global controla visibilidad de TODOS los puntos `is_approved=false`. Con la nueva norma, esa capa pierde sentido como toggle global porque ya no habrá puntos workspace en el general (excepto los manuales sin documento).

Decisión: **mantener el toggle Workspace** para los puntos manuales sin `document_id` (creación rápida desde el mapa, si existiera el flujo). Si no existe ese caso, la capa queda inactiva pero no la eliminamos para no romper preferencias guardadas.

### 4. Comportamiento al abrir un documento

Sin cambios — `DocumentFocusView` ya activa `activeDocumentId` y centra los bounds. Solo se beneficia automáticamente del nuevo filtrado.

### 5. Comportamiento al cerrar la vista del documento

Al limpiar `activeDocumentId`, los puntos workspace del documento desaparecen del general (efecto natural del nuevo filtro). Los promovidos a Catálogo / vinculados a ruta permanecen.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/domains/content/hooks/use-filtered-locations.ts` o `locations-store.ts` (donde viva `getFilteredLocations`) | Añadir regla de exclusión workspace+documento cuando no hay `activeDocumentId` |
| `src/domains/content/store/locations-store.ts` | Añadir `linkedLocationIds: Set<string>` + acción `refreshLinkedLocations()` |
| Hook que escucha cambios de rutas (probablemente `use-routes.ts`) | Llamar `refreshLinkedLocations()` tras crear/editar/eliminar rutas |
| Inicialización del store (probablemente `use-realtime-locations.ts`) | Cargar `linkedLocationIds` al arrancar |
| `mem://logic/map/catalog-workspace-layers` y `mem://style/map/marker-classification-v3` | Actualizar memoria con la nueva norma |
| Crear `mem://logic/map/workspace-document-scoped-visibility` | Nueva memoria con la regla |

## Verificación esperada

1. Refrescar el mapa general → los 2.452 círculos de `FullTrips_Map.kml` desaparecen.
2. Abrir el documento desde panel Contenido → los 2.452 reaparecen en su vista.
3. Promover N puntos a Catálogo → esos N aparecen en azul cielo en el general.
4. Cerrar la vista del documento → solo quedan los promovidos.
5. Crear un itinerario que enlace 5 puntos del documento → esos 5 aparecen en el general (capa Itinerarios on).

## Riesgos / consideraciones

- **Punto manual sin documento**: si existe ese flujo, mantenerlo visible en general (el filtro solo excluye `document_id != null`). Confirmado por el diseño de la regla.
- **Performance**: el `Set` de `linkedLocationIds` es O(1) en lookup; refresco solo en cambios de rutas.
- **Realtime**: si llega un nuevo punto vía realtime mientras estás en el general, no aparecerá hasta que abras su documento. Esperado y deseado.

