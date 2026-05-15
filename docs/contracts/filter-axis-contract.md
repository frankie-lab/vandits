# Contract — Filter Axes

## Propósito
Definir los ejes ortogonales de filtrado de POIs y separar **filtrar** (no mueve cámara) de **encuadrar** (mueve cámara).

## Variables canónicas (`locations-store.filters`)
| Eje | Tipo | Mueve cámara |
|---|---|---|
| `ownershipFilter` | `'all' \| 'mine' \| 'others' \| 'app' \| 'source'` | NO |
| `filterByUserId` | `string \| null` | SÍ (vía `UsersSidebar`) |
| `visualState` | `'enriched' \| 'imported' \| 'empty' \| undefined` | Solo desde popover Mis POI |
| `healthFilter` | `'partial' \| 'chain' \| 'review' \| 'hardError' \| undefined` | SÍ (eje Salud + popover) |
| `geoFilters` | `{ regionId?, zoneId?, admin3Id?, localityId? }` | NO |
| `typeFilter`, `tagFilter`, `searchQuery` | varios | NO |

## Ownership
- Store: `useLocationsStore` (zustand).
- Setters únicos: `setFilters`, `setOwnershipFilter` (vía `useLayerVisibility`).
- Matcher único: `matchesLocationFilters` → produce `filteredLocations`.

## Source of truth
`useLocationsStore.getState().filters`. UI deriva, nunca mantiene copia.

## Eventos canónicos
- `setFilters(patch)` desde:
  - `FilterBar` (Geo/Tipo/Tags/búsqueda) → NO emite subset-fit.
  - `MyCatalogQuickFilters` popover → SÍ emite `lovable:my-catalog-popover-applied`.
  - `useHealthFilterFit` → SÍ emite `requestSubsetFit({ reason: 'health-filter' })`.
  - `UsersSidebar` (filtro por usuario) → SÍ emite `requestSubsetFit({ reason: 'user-filter', mode: 'always' })`.

## Forbidden writes
- Modificar `filters` desde `LocationMap` o renderers.
- Mover cámara desde el setter del eje (debe ir por `requestSubsetFit`).
- Combinar `visualState` y `healthFilter` simultáneamente desde el popover (mutuamente excluyentes en `MyCatalogQuickFilters`).

## Invariantes
1. **Filtrar ≠ mover cámara**, salvo los 3 triggers explícitos arriba.
2. `filterByUserId` activo → bypass de zoom gates en capas `followed/app/source`.
3. El matcher es la única fuente de `filteredLocations` y `markerLocations`.
4. El popover Mis POI siempre fuerza `ownershipFilter='mine'` antes de aplicar visualState/healthFilter.

## Ejemplos válidos
- Filtro Geo + búsqueda → `filteredLocations` se reduce, cámara intacta.
- Click "Enriquecidos" en popover → `visualState='enriched'`, `ownershipFilter='mine'`, fit explícito de TODO el subset.

## Anti-patrones detectados
- (Resuelto) Lógica de visualState duplicada entre FilterBar y popover. Ver ADR-0007.
- (Vigilar) Listeners que reaccionan a `filters` y mueven cámara sin pasar por `requestSubsetFit`.

## Referencias
- ADR-0003, ADR-0004, ADR-0007
- mem://ui/filter-axes-norm
- mem://logic/map/subset-fit-contract
