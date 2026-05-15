# CI Documental — reglas de PR

Toda PR que toque zonas estructurales DEBE actualizar la documentación normativa antes de mergear. Si no, la documentación divergirá del código en semanas.

## Triggers obligatorios

Una PR DEBE actualizar `docs/adr/` o `docs/contracts/` si:

| Cambio en código | Documentación obligatoria |
|---|---|
| Añade estado global (store, context, singleton) | Nuevo contrato o sección "Variables canónicas" en uno existente |
| Añade listener global (`window.addEventListener`, `map.on`, custom event bus) | Sección "Eventos canónicos" del contrato afectado + entrada en `docs/audits/duplicate-listeners-audit.md` |
| Modifica `src/components/map/subset-fit.ts` o su listener en `LocationMap.tsx` | Actualizar `subset-fit-contract.md` (Validation Notes + Invariantes) |
| Modifica popup lifecycle (`popupopen`/`popupclose`, `openPopupLocationId`, `focusedLocationId`) | Actualizar `popup-contract.md` y/o `focus-selection-contract.md` |
| Modifica ownership de filtros (matcher, axes, bucket stats, `getMyCatalogQuickCounts`) | Actualizar `filter-axis-contract.md` y `docs/audits/source-of-truth-audit.md` |
| Modifica `applyLayerVisibility`, zoom gates, `bypassZoomGates` | Actualizar `visibility-contract.md` |
| Modifica `useHeavyOpsStore` lifecycle | Actualizar `heavy-operations-contract.md` |
| Modifica owner identity allocator | Actualizar `marker-grammar-contract.md` |

## Triggers de backlog

Una PR DEBE actualizar `docs/audits/backlog.md` si:
- Resuelve un finding existente → cambiar `Status` a `resolved` y enlazar PR.
- Descubre nuevo finding → añadir entrada con `Status: open`.
- Acepta deuda consciente → `accepted-debt` + ADR de respaldo.

## Triggers de timeline

Una PR DEBE añadir entrada en `docs/architecture-timeline.md` si:
- Crea ADR nuevo.
- Cambia una invariante de cualquier contrato.

## Triggers de danger-zones

Una PR DEBE actualizar `docs/danger-zones.md` si:
- Introduce nueva regresión histórica en alguna zona listada.
- Añade nueva zona peligrosa (archivo monolítico, listener global, side-effect transversal).

## Validación (Phase 1 — manual)

No hay enforcement automático todavía. La revisión manual aplica esta checklist:
- Ver `docs/ci/pr-checklist.md`.
- Reviewer rechaza la PR si toca paths sensibles sin actualización documental.

## Validación (Phase 2 — futuro)

Workflow GitHub Actions a implementar:
- Detectar diff en paths sensibles (lista arriba).
- Exigir diff correspondiente en `docs/contracts/`, `docs/adr/`, `docs/audits/backlog.md` o `docs/architecture-timeline.md`.
- Marcar como `documentation-impact-required` si falta.

Tracked en backlog como mejora futura.

## Paths sensibles (lista canónica)

```text
src/components/LocationMap.tsx
src/components/map/subset-fit.ts
src/components/map/createCustomIcon.ts
src/components/markers/**
src/components/toolbar/MyCatalogQuickFilters.tsx
src/components/toolbar/use-my-catalog-popover-fit.ts
src/domains/content/store/locations-store.ts
src/domains/content/lib/location-owner.ts
src/domains/content/lib/point-visual-state.ts
src/shared/operations/heavy-operations-store.ts
src/lib/color/identity-allocator.ts
src/hooks/useLayerVisibility.ts
```

Cualquier touch a estos archivos activa los triggers correspondientes.
