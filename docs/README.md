# Vandits — Documentación arquitectónica viva

Esta carpeta congela contratos, ownerships y decisiones reales del sistema.
No es documentación generativa de componentes: es la fuente normativa.

## Cómo leer esta documentación

Cada documento distingue cuatro niveles:

| Nivel | Significado |
|---|---|
| **Contrato canónico** | Lo que el sistema DEBE hacer. Inmutable salvo ADR. |
| **Implementación actual** | Lo que el código hace hoy. Puede coincidir o no con el contrato. |
| **Workaround temporal** | Solución conocida-imperfecta, marcada para sustitución. |
| **Deuda técnica** | Divergencia conocida sin plan de resolución todavía. |
| **Legacy** | Comportamiento heredado mantenido por compatibilidad. |

Si un código viola un contrato y no hay ADR que lo justifique, **el código está mal**, no el contrato.

## Estructura

```text
docs/
  contracts/   normas inmutables por subsistema
  adr/         decisiones arquitectónicas cronológicas
  flows/       diagramas Mermaid de flujos canónicos
  glossary/    vocabulario congelado
  specs/       specs consolidadas (visibilidad, markers, audit global)
  audits/      hallazgos detectados sobre el código real
```

## Contratos

| Contrato | Subsistema | Source of truth |
|---|---|---|
| [popup-contract](contracts/popup-contract.md) | Popups Leaflet | `LocationMap.openPopupLocationId` (local) + `map.on('popupclose')` |
| [focus-selection-contract](contracts/focus-selection-contract.md) | Focus / selección múltiple | `locations-store.focusedLocationId` + `selectedLocations: Set<string>` |
| [filter-axis-contract](contracts/filter-axis-contract.md) | Ejes de filtro | `locations-store.filters` |
| [subset-fit-contract](contracts/subset-fit-contract.md) | Encuadre de subconjuntos | evento `subset-fit-bounds-request` + listener único en `LocationMap` |
| [marker-grammar-contract](contracts/marker-grammar-contract.md) | Forma/color/anillos de POI | `resolveMarkerGrammar` → `createCustomIcon` |
| [visibility-contract](contracts/visibility-contract.md) | Visibilidad por capa | `applyLayerVisibility` + `resolveLayerGroupKey` |
| [heavy-operations-contract](contracts/heavy-operations-contract.md) | Feedback de operaciones | `useHeavyOpsStore` |

## ADRs

1. [Centralización de popupclose](adr/0001-popupclose-centralization.md)
2. [Separación visibilidad vs gramática](adr/0002-visibility-vs-grammar-separation.md)
3. [visualState reactivado como eje operativo](adr/0003-visualstate-as-operational-axis.md)
4. [Popover "Mis POI"](adr/0004-my-poi-popover.md)
5. [subset-fit explícito mode='always'](adr/0005-subset-fit-explicit-always.md)
6. [HeavyOperationStore](adr/0006-heavy-operations-store.md)
7. [Separación FilterBar vs popover](adr/0007-filterbar-vs-popover-separation.md)

## Flujos

- [popup-open-close-flow](flows/popup-open-close-flow.mmd)
- [focus-selection-flow](flows/focus-selection-flow.mmd)
- [subset-fit-flow](flows/subset-fit-flow.mmd)
- [heavy-operations-flow](flows/heavy-operations-flow.mmd)
- [filter-application-flow](flows/filter-application-flow.mmd)

## Glosario y specs

- [Glosario del sistema](glossary/system-glossary.md)
- [Visibility spec](specs/visibility-spec.md)
- [Marker system reference](specs/marker-system-reference.md)
- [Architecture audit](specs/architecture-audit.md)

## Sistema verificable

Cada contrato tiene una sección **Invariantes** (normativas, no descriptivas) y los 4 críticos (popup, focus-selection, subset-fit, heavy-operations) tienen además **Validation Notes** con archivo, símbolo y evidencia contra el código real. Estados posibles: `validated`, `mismatch`, `not found`, `unclear`. No se aceptan frases genéricas.

- [Backlog técnico (audits)](audits/backlog.md)
- [Architecture timeline](architecture-timeline.md)
- [Danger zones](danger-zones.md)
- [Reglas CI documentales](ci/documentation-rules.md)
- [PR Impact Matrix](ci/pr-impact-matrix.md) — puerta de control: paths sensibles → contratos obligatorios
- [PR checklist](ci/pr-checklist.md)
- [Camera / subset-fit stabilization plan](architecture/camera-subset-fit-stabilization-plan.md) — Tier 1-A: pipeline canónico + plan gradual de convergencia (5 fases, doc-only)

## Auditorías activas

- [stale-closures](audits/stale-closures-audit.md)
- [duplicate-listeners](audits/duplicate-listeners-audit.md)
- [source-of-truth](audits/source-of-truth-audit.md)
- [global-guards](audits/global-guards-audit.md)
- [ui-domain-coupling](audits/ui-domain-coupling-audit.md)
- [hardcoded-behaviors](audits/hardcoded-behaviors-audit.md)
- [uniformity](audits/uniformity-audit.md)

Inventarios exhaustivos (segunda pasada, una fila por ocurrencia + sección High-risk al final):

- [event-bus-inventory](audits/event-bus-inventory.md)
- [hardcode-inventory](audits/hardcode-inventory.md)
- [ownership-resolution-inventory](audits/ownership-resolution-inventory.md)
- [constants-thresholds-inventory](audits/constants-thresholds-inventory.md)

Priorización estratégica (síntesis sobre los inventarios):

- [structural-risk-priority](audits/structural-risk-priority.md) — Tiers T1–T4 con estrategia (freeze/unify/deprecate/isolate) por finding.

Cada finding numerado en estos audits está mapeado a un `BL-xxx` en el [backlog](audits/backlog.md).

## Mapa de dependencias entre contratos

Ver [`dependency-map.md`](dependency-map.md).
