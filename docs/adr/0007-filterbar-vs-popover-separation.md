# ADR-0007 — Separación FilterBar vs popover Mis POI

## Problema
FilterBar (Discovery) y popover Mis POI compartían responsabilidades sobre `visualState` y `healthFilter`. Resultados:
- Lógica duplicada para emitir subset-fit.
- Comportamiento ambiguo: ¿quién mueve cámara y cuándo?
- Difícil razonar sobre "qué cambió mi vista".

## Decisión
- **FilterBar**: ejes pasivos (Geo/Tipo/Tags/búsqueda). NO mueve cámara.
- **FilterBar Discovery**: `healthFilter` (eje canónico de Discovery). SÍ mueve cámara vía `useHealthFilterFit`.
- **Popover Mis POI**: `visualState` + `healthFilter` restringidos a `ownershipFilter='mine'`. SIEMPRE mueve cámara con `mode: 'always'` y coords pre-resueltas.
- **UsersSidebar**: `filterByUserId`. SIEMPRE mueve cámara con `mode: 'always'`.
- **SourceFilterBridge**: `filterBySource`. Mueve cámara con `mode: 'if-outside'`.

Cada caller mantiene su hook dedicado (`use-health-filter-fit`, `use-my-catalog-popover-fit`, `use-selection-fit-on-start`). Comparten `requestSubsetFit` pero declaran `reason` distinto.

## Consecuencias
- Cada origen de fit es trazable por `reason`.
- Ningún componente "sabe" de Leaflet directamente — todos pasan por el helper.
- Cambios de UX del popover no afectan FilterBar.

## Tradeoffs
- Múltiples hooks con estructura similar. Justificado por separación de origen.
- Hay que mantener la disciplina: nuevos triggers deben elegir conscientemente `mode` y `reason`.

## Archivos afectados
- `src/components/FilterBar.tsx`
- `src/components/toolbar/MyCatalogQuickFilters.tsx`
- `src/components/discovery/use-health-filter-fit.ts`
- `src/components/discovery/use-selection-fit-on-start.ts`
- `src/components/poi/SourceFilterBridge.tsx`
- `src/components/UsersSidebar.tsx`
