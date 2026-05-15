# Audit — UI/Domain Coupling

## Patrón vigilado
Componentes UI que conocen detalles del dominio o de Leaflet directamente, en lugar de pasar por helpers/contratos.

## Hallazgos

### H1 — `LocationMap` conoce Leaflet directamente (POR DISEÑO)
- Es el ÚNICO componente que importa `leaflet`.
- Cualquier otro componente que necesite mover cámara debe ir vía `requestSubsetFit`.
- Cualquier otro componente que necesite saber popups debe vía propiedades expuestas (no las hay hoy — ver `popup-contract`).

### H2 — Renderer dentro de `createCustomIcon` (CORRECTO)
- Función pura: lee `MarkerGrammar`. No conoce store.
- ANTI-PATRÓN si alguien añade `useStore` dentro de `createCustomIcon`.

### H3 — Popovers escriben en store directamente (CORRECTO)
- `MyCatalogQuickFilters` llama a `setFilters` y `setOwnershipFilter`.
- Justificado: son UI de dominio (filtros).
- Patrón replicable para nuevos popovers.

### H4 — `FilterBar` y `MyCatalogQuickFilters` comparten store pero no UX (CORRECTO)
- ADR-0007 separa responsabilidades.
- Cualquier nueva consola de filtros debe declarar:
  1. Qué eje toca.
  2. Si mueve cámara (declarando `mode` y `reason`).
  3. Si fuerza `ownershipFilter` específico.

### H5 — UI consume tipos de dominio (`GeoLocation`) (ACEPTABLE)
- TypeScript fuerza que UI conozca la forma de los datos.
- Mitigación: usar selectors/helpers (`getPointVisualState`, `getPointHealthRings`, `getLocationOwnerUserId`) en lugar de leer campos directamente.
- Anti-patrón: leer `loc.enriched_data?.descripcion` desde UI. Usar `isPointEnriched(loc)`.

### H6 — Side-effects distribuidos al cambiar filtros
- Hoy: `setFilters` desencadena re-cálculo del matcher (correcto). Algunos hooks (`use-health-filter-fit`, `use-my-catalog-popover-fit`) además mueven cámara.
- Riesgo: si más hooks se enganchan a `filters`, podrían competir.
- **Regla**: ningún hook nuevo debe mover cámara reaccionando a `filters` salvo que se documente en `filter-axis-contract` y se añada caller en `subset-fit-contract`.

## Recomendaciones
- Toda lectura desde UI de un campo del dominio debe pasar por helper.
- Toda escritura debe pasar por setter del store.
- Toda interacción con la cámara debe pasar por `requestSubsetFit`.
- Toda operación pesada con feedback debe pasar por `useHeavyOpsStore`.
