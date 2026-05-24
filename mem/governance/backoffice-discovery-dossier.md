---
name: BackOffice discovery dossier (PR-BACKOFFICE-DISCOVERY-DOSSIER-1)
description: Modelo sistémico definitivo del BackOffice (19 secciones, 23 surfaces, 7 familias) basado en evidencia trazable; recomendaciones diagnósticas que NO autorizan cambios.
type: reference
---
Dossier maestro en repo: `docs/audits/backoffice-discovery-dossier.md`.
Diagramas canónicos: `docs/audits/diagrams/backoffice-{family-system,ownership-map,dependency-graph,navigation-graph,lifecycle,causality-cascades}.mmd`.

Regla canon derivada del dossier:
> Toda surface nueva del BackOffice debe declarar `family`, `ownership_domain`, `runtime_semantics` e `interaction_type`, y registrar bloque de evidencia (file/route/component/capability/imports/reads/writes/source_of_truth) en el dossier ANTES de diseñar layout. Vocabulario permitido para campos sin evidencia: `unknown` | `inferred:<motivo>`. **`TBD` prohibido.**

Recomendaciones admitidas (diagnóstico, no autorización): `KEEP | SPLIT | DOWNGRADE | MOVE | REMOVE | DEBUG_ONLY | MERGE | NEEDS_DECISION`.

Surfaces inventariadas (23 = 12 tabs + 8 chrome + 3 confirms). Si emerge una nueva, añadir con `discovered_during_audit: true`.

Anclajes cruzados: `mem://governance/rbac-canon`, `mem://governance/backoffice-ux-closure`, `mem://logic/operations/heavy-operations-feedback`, `mem://admin/data-sources-panel`, `mem://admin/geo-maintenance-panel`, `mem://ui/panel-system`.
