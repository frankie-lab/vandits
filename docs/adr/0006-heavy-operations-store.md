# ADR-0006 — `HeavyOperationStore`

## Problema
Operaciones pesadas en cliente (filtros, fits, render) carecían de un canal único de feedback. Cada feature inventaba su spinner / toast / badge, con riesgo de operaciones colgadas y doble click.

## Decisión
Introducir `useHeavyOpsStore` (zustand) con API mínima:
- `startOperation` (con `blockReentry` opcional y `safetyTimeoutMs` watchdog)
- `markRunning`, `setProgress`
- `finishOperation`, `failOperation`
- Auto-purga: done 1.5s, error 4s.

`HeavyOpSource` enumera dominios pero solo `filter` (popover Mis POI) está cableado en Phase 1. `enrichment/import/geocoding` mantienen sus lanes existentes hasta migrarse.

## Consecuencias
- Badge único en bottom progress lane consume `useActiveHeavyOperations`.
- Garantía de que toda op tiene watchdog (10s para `filter`/`subset-fit`, 15s para `render`).
- ETA NUNCA inferida; solo expuesta si el caller la provee vía `setProgress`.

## Tradeoffs
- Doble verdad temporal: el store nuevo coexiste con lanes legacy de enrichment/import.
- `'Filtro aplicado'` significa "lanzado", no "fit confirmado". Sin telemetría real del fin del fit.

## Archivos afectados
- `src/shared/operations/heavy-operations-store.ts`
- `src/shared/operations/use-heavy-operation.ts`
- `src/shared/progress/OperationsLane.tsx`
- `src/components/toolbar/MyCatalogQuickFilters.tsx`
- `src/components/toolbar/use-my-catalog-popover-fit.ts`
