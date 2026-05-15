# ADR-0004 — Popover "Mis POI"

## Problema
El usuario necesitaba acceso 1-click a su catálogo personal con desglose por estado y salud, sin abrir paneles laterales y sin contaminar FilterBar.

## Decisión
- Popover anclado al contador verde del FloatingToolbar.
- Dos secciones:
  1. **Estado del punto**: `visualState` (Ver todos / Enriquecidos / Sin actualizar / Vacíos)
  2. **Salud operativa**: `healthFilter` (Rellenar / Reparar / Revisar / Rotos)
- Reglas de cierre:
  - `healthFilter` → cierra (mueve cámara)
  - `visualState` → permanece abierto (no debe distraer del comparativo)
  - "Ver todos" → permanece abierto
  - Click fuera / Escape → cierra (Radix default)

## Consecuencias
- Punto único de acción rápida sobre catálogo propio.
- Coexistencia limpia con FilterBar global.
- Empty-result feedback inline (`MY_CATALOG_POPOVER_EMPTY_EVENT`).

## Tradeoffs
- Counts pueden quedar desincronizados si `getMyCatalogQuickCounts` no reacciona a una mutación (vigilado en auditoría source-of-truth).
- Acoplamiento ligero con `useHeavyOpsStore` (justificado por feedback usuario).

## Archivos afectados
- `src/components/toolbar/MyCatalogQuickFilters.tsx`
- `src/components/toolbar/use-my-catalog-popover-fit.ts`
- `src/components/FloatingToolbar.tsx`
