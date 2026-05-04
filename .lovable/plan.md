## Objetivo

Convertir la lógica de filtros en una **norma transversal** clara, sin parches por componente:

- **"Todos"** = el universo completo de puntos del usuario. No es un filtro: es la ausencia de filtros de estado.
- **Filtros de Clasificación** (Geo / Tipo / Tags / Legacy) = pestañas; siempre se aplican sobre el universo "Todos".
- **Filtros de Estado** (Visita, Enriquecimiento) = ejes ortogonales, opcionales, combinables (AND).
- **Búsqueda / IA** = filtro textual independiente.

Los filtros NO compiten entre sí: el usuario activa los que quiera y se intersectan. "Todos" deja de ser un botón con doble función (selector + reset) y pasa a ser el estado por defecto cuando ningún chip de estado está activo.

## Modelo conceptual (la norma)

```text
UNIVERSO = todos los puntos del usuario
   |
   +-- Clasificación  (pestañas, combinables con todo)
   |     Geo  /  Tipo  /  Tags  /  Legacy
   |
   +-- Estado  (chips deseleccionables, AND)
   |     Visita        : [ Visitado | Pendiente ]   ninguno = sin filtro
   |     Enriquecimiento: [ Enriquecido | Importado | Vacío ]  ninguno = sin filtro
   |
   +-- Búsqueda / IA
```

Regla de oro: **ningún componente decide reglas de filtrado por su cuenta**. Todo pasa por helpers en `filter-presets.ts` y por el matcher único `matchesLocationFilters` que ya existe.

## Cambios

### 1. `src/domains/content/lib/filter-presets.ts` (norma única)

Reescribir como API transversal:

- `resetAllFilters(filters)`: limpia los 3 ejes de estado + búsqueda. **No toca clasificación** (geo, type, tag, classificationCode) ni navegación (ownership, filterByDocumentId, etc.).
- `clearStatusFilters(filters)`: solo ejes de estado (visita + enriquecimiento + verified).
- `clearVisitFilter(filters)`, `clearEnrichmentFilter(filters)`: helpers individuales.
- `countActiveStateFilters(filters)`: cuenta chips de estado activos (para el contador "N filtros activos").
- Mantener el alias `resetExplorationFilters` apuntando a `resetAllFilters` por retrocompatibilidad temporal, pero marcar `@deprecated`.

Las claves "estado" pasan a ser: `visitedFilter`, `onlyEnriched`, `verified`, `enrichmentStatus`, `semanticResultIds`, `searchTerm`. Cualquier código que limpie filtros DEBE importar uno de estos helpers.

### 2. `src/components/FilterBar.tsx` (reorganización visual coherente)

Sustituir el bloque actual (Switch "Solo enriquecidos" arriba + ToggleGroup "Todos/Visitados/Pendientes" debajo) por **dos filas paralelas y simétricas**:

```text
Estado de visita:        [ Visitado ]  [ Pendiente ]                  ← chips deseleccionables
Estado de enriquecimiento:[ Enriquecido ]  [ Importado ]  [ Vacío ]   ← chips deseleccionables
                                                  [Quitar filtros (N)]  ← solo si N>0
```

- Eliminar el item `Todos` del ToggleGroup. El estado "ver todos" se representa por **ningún chip activo** en ambas filas.
- "Solo enriquecidos" deja de ser un Switch suelto y pasa a ser el chip "Enriquecido" en la fila de estado de enriquecimiento, alineado con la paleta del sistema (verde / gris / naranja).
- El contador "N filtros activos" se transforma en un único botón "Quitar filtros (N)" que llama a `resetAllFilters`. Visible solo cuando N>0.
- Cambiar el label "Exploración:" por "Estado:" para reflejar la semántica real.
- Los chips de tipo "deseleccionable" se implementan con `ToggleGroup type="single"` (permitiendo `value=""` para deseleccionar) o con botones toggle individuales — usaremos botones toggle para no acoplar mutuamente exclusivos lo que no lo es entre filas.

### 3. Mapeo del nuevo chip "Enriquecimiento" a campos existentes

Sin migración de datos: el chip mapea a flags actuales del FilterCriteria.

- `Enriquecido` → `onlyEnriched: true`
- `Importado` → `enrichmentStatus: 'imported'` (o equivalente en `getPointVisualState`)
- `Vacío` → `enrichmentStatus: 'empty'`

La fuente de verdad sigue siendo `getPointVisualState(loc)` (paleta verde/gris/naranja) — la UI solo expone los tres estados ya existentes.

### 4. Limpieza de llamadas dispersas

Auditar y reemplazar cualquier limpieza inline de filtros por los helpers de `filter-presets.ts`:
- `src/components/FilterBar.tsx` (chips del breadcrumb "Filtros activos")
- `src/domains/discovery/components/DiscoveryOrchestrator.tsx`
- `src/components/UnresolvedLocationsPanel.tsx`

Verificar con `rg "setFilters\(.*undefined" src` que no quedan resets ad hoc.

### 5. Memoria del proyecto

Sustituir la entrada `[Filter presets — Todos as reset]` por una nueva norma:

> **Filter axes (norma)**: tres ejes ortogonales independientes — Clasificación (Geo/Tipo/Tags/Legacy), Estado (Visita + Enriquecimiento), Búsqueda. "Todos" NO es un filtro: es el universo. Limpieza de estado SIEMPRE vía `resetAllFilters` / `clearStatusFilters` en `filter-presets.ts`. Nunca limpiar inline. Chips de estado son deseleccionables; "ningún chip activo" = sin filtro.

## Detalles técnicos

- `VisitedFilter` actual tiene valor `'all'` que en la práctica significa "sin filtro". Lo trataremos siempre como sinónimo de `undefined` (el matcher ya lo hace). En la UI nueva no se muestra como opción: deseleccionar el chip activo equivale a `undefined`.
- El matcher `matchesLocationFilters` no necesita cambios: ya respeta cada eje por separado.
- Tipos: no se añade nada nuevo a `FilterCriteria`. Solo nuevos helpers en `filter-presets.ts`.
- Persistencia: los filtros de estado siguen guardándose en el store igual que ahora; al ser opcionales el comportamiento por defecto al recargar es "ver todos".

## Archivos a tocar

- `src/domains/content/lib/filter-presets.ts` — reescritura de helpers
- `src/components/FilterBar.tsx` — reorganización de la sección de estado
- `mem://ui/filter-presets-todos-reset` — actualizar a la nueva norma "Filter axes"

Sin migraciones de DB. Sin cambios en el matcher ni en otros componentes (solo reemplazar limpiezas inline si aparecen).
