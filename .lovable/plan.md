## Popover de filtros rápidos sobre el contador verde "mis POI"

Sustituir el toggle simple del contador verde por un **popover** que combina los dos ejes canónicos ya existentes (`visualState` + `healthFilter`) restringidos siempre a `ownershipFilter='mine'`.

El número verde sigue siendo `myCatalog` (contrato Top-bar counter). El popover solo añade interacción al click.

## Contrato confirmado

- Click número verde → abre popover anclado al botón.
- **Cualquier** item del popover fuerza `ownershipFilter='mine'`.
- **"Ver todos"** = `ownershipFilter='mine'` + `visualState=undefined` + `healthFilter=undefined`. NO desactiva `mine`. El toggle legacy desaparece.
- **Enriquecidos / Importados / Vacíos** → setean `visualState`, limpian `healthFilter`.
- **Rellenar huecos / Reparar cadena / Revisar / Rotos** → setean `healthFilter`, limpian `visualState`.
- **Re-toggle** del item activo → vuelve a "Ver todos" (mine + ambos ejes limpios).
- **Reflejo bidireccional**: si el estado entra desde FilterBar con `visualState` + `healthFilter` coexistiendo, el popover muestra **ambos como activos**. Solo cuando el usuario actúa desde el popover se aplica la regla "un eje cada vez" (limpia el contrario).
- Ring/badge en el botón verde cuando `visualState || healthFilter`.
- El contador verde NO cambia: siempre `myCatalog` total. Los counts del subset "míos" van junto a cada item del popover.

## Estructura del popover

**Sección "Estado del punto"** (eje `visualState`, single-select):
- Ver todos — limpia ambos ejes (mantiene `mine`)
- Enriquecidos (verde) — `visualState='enriched'`
- Sin actualizar / Importados (gris) — `visualState='imported'`
- Vacíos (naranja) — `visualState='empty'`

**Separador**

**Sección "Salud operativa"** (eje `healthFilter`, single-select, mismos buckets que FilterBar):
- Rellenar huecos (amber) — `healthFilter='partial'`
- Reparar cadena (yellow) — `healthFilter='chain'`
- Revisar (magenta) — `healthFilter='review'`
- Rotos / Reintentar (red) — `healthFilter='hardError'`

Cada item: dot de color (token CSS canónico) + label + count tabular del subset "míos".

## Implementación técnica

1. **Helper nuevo** — `src/domains/content/lib/my-catalog-quick-counts.ts`:
   ```ts
   getMyCatalogQuickCounts(allLocations, currentUserId): {
     all, enriched, imported, empty,
     partial, chain, review, hardError
   }
   ```
   Reusa `getPointVisualState`, `getHealthBucketCounts`, `getLocationOwnerUserId`. Filtra por owner=`currentUserId` + `is_approved=true` (mismo criterio que `myCatalog` en `getBucketStats`), luego cuenta por bucket. Single source of truth.

2. **Componente nuevo** — `src/components/toolbar/MyCatalogQuickFilters.tsx`:
   - shadcn `Popover` + lista de `Button` agrupados por sección.
   - Lee `filters` y `setFilters` del store de filtros (mismo que FloatingToolbar y FilterBar).
   - Lee counts vía `getMyCatalogQuickCounts(allLocations, currentUserId)`.
   - Cada item marca `active` leyendo `filters.visualState` o `filters.healthFilter` (independientes — ambos pueden estar activos simultáneamente si vinieron de FilterBar).
   - Handler `applyQuickFilter(kind, value)`:
     - Re-toggle item activo (`kind==='visual' && filters.visualState===value` o equivalente health) → kind='all'
     - `kind='visual'` → `setFilters({ ...filters, ownershipFilter: 'mine', visualState: value, healthFilter: undefined })`
     - `kind='health'` → `setFilters({ ...filters, ownershipFilter: 'mine', visualState: undefined, healthFilter: value })`
     - `kind='all'` → `setFilters({ ...filters, ownershipFilter: 'mine', visualState: undefined, healthFilter: undefined })`

3. **Edición de `FloatingToolbar.tsx`**:
   - Sustituir `<button onClick={toggleMine}>` del contador verde por `<Popover>` con `<PopoverTrigger asChild>` envolviendo el botón existente.
   - Indicador visual: `ring-2 ring-emerald-500/40` cuando `filters.visualState || filters.healthFilter`.
   - Mantener idénticos: número (`myCatalog` total), dot verde, tooltip, formato.

4. **Subset-fit**: respetar `requestSubsetFit` ya cableado. Activar `healthFilter='hardError'` (o cualquier health) desde el popover dispara el mismo path que el chip de FilterBar (lógica en `use-health-filter-fit.ts`, no se duplica). Activar `visualState` no mueve cámara.

## Lo que NO se toca

- Contador azul (`catalogTotal`).
- `getBucketStats` ni regla del Top-bar counter.
- Matcher (`location-filtering.ts` / `matchesLocationFilters`).
- FilterBar modo Mantener — sigue funcionando, sincronizado por `FilterCriteria`.
- Palette, health rings, iconos.

## Criterio de aceptación

1. Número verde sigue siendo `myCatalog` total (no cambia con sub-filtros).
2. Counts internos del popover son del subset "míos".
3. "Ver todos" mantiene `ownershipFilter='mine'`.
4. Activar `visualState` desde popover limpia `healthFilter`.
5. Activar `healthFilter` desde popover limpia `visualState`.
6. Si FilterBar dejó ambos activos, popover refleja los dos como activos.
7. Re-click sobre item activo → vuelve a "Ver todos".
8. `hardError` desde popover dispara el mismo subset-fit que FilterBar.
9. Botón verde muestra ring cuando hay sub-filtro activo.
