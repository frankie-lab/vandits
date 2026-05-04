# Filtros cruzados: Geo + Tipo + Tags + Legacy coherentes

## Qué pasa hoy

Acabamos de arreglar el bug de **idiomas en países** (Francia↔France) canonicalizando `getLocationHierarchy`. Ahora, al añadir un filtro de **Tipo** sobre un Geo activo, aparece otro problema relacionado pero distinto:

- **`PlaceTypeFilter`** (pestaña Tipo) cuenta los tipos sobre **todos los puntos del usuario**, ignorando el Geo seleccionado. Si filtras *Europe › France* y abres "Tipo", verás conteos del mundo entero y chips de tipos que no existen en Francia.
- **`ClassificationTree`** (pestaña Legacy) hace lo mismo: muestra códigos sobre el universo total.
- **`TagsTree`** ya hace una intersección parcial pero no usa el matcher canónico, así que puede contar inconsistentemente respecto al mapa.
- **`GeographyTree`** sí está correcto (usa `matchesLocationFilters(..., { includeGeo: false })`).

Resultado visible: al seleccionar *France* y luego un Tipo, el conteo del badge superior baja drásticamente, dando la impresión de que "los tipos eliminan resultados" cuando en realidad **el filtro Tipo se ofreció sobre un universo que incluía países que ya no estaban filtrados**.

## La norma (ya aprobada para Geo, ahora extendida)

Cada faceta del FilterBar (Geo / Tipo / Tags / Legacy) cuenta y muestra opciones sobre el conjunto de puntos que ya pasan **los OTROS ejes activos**, autoexcluyéndose para no colapsar la opción del usuario.

```text
GeographyTree     → matchesLocationFilters(loc, filters, { includeGeo: false })
PlaceTypeFilter   → matchesLocationFilters(loc, filters, { includeClassification: false, includeExploration: 'sin placeType' })
ClassificationTree→ matchesLocationFilters(loc, filters, { includeClassification: false })
TagsTree          → matchesLocationFilters(loc, filters, { includeExploration: 'sin tags' })
```

Esto garantiza:
- Si seleccionas *France*, Tipo / Tags / Legacy sólo muestran tipos/tags/códigos presentes en Francia, con conteos correctos.
- Si seleccionas un Tipo, Geo se reorganiza para mostrar sólo países donde ese tipo existe.
- "Todos" sigue siendo el universo completo (sin filtros activos).

## Cambios técnicos

### 1. `src/domains/content/lib/location-filtering.ts`
Añadir granularidad a `includeExploration` para poder excluir un sub-eje concreto sin perder los demás. Patrón actual: la opción es booleana global. Patrón nuevo: dos flags adicionales `includePlaceType?: boolean` y `includeTags?: boolean` (default `true`), que sólo se aplican cuando `includeExploration` está activo. La búsqueda por texto y los resultados semánticos siguen aplicándose siempre.

### 2. `src/components/filters/PlaceTypeFilter.tsx`
- Importar `matchesLocationFilters`.
- Sustituir el `useMemo` que cuenta `placeTypeCounts` para iterar sólo sobre puntos que pasen `matchesLocationFilters(loc, filters, { includePlaceType: false })`.
- Si no hay tipos resultantes, mostrar el mensaje vacío existente (ya cubre ese caso).

### 3. `src/components/filters/ClassificationTree.tsx`
- Importar `matchesLocationFilters`.
- Reemplazar las dos pasadas sobre `allLocations` (líneas 98 y 164) por iteración sobre `allLocations.filter(loc => matchesLocationFilters(loc, filters, { includeClassification: false }))`.
- Mantener intacta la lógica del árbol jerárquico de códigos.

### 4. `src/components/filters/TagsTree.tsx`
- Reemplazar el filtrado manual inline (línea 125) por `matchesLocationFilters(loc, filters, { includeTags: false })` para asegurar coherencia con el resto del sistema (geo canonicalizada, mismas reglas).
- `totalTagCounts` (universo completo) se mantiene como referencia opcional para mostrar "X de Y" en cada tag.

### 5. Memoria del proyecto
Actualizar `mem://ui/filter-axes-norm` añadiendo el principio: cada faceta cuenta sobre el conjunto que pasa los otros ejes, autoexcluyéndose.

## Archivos editados

- `src/domains/content/lib/location-filtering.ts` (flags `includePlaceType`, `includeTags`)
- `src/components/filters/PlaceTypeFilter.tsx`
- `src/components/filters/ClassificationTree.tsx`
- `src/components/filters/TagsTree.tsx`
- `mem://ui/filter-axes-norm`

## QA visual tras el cambio

- Filtro *Europe › France* + abrir Tipo → solo aparecen tipos presentes en Francia, con conteos sumando ≤ 275 (264 + 11 enriquecidos canonicalizados).
- Filtro Tipo *Building* + abrir Geo → países sin building no aparecen.
- Limpiar filtros (`Quitar filtros`) → todas las facetas vuelven al universo completo.
- "Todos" sigue mostrando 2451 / 2451 sin restricción.
