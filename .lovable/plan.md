

El usuario refina el plan: en lugar de 2 columnas + sección de rutas, quiere **4 pestañas** uniformes para cualquier documento importado. Esto simplifica responsive (mismo layout en mobile y desktop) y unifica la jerarquía visual.

## Norma definitiva de la vista de documento

Cuatro pestañas (PanelTabs) dentro de `DocumentFocusView`, aplicables a **cualquier documento importado**:

| # | Pestaña | Color dot | Contenido | Filtro de origen |
|---|---|---|---|---|
| 1 | **Importados** | Gris | Waypoints `status='unknown'` (sin enriquecer, con descripción mínima) | `getLocationEnrichmentStatus(loc) === 'unknown'` |
| 2 | **Vacíos** | Naranja | Waypoints `status='new'` (sin descripción ni datos) | `getLocationEnrichmentStatus(loc) === 'new'` |
| 3 | **Enriquecidos** | Verde | Waypoints con `enrichedData` (`status='current'` o `'previous'`) | `status === 'current' \|\| status === 'previous'` |
| 4 | **Rutas** | Azul | Polilíneas/itinerarios del documento (`routes` con `document_id`) | query a tabla `routes` |

Cada pestaña muestra contador en su trigger: `Importados (2389)`, `Vacíos (63)`, `Enriquecidos (0)`, `Rutas (N)`.

## Prerequisito (sin esto la lista no llega a 2.452)

Fix de paginación (ya planteado antes):

| Archivo | Cambio |
|---|---|
| `src/domains/content/lib/db-transformers.ts` | + `fetchLocationsByDocumentPaginated(documentId)` paginando range(0..999), (1000..1999)… |
| `src/domains/content/lib/db-operations.ts` | `loadLocationsFromDatabase(documentId)` consume el helper paginado |

## Implementación de las 4 pestañas

### Componente nuevo

`src/domains/content/components/DocumentWaypointsTabs.tsx`

- Usa `PanelTabs` (sistema canónico, ver `mem://ui/panel-system`).
- Estado controlado `value` con tab activa (default: la primera pestaña con contenido > 0).
- Cada tab: cabecera con contador + lista virtualizada con `@tanstack/react-virtual` (necesario por las 2.389 entradas).
- Item de waypoint: thumbnail compacto + nombre + badges geográficos + acción borrar (reutiliza el render de `LocationList` extraído como subcomponente `WaypointListItem`).
- Item de ruta (tab 4): nombre + nº waypoints + distancia + toggle visibilidad + click-to-focus (reutiliza handlers de `RoutesListPanel`).

### Hook nuevo

`src/domains/content/hooks/use-document-routes.ts` — fetch de `routes` filtradas por `document_id = activeDocumentId`, con refresco en evento `routes:changed`.

### Integración

`DocumentFocusView` monta `DocumentWaypointsTabs` reemplazando el listado plano actual cuando hay `activeDocumentId`. Click en waypoint → `setFocusedLocation`. Click en ruta → toggle/foco en mapa.

## Archivos a tocar

| Archivo | Acción |
|---|---|
| `src/domains/content/lib/db-transformers.ts` | + helper paginado por documento |
| `src/domains/content/lib/db-operations.ts` | usa helper paginado |
| `src/domains/content/components/DocumentWaypointsTabs.tsx` | **nuevo** — 4 pestañas |
| `src/domains/content/components/WaypointListItem.tsx` | **nuevo** — item reutilizable extraído de LocationList |
| `src/domains/content/hooks/use-document-routes.ts` | **nuevo** |
| `src/domains/content/components/DocumentFocusView.tsx` | monta tabs en lugar de lista plana |
| `package.json` | +`@tanstack/react-virtual` (si falta) |
| `mem://ui/document-view-tabs` | **nueva memoria** con la norma de 4 pestañas |

## Verificación

1. Abrir `FullTrips_Map` → Tabs visibles con contadores `Importados (2389) · Vacíos (63) · Enriquecidos (0) · Rutas (N)`.
2. Tab Importados scrollea fluido los 2.389 ítems (virtualización).
3. Tab Vacíos muestra los 63.
4. Tab Rutas lista las polilíneas del KML; click en una → mapa la enfoca.
5. Mismo layout en mobile (<640px) y desktop — sin colapsos especiales.
6. Aplicar a cualquier otro documento importado → mismas 4 pestañas, contadores recalculados según su contenido.

## Nota sobre la pestaña "Enriquecidos" (verde)

Hoy los enriquecidos en mapa se renderizan como **teardrops coloreados por categoría**, no en verde. El verde aquí es solo el **dot indicador de la pestaña** en el panel — coherente con el sistema de tabs, no contradice la norma de marcadores en mapa (`mem://style/map/marker-classification-v3`). Lo dejo claro en la nueva memoria.

