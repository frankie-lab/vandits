# Audit — Múltiples puntos de truth

## Patrón vigilado
El mismo concepto representado en >1 store/variable, con riesgo de divergencia.

## Hallazgos

### H1 — `openPopupLocationId` local vs store (DECISIÓN CONSCIENTE)
- Vive solo en `LocationMap` (useState). NO está en el store.
- Justificación: ciclo de vida 1:1 con instancia Leaflet.
- Riesgo: si otra parte del sistema necesita "saber" el popup abierto, debe propagarse vía prop o evento.
- **No promover al store** sin ADR.

### H2 — Owner del POI (`ownerUserId` vs `_docUserId`) (RESUELTO PARCIAL)
- Helper único: `getLocationOwnerUserId(loc) = ownerUserId ?? _docUserId`.
- `_docUserId` es FALLBACK legacy. NO usar como fuente preferente.
- Estado: revisado en PR-USER-FILTER-PIPELINE.

### H3 — `filteredLocations` vs `markerLocations` (CORRECTO)
- Distintos: `filteredLocations ⊇ markerLocations` (culling).
- Documentado en visibility-spec y memoria.
- **No fusionar** — el culling depende del viewport.

### H4 — Counts del popover Mis POI (PENDIENTE)
- En sesión reciente, `getMyCatalogQuickCounts` devolvía 0 para todas las filas.
- Posibles causas: `useMemo` no reactivo a la mutación de `filters`, o helper depende de datos no hidratados.
- **Acción**: investigar en próxima iteración. Bug abierto separado del fit.

### H5 — Identidad cromática persistida vs runtime (CORRECTO)
- DB: `user_owner_color_assignments`.
- Runtime: `getOwnerIdentityOklch(uid)` lee solo del store local hidratado.
- Sidebar **no inventa** OKLCH si no hay color cargado. Patrón correcto.

### H6 — Verde "enriched" en allocator vs en estado visual (POR DISEÑO)
- Allocator excluye verdes para identidad de followed (ancla enriched L=0.72/C=0.18/h=145).
- Estado `enriched` propio sigue siendo verde (forma círculo).
- Sin colisión semántica: forma indica origen, color indica estado o identidad según forma.

## Recomendaciones
- Auditoría periódica buscando `useState` que dupliquen un valor del store.
- Toda variable que aparece en >1 archivo debe tener su contrato documentado.
