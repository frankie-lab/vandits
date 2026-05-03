# Orden jerárquico geográfico persistente

## Objetivo
Que cualquier listado, agrupación o exportación de puntos quede ordenado por la misma jerarquía: continente → país → comunidad/región → provincia/estado → comarca → ciudad → barrio → calle. Una sola fuente de verdad.

## Alcance de esta entrega (Phase 1)
- **No tocamos schema de DB** todavía. Reutilizamos columnas existentes (`continent`, `country`, `region`, `zone`) + `enriched_data.datos_geograficos.{admin_nivel_3, localidad, sublocalidad, calle}`. La migración con columnas dedicadas + índice se queda como Phase 2 si surge problema de rendimiento.
- Sí añadimos `calle` al output del enriquecimiento (ya tenemos `direccion_postal`, falta extraer la vía).

## Cambios

### 1. Helper único — nuevo
`src/shared/geography/hierarchy.ts`:
- `HIERARCHY_LEVELS` (array de 8 niveles canónicos) y labels.
- `getLocationHierarchy(loc)` → `{continent, country, region, zone, admin_level_3, locality, sublocality, street}`.
- `getHierarchyBreadcrumb(loc)` → "Europa / España / Aragón / Zaragoza / ..."
- `compareLocationsHierarchical(a, b)` → comparator estable (Intl.Collator es, numeric, "sin clasificar" siempre al final).
- `groupLocationsByHierarchy(locations, maxDepth)` → árbol recursivo `{level, value, path, count, children, locations}`.

### 2. Tipos
`src/types/location.ts`:
- `DatosGeograficos`: añadir `calle?: string`.
- `FilterCriteria`: añadir `street?: string` y `sortMode?: 'hierarchical' | 'alphabetical' | 'date'` (default `hierarchical`).

### 3. Store de contenido
`src/domains/content/store/locations-store.ts`:
- `getFilteredLocations()` aplica `compareLocationsHierarchical` cuando `sortMode === 'hierarchical'` (default). Sin opt-in de UI inicialmente: el orden jerárquico ya es el por defecto.
- Filtro adicional por `street`.
- `setSortMode(mode)` persistiendo en `preference_values` (scope user, unit `content.point-list-sort`).

### 4. Enriquecimiento
`supabase/functions/enrich-location/index.ts`:
- Pasar `addressdetails=1&zoom=18` a Nominatim para extraer `road` / `pedestrian` / `path` → `calle`.
- Incluir `calle` en `mergedGeoData` y exponerlo en el prompt como dato derivado (no inventable).
- `street` añadido a la nube de etiquetas geográficas (`#NombreCalle`) sólo si Nominatim lo ha devuelto (no se inventa).

### 5. UI: árbol y listas
- `src/components/filters/GeographyTree.tsx`: 8º nivel `street` reutilizando el helper. Sustituir su lógica de conteo manual por `groupLocationsByHierarchy(allLocations, 8)`. Iconos: Globe2 → Flag → Map → MapPin → Building2 → Home → Landmark → Milestone (todos Lucide, sin emojis).
- Listados que ya consumen `getFilteredLocations` heredan automáticamente el orden:
  - Sidebar Catálogo y Workspace
  - Vista de documento (4 pestañas)
  - GalleryView
  - Admin / ficha completa
  - Export KML/GPX/CSV (importan del store)
- Donde se muestre breadcrumb (popup, ficha, lista doc) → usar `getHierarchyBreadcrumb(loc)` en vez de concatenaciones ad‑hoc.

### 6. Memoria
Añadir entrada en `mem://index.md`:
```
- [Geo hierarchy ordering](mem://logic/content/geo-hierarchy-ordering) — Helper único getLocationHierarchy / compareLocationsHierarchical / groupLocationsByHierarchy. Orden por defecto en TODA lista. Niveles: continent → country → region → zone → admin_level_3 → locality → sublocality → street.
```

## Reglas transversales
- Ningún componente puede reimplementar lógica de orden/agrupación geográfica inline. Todo pasa por `src/shared/geography/hierarchy.ts`.
- "Calle" sólo se rellena con dato verificado de Nominatim, nunca inventada por la IA.
- "Sin clasificar" siempre al final del orden.

## Archivos tocados
- **Nuevo:** `src/shared/geography/hierarchy.ts`
- `src/types/location.ts`
- `src/domains/content/store/locations-store.ts`
- `src/components/filters/GeographyTree.tsx`
- `supabase/functions/enrich-location/index.ts` (deploy automático)
- `mem://index.md` + nuevo `mem://logic/content/geo-hierarchy-ordering`

## Phase 2 (futura, opcional)
Cuando haya >5k puntos visibles a la vez:
- Migración: columnas `admin_level_3`, `locality`, `sublocality`, `street` en `locations` + índice compuesto.
- Trigger BEFORE INSERT/UPDATE que sincroniza desde `enriched_data.datos_geograficos`.
- Backfill one-shot.
