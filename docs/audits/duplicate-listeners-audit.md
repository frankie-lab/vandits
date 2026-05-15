# Audit — Duplicate Listeners

## Patrón vigilado
Múltiples listeners para el mismo evento global, o listeners no limpiados en `useEffect` cleanup.

## Hallazgos

### H1 — `popupclose` per-marker (RESUELTO)
Eliminado en ADR-0001. Único `map.on('popupclose')` en init.

### H2 — `subset-fit-bounds-request` (CORRECTO)
- Único listener en `LocationMap.tsx` (~2484).
- Cleanup correcto en return del `useEffect`.
- Cualquier intento de añadir un segundo listener desde fuera del mapa rompe el contrato.

### H3 — `lovable:owner-identity-updated` (DOS listeners — JUSTIFICADO)
- Uno en `LocationMap` (repintado de markers).
- Otro en `UsersSidebar` (refresh de badge).
- Justificado por separación de responsabilidades.

### H4 — `lovable:my-catalog-popover-applied` (CORRECTO)
- Único listener en `use-my-catalog-popover-fit` montado UNA vez en `FloatingToolbar`.
- Riesgo: si `FloatingToolbar` se montase dos veces (no debería), habría dos handlers.

### H5 — `COLLECTION_VISIBILITY_EVENT` y `COLLECTION_FIT_BOUNDS_EVENT` (CORRECTO)
- Listeners únicos en `LocationMap` con cleanup correcto.

### H6 — Map gestures (`movestart`/`zoomstart`/`dragstart`) (CORRECTO)
- Registrados en `useEffect` del subset-fit listener con cleanup correcto.

## Recomendaciones
- Test de inspección: contar handlers de `subset-fit-bounds-request` tras navegar entre vistas.
- En reviews, exigir cleanup explícito en cualquier nuevo `addEventListener`.
