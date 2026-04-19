

## Opción 3 confirmada — visibilidad atada al estado del documento padre

**Regla unificada:**
- Documento `draft` (Mesa de Trabajo) → todos sus puntos y rutas **ocultos** en el mapa global. Visibles solo dentro de la vista del documento.
- Documento `published` (Catálogo) → todos sus puntos visibles en el mapa global como Catálogo (azul cielo). Las rutas siguen ocultas por defecto (solo visibles vía panel Itinerarios o vista documento).
- Promoción es **documento-a-documento**, no punto-a-punto. Eliminamos la noción de promover puntos sueltos vía `is_approved`.

Esto explica por qué la captura está mal: el documento `FullTrips_Map` está en `draft` y sus 2452 puntos NO deberían verse en el global; ahora se ven (incorrectamente como pins azules de catálogo).

## Causas a corregir transversalmente

1. **Flags V2 de lectura/render activos** sobre datos V2 vacíos → repintan encima del legacy y rompen el estilo. Fix: apagar `v2_data_read_places`, `v2_data_read_user_places`, `v2_map_features` hasta paridad real.
2. **Filtro global no respeta `documents.status`** → `locations-store.getFilteredLocations` filtra por `is_approved`/`document_id` pero no por el estado del documento padre. Hay que añadir el join lógico: si `document_id` existe y el doc está en `draft`, ocultar en global.
3. **Bug semántico en `DocumentFocusView`** → `matchIds` empuja `match.id` (catálogo) en vez de `loc.id` (waypoint local), rompiendo el `_layerType`.
4. **Cabecera "Mi catálogo activo"** → engañosa fuera de contexto; debe mostrar contadores reales (Importados gris / Vacíos naranja / Enriquecidos verde / Catálogo azul / Rutas) y, dentro de vista documento, los del documento.

## Plan transversal (un solo helper, sin parches)

**A. Helper único de visibilidad por estado de documento**
Crear `src/domains/content/lib/document-visibility.ts` con:
```ts
isLocationVisibleInGlobalMap(loc, docStatusMap): boolean
```
Regla: visible si `!loc.document_id` **o** `docStatusMap.get(loc.document_id) === 'published'`. Las rutas siempre `false` por defecto en global (siguen el toggle de Itinerarios).

Este helper es la **única** fuente de verdad. Lo consumen:
- `locations-store.getFilteredLocations` (mapa global)
- `useResolvedMapFeatures` (cuando no hay `filterByDocumentId`)
- `use-document-focus` (override cuando hay vista documento activa: muestra todos los puntos del doc independientemente del status)

**B. Cargar status de documentos en el store**
Añadir `documentStatusMap: Map<string, 'draft'|'published'>` al `locations-store`, hidratado al cargar/refrescar documentos. Invalidar cuando un documento cambia de status (ya hay evento, lo reutilizamos).

**C. Apagar flags V2 de lectura**
Migración SQL: `app_settings` → `v2_data_read_places=false`, `v2_data_read_user_places=false`, `v2_map_features=false`. Mantener flags de write (mirroring incremental).

**D. Fix semántico `DocumentFocusView.fetchData`**
```ts
if (match) matchIds.push(loc.id); // era match.id
```
Para que `filterByDocumentMatchIds` marque correctamente como twins de catálogo solo los waypoints del documento.

**E. Cabecera y badges**
- `Header.tsx` / `FilterBar.tsx`: cuando `filterByDocumentId` activo → contadores del documento (4 estados). Cuando no → contadores globales reales (no "catálogo activo" engañoso).
- Reutilizar derivados de `DocumentWaypointsTabs` (mismo cómputo).

**F. Promoción documento → catálogo**
Validar que el flujo "Add as itinerary / Promover documento" cambie `documents.status` a `published` (no toca `is_approved` punto a punto). Auditar `add-as-itinerary` y eliminar mutaciones de `is_approved` por punto si las hubiera.

**G. Memorias a actualizar**
- `mem://logic/map/workspace-document-scoped-visibility` → reescribir: regla atada a `documents.status`, no a `is_approved` por punto.
- `mem://features/content/document-lifecycle-v3` → confirmar promoción documento-a-documento.
- `mem://style/map/marker-classification-v3` → catálogo = puntos cuyo doc está `published`.

## QA de aceptación

1. Recargar con doc `FullTrips_Map` (draft) → 0 puntos en mapa global, 0 rutas.
2. Entrar a la vista del documento → 2452 puntos visibles (gris/naranja según descripción), rutas visibles dentro del doc.
3. Promover el documento a Catálogo → los 2452 puntos aparecen en global como azul cielo; rutas siguen ocultas en global salvo toggle.
4. Salir de la vista doc → si sigue draft, desaparecen del global.
5. Mapa global con varios docs (mezcla draft/published) → solo se ven los de docs published.

## Archivos afectados

```text
NEW   src/domains/content/lib/document-visibility.ts
NEW   supabase/migrations/<ts>_disable_v2_read_flags.sql
EDIT  src/domains/content/store/locations-store.ts          (documentStatusMap + filtro)
EDIT  src/domains/content/components/DocumentFocusView.tsx  (matchIds bug)
EDIT  src/hooks/use-resolved-map-features.ts                (consumir helper)
EDIT  src/components/Header.tsx                              (contadores reales)
EDIT  src/components/FilterBar.tsx                           (etiqueta condicional)
EDIT  mem://index.md + 3 memorias listadas arriba
```

Sin tocar: legacy renderer, V2 grammar (frozen), RLS (la regla es de presentación, no de seguridad — la BBDD sigue permitiendo leer los puntos para que la vista doc funcione).

