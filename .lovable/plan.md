# PR-2 · Health Filter Axis (revisado)

Eje operativo de filtrado por los 4 estados ya visibles en Health Rings v2.
PR estrictamente de filtros: **no toca rings, iconos, zoom, culling, tokens
ni `createCustomIcon`**.

## Objetivo

Permitir reducir mapa + listas a uno de los 4 buckets operativos detectables
por `getPointHealthRings(loc)`:

| Chip               | Bucket    | Acción operativa                  |
|--------------------|-----------|-----------------------------------|
| Todos (default)    | —         | Universo completo (sin filtro)    |
| Rellenar huecos    | partial   | Faltan niveles administrativos    |
| Reparar cadena     | chain     | `geoHealth ∈ {broken,stale_name}` |
| Revisar            | review    | review semántico                  |
| Reintentar         | hardError | fallo técnico                     |

**Single-select**: un chip activo a la vez. Click en el activo → vuelve a
"Todos". El matcher es trivial y no necesita combinaciones AND.

Regla clave: **el matcher delega 100% en `getPointHealthRings(loc)`**, sin
duplicar lógica de `geoHealth` ni de `enrichmentFailureStore`. Cualquier
restricción "verde nunca marca review/hardError" es una **consecuencia** del
helper, no una regla del filtro.

## Cambios

### 1. `src/types/location.ts`
```ts
export type HealthFilter = 'partial' | 'chain' | 'review' | 'hardError';
// dentro de FilterCriteria:
healthFilter?: HealthFilter;
```

### 2. `src/domains/content/lib/location-filtering.ts`
Importar `getPointHealthRings` y añadir al final del matcher:

```ts
if (filters.healthFilter) {
  const rings = getPointHealthRings(loc);
  if (!rings.includes(filters.healthFilter)) return false;
}
```

**No** se añade `includeHealth?: boolean` en `options`. Se omite hasta que
exista un caller que lo necesite (norma "no API preventiva").

### 3. `src/domains/content/lib/filter-presets.ts`
- Añadir `'healthFilter'` a `STATE_KEYS` (lo limpia `resetAllFilters`).
- Añadir `'health'` al union `FilterAxis`.
- Extender `getActiveFilterChips`: si `filters.healthFilter` definido, emitir
  chip `axis: 'health'`, `id: 'health'`, label en español del bucket,
  `remove` borra solo `healthFilter`.
- Extender `countActiveStateFilters` con `if (filters.healthFilter) count++`.

### 4. `src/components/FilterBar.tsx`
- Bloque **"Salud"** justo encima de las pestañas (Geo/Tipo/Tags/Legacy).
- 5 chips horizontales: `[Todos] [Rellenar huecos] [Reparar cadena] [Revisar] [Reintentar]`.
- **Anti-overflow**: contenedor `flex flex-nowrap overflow-x-auto` con
  `scrollbar-thin`. Single-select se mantiene; en viewports estrechos el usuario
  desliza horizontal en vez de partir el bloque o envolverlo a 2 filas (que
  rompería el ritmo del header). Si en QA queda apretado a 1526px, fallback a
  `flex-wrap` con gap pequeño — decisión durante implementación.
- Click en chip → `setFilters({ ...filters, healthFilter: bucket })`.
  Click en chip activo o en "Todos" → borra `healthFilter`.
- Cada chip muestra un dot del color del ring usando los tokens existentes
  (`--poi-health-partial/chain/review/hard-error`) → coherencia visual
  chip ↔ anillo del mapa, sin tocar `tokens/source/poi.json`.
- Añadir case `health` a `styleByAxis` / `IconByAxis` para que el filtro
  aparezca también en la barra de "Filtros activos" cuando esté aplicado.

### 5. `src/test/health-filter.test.ts`
Cobertura mínima:
- Sin `healthFilter` → todos pasan.
- `healthFilter='partial'` → solo puntos con ring `partial` pasan; un punto
  enriched con `geoHealth='partial'` pasa también (porque el helper lo
  reporta).
- `healthFilter='chain'` → solo puntos con ring `chain`; enriched + chain
  pasa.
- `healthFilter='review'` → solo puntos cuyo `getPointHealthRings` incluye
  `review`. Un punto enriched **no** pasa, **como consecuencia de que el
  helper no devuelve `review` para verdes** (no como regla del filtro).
- `healthFilter='hardError'` → análogo a review.
- Combinación `healthFilter='chain'` + `searchTerm` → AND.
- `resetAllFilters` borra `healthFilter`.
- `getActiveFilterChips` emite chip `axis='health'`; su `remove` solo borra
  `healthFilter` y deja el resto intacto.
- `countActiveStateFilters` cuenta `healthFilter`.

### 6. `mem://logic/discovery/health-filter-axis` (nuevo)
- Helper único matcher: `matchesLocationFilters` con `filters.healthFilter`.
- Helper único de detección: `getPointHealthRings(loc)` — el filtro **no
  duplica** predicados; las restricciones "verde nunca review/hardError" son
  consecuencia del helper.
- Single-select por diseño.
- Chips reutilizan tokens CSS de Health Rings v2 (sin tocar `poi.json`).
- `resetAllFilters` lo limpia. Aparece en barra "Filtros activos".

### 7. `mem://index.md`
Añadir entrada en sección "Memories" apuntando al nuevo memory.

## Lo que NO se toca

- `point-health-rings.ts` / `enrichment-failure-state.ts`
- `createCustomIcon` / `map-icons.ts`
- `tokens/source/poi.json`
- `viewport-culling.ts`
- `discovery-store.ts` (filtro vive en `FilterCriteria` del locations-store)
- Stories de Map Lab

## QA manual

- Activar cada chip; verificar que solo quedan markers con el ring correspondiente.
- "Reparar cadena": markers verdes con `broken` siguen visibles.
- "Revisar" / "Reintentar": ningún marker verde aparece.
- "Quitar filtros" borra el chip Salud junto al resto.
- Chip aparece también en "Filtros activos".
- Viewport estrecho: bloque Salud scrolla horizontal sin romper layout.

## Verificación

- `bunx vitest run src/test/health-filter.test.ts`
- `bunx vitest run` (sin regresiones)
- `bunx eslint` sobre archivos tocados
