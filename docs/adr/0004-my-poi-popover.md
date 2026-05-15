# ADR-0004 — Popover "Mis POI"

## Problema
El usuario necesitaba acceso 1-click a su catálogo personal con desglose por estado y salud, sin abrir paneles laterales y sin contaminar FilterBar.

## Decisión
- Popover anclado al contador verde del FloatingToolbar.
- Dos secciones:
  1. **Estado del punto**: `visualState` (Ver todos / Enriquecidos / Sin actualizar / Vacíos)
  2. **Salud operativa**: `healthFilter` (Rellenar / Reparar / Revisar / Rotos)
- **Contrato de interacción del selector (sistémico)**:
  - Toda fila visible es 100% interactiva o 100% disabled. No existe estado intermedio "activa pero ignora click".
  - Click sobre fila interactiva SIEMPRE: cierra el popover, emite el evento del popover con un opId único, deja traza observable.
  - Re-click sobre la fila ya activa = reafirmación de intención (replay del fit/refocus). **Nunca silent noop.**
  - `setFilters` solo se invoca cuando la selección cambia realmente; el replay del recenter no muta el store.
  - Implementación: handler único `applyRow({ axis, value })` en `MyCatalogQuickFilters`. Prohibido ramificar comportamiento por valor (`empty`, `enriched`, …).
  - `heavy-operations.blockReentry` queda DESACTIVADO en este selector — un opId único por click garantiza que el re-click nunca colisione con una op viva. Si una operación tarda, debe verse como estado loading explícito, nunca como noop.
- Click fuera / Escape → cierra (Radix default).

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
