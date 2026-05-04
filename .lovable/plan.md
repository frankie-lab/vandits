# Filtros — "Todos" como reset real y opciones que incluyan enriquecidos

## Diagnóstico

Tres bugs distintos producen el síntoma "los enriquecidos no aparecen":

1. **"Todos" no es realmente Todos.** El toggle Exploración (Todos / Visitados / Pendientes) en `FilterBar.tsx` solo modifica `filters.visitedFilter`. NO limpia `onlyEnriched`, `verified`, `placeType`, `tag`, `enrichmentStatus`, ni los breadcrumbs geo. Si quedó cualquiera de esos activos, "Todos" sigue ocultando puntos. Es contraintuitivo.

2. **Pestaña Tipo solo mira la columna `placeType`.** `src/components/filters/PlaceTypeFilter.tsx` cuenta `loc.placeType`, pero los puntos enriquecidos suelen tener su tipo en `enriched_data.datos_clave.tipo` y/o `enriched_data.clasificacion.codigo` y la columna `place_type` puede estar vacía. Resultado: los 21 enriquecidos no aparecen en ningún tipo.

3. **El mapa hereda los mismos filtros residuales** del store (`getFilteredLocations`). Como "Todos" no los limpia, los marcadores verdes desaparecen aunque visualmente parezca que no hay filtro activo.

## Cambios

### 1. "Todos" = reset transversal (helper único)

Crear `resetExplorationFilters(filters)` en `src/domains/content/lib/filter-presets.ts` (nuevo archivo, helper central — regla de cambios transversales). Devuelve un objeto con:

- `visitedFilter: 'all'`
- `onlyEnriched: false`
- `verified: undefined`
- `enrichmentStatus: undefined`
- `placeType: undefined`
- `tag: undefined`
- `searchTerm: undefined`
- `semanticResultIds: undefined`
- Preserva los breadcrumbs geo (`continent/country/...`) y `classificationCode` para no perder navegación.

En `FilterBar.tsx`, el botón "Todos" del ToggleGroup llama a `setFilters(resetExplorationFilters(filters))`. Visitados/Pendientes mantienen el resto del estado y solo cambian `visitedFilter`.

Renombrar visualmente la etiqueta de "Exploración:" sigue OK; añadir tooltip "Todos = quitar filtros activos".

### 2. PlaceTypeFilter: incluir tipos derivados de enriched_data

Modificar `src/components/filters/PlaceTypeFilter.tsx` para que el conteo y el listado se construyan a partir de un `getEffectivePlaceType(loc)` central:

```ts
// src/domains/content/lib/effective-place-type.ts (nuevo helper)
export function getEffectivePlaceType(loc: GeoLocation): PlaceType | undefined {
  return loc.placeType
      || (loc.enrichedData?.datos_clave?.tipo as PlaceType | undefined)
      || mapClasificacionToPlaceType(loc.enrichedData?.clasificacion?.codigo);
}
```

- El conteo de la pestaña "Tipo" usa `getEffectivePlaceType(loc)`.
- El filtro en `locations-store.ts` (`filters.placeType` matching) también pasa por el mismo helper para que seleccionar un tipo encuentre tanto los puntos con la columna como los que solo lo tienen en IA.
- `mapClasificacionToPlaceType` se basa en el primer dígito/código del catálogo `place_types` (ya existente). Si no hay match, devuelve `undefined`.

### 3. Saneo del estado al cargar (defensivo)

En `locations-store.ts`, al `setDocument(null)` o cuando se limpia la selección desde "Limpiar", invocar también `resetExplorationFilters` para no arrastrar `onlyEnriched=true` entre vistas.

### 4. Indicador visual de filtros activos

Junto al toggle "Todos / Visitados / Pendientes", añadir un chip pequeño "N filtros activos" cuando hay algún filtro distinto del visitedFilter. Click en el chip = `resetExplorationFilters`. Hace el problema descubrible.

## Lo que NO se toca

- Marker palette V2 (frozen).
- Lógica de visibilidad doc-status (`isLocationVisibleInGlobalMap`).
- Ownership filter (`mine/followed/all`) ni `hiddenFollowedUserIds`.
- TagsTree (ya lee correctamente `enriched_data.etiquetas`; solo se beneficia indirectamente del reset).
- ClassificationTree (Legacy) — ya consulta `enriched_data.clasificacion`.

## Detalles técnicos

- **Helper central** en `src/domains/content/lib/filter-presets.ts` y `src/domains/content/lib/effective-place-type.ts`. NUNCA inline en componentes (regla de cambios transversales).
- Tests:
  - `src/test/locations-store.test.ts`: con un punto que solo tiene `enriched_data.datos_clave.tipo='beach'` y `placeType=null`, filtrar por `placeType='beach'` debe incluirlo.
  - Nuevo `src/test/filter-presets.test.ts`: `resetExplorationFilters` deja `visitedFilter='all'` y limpia las 7 claves listadas, preservando geo.
- No se cambia el esquema de DB ni RLS.

## Pregunta

Si `enriched_data.datos_clave.tipo` no coincide exactamente con un código del catálogo `place_types` (ej. la IA devuelve "Playa de arena" en vez de un código), ¿prefieres
(a) un mapeo flexible por nombre normalizado o (b) ignorarlos y dejar que solo cuenten cuando coincida 1:1? Por defecto haré (a) con un fallback case-insensitive sobre `place_types.name` y `place_types.code`.
