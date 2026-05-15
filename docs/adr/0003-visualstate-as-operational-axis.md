# ADR-0003 — `visualState` reactivado como eje operativo

## Problema
`visualState` quedó deprecado tras introducir `healthFilter`, pero los usuarios necesitaban filtrar por "enriquecido / sin actualizar / vacío" como acción rápida sobre **su propio catálogo**. Reintroducirlo en FilterBar habría duplicado UX con healthFilter.

## Decisión
- Reactivar `visualState` como eje del store (`'enriched' \| 'imported' \| 'empty'`).
- Exponer SOLO desde el popover `MyCatalogQuickFilters` (anclado al contador verde de "mis POI").
- El popover fuerza `ownershipFilter='mine'` antes de aplicar el eje.
- `visualState` y `healthFilter` son mutuamente excluyentes desde el popover.

## Consecuencias
- Filtro rápido limpio sin contaminar FilterBar.
- Sin solapamiento conceptual con healthFilter (que sigue siendo eje canónico en Discovery).
- Counts del popover se calculan vía `getMyCatalogQuickCounts`.

## Tradeoffs
- Dos puntos de filtro (FilterBar global + popover personal). Justificado por distinto público y distinto efecto en cámara.
- El popover debe disparar subset-fit explícito (ver ADR-0005) — los ejes no se mueven cámara por sí solos.

## Archivos afectados
- `src/components/toolbar/MyCatalogQuickFilters.tsx`
- `src/components/toolbar/use-my-catalog-popover-fit.ts`
- `src/domains/content/store/locations-store.ts` (campo `filters.visualState`)
- `src/domains/content/lib/my-catalog-quick-counts.ts`
