# Release Versioning Audit — post-v1.3.19 window

Reference closure: `docs/audits/post-v1-3-19-functional-closure.md`
Policy: `docs/contracts/release-versioning-policy.md`

## Method

Each of the 7 blocks listed in the functional closure is re-evaluated against
the policy §3. The previous "release impact = no" annotation in the closure
document is **not accepted as-is**; it is re-derived here from
`user_visible` and `contract_change`.

## Block-by-block evaluation

### 1. PR-COUNTS-1 — Top bar ⇄ FilterBar counter unification

- `user_visible` = **yes** (counter value visibly changed: 5.100 → 5.095 was
  the symptom; reconciliation is observable in the running app).
- `contract_change` = no (single helper `getBucketStats`, no public signature
  change).
- `version_history_required` = **yes** — users see a corrected counter.
- `bump_required` = **yes**.
- `recommended_bump` = **patch** (bugfix-class correction of an already
  shipped surface).
- Motivo: la corrección altera lo que el usuario lee en la UI; debe figurar
  en notas de release como fix.

### 2. PR-COUNTS-2 — Subtabs "Mantener" alignment

- `user_visible` = **yes** (counts en subtabs Mantener cambian, header/CTA/
  tree/footer ahora coinciden).
- `contract_change` = no.
- `version_history_required` = **yes**.
- `bump_required` = **yes**.
- `recommended_bump` = **patch**.
- Motivo: bugfix de consistencia de counts entre superficies; visible al
  tester.

### 3. Árbol unificado Buscar y Filtrar

- `user_visible` = **yes** (Con deuda y Sin enriquecer ahora exponen Geo /
  Tipo / Tags / Legacy, ejes que antes no estaban).
- `contract_change` = no (no nueva capability, no nuevo evento global).
- `version_history_required` = **yes**.
- `bump_required` = **yes**.
- `recommended_bump` = **minor** — añade ejes de filtrado nuevos a dos
  subtabs; es feature visible, no bugfix.
- Motivo: capacidad de filtrado nueva en superficies operativas.

### 4. Footer contextual (Acción efectiva)

- `user_visible` = **yes** (un solo CTA primario por modo + menú "Más
  acciones"; antes había varios CTA por modo).
- `contract_change` = no (eventos internos, sin schema).
- `version_history_required` = **yes**.
- `bump_required` = **yes**.
- `recommended_bump` = **minor** — rediseño de patrón de acción del panel
  Discovery; es cambio de UX no trivial.
- Motivo: nuevo patrón de footer aplicado de forma transversal.

### 5. Root Status A/B/C/D

- `user_visible` = **yes** (fila compacta A/B/C/D nueva en Mantener;
  Resolver deuda queda gated por la clase D).
- `contract_change` = **yes** — nuevo helper canónico
  `poi-identity-root-status` con espejo Deno + contract test
  (`poi-identity-root-status-client-parity`). Helper público para futuros
  consumidores.
- `version_history_required` = **yes**.
- `bump_required` = **yes**.
- `recommended_bump` = **minor** — feature nueva + contrato nuevo.
- Motivo: introduce taxonomía A/B/C/D como contrato persistente.

### 6. Resolver deuda — wiring, modal y triage

- `user_visible` = **yes** (botón que antes no abría modal ahora abre; modal
  rediseñado a triage operativo por 5 grupos; spinner/progreso visibles).
- `contract_change` = no (sigue usando `enqueue_health_repair` con la misma
  firma; sólo el set de ids enviado se restringe a D ∩ {partial, chain}).
- `version_history_required` = **yes** — corrección de bug + rediseño de
  modal son perceptibles.
- `bump_required` = **yes**.
- `recommended_bump` = **minor** — el bug-fix de wiring es patch, pero el
  triage por grupos es feature nueva; el agregado del bloque es minor.
- Motivo: rediseño de UX de Resolver deuda + fix del botón.

### 7. PR-EXPORT-2 — referencia previa

- `user_visible` = n/a en esta ventana (ya consumido por v1.3.19).
- `contract_change` = n/a en esta ventana.
- `version_history_required` = **no** (ya figura en notas de v1.3.19).
- `bump_required` = **no** en esta ventana.
- `recommended_bump` = **none**.
- Motivo: bloque cerrado en release previa, sólo referenciado como base.

## Tabla agregada

| # | Bloque | user_visible | contract_change | version_history_required | bump_required | recommended_bump |
|---|---|---|---|---|---|---|
| 1 | PR-COUNTS-1 | yes | no | yes | yes | patch |
| 2 | PR-COUNTS-2 | yes | no | yes | yes | patch |
| 3 | Árbol unificado | yes | no | yes | yes | minor |
| 4 | Footer contextual | yes | no | yes | yes | minor |
| 5 | Root Status A/B/C/D | yes | yes | yes | yes | minor |
| 6 | Resolver deuda (wiring + triage) | yes | no | yes | yes | minor |
| 7 | PR-EXPORT-2 | n/a (prev release) | n/a | no | no | none |

## Discrepancia con el cierre administrativo

El documento `docs/audits/post-v1-3-19-functional-closure.md` marca
`release impact = no` en los 7 bloques. Esta auditoría **rechaza** esa
anotación para los bloques 1–6:

- 6 de 7 bloques son `user_visible = yes` y por tanto requieren entrada en
  version-history y bump.
- 1 bloque (PR-EXPORT-2) sí mantiene `release impact = no` en esta ventana
  por estar consumido en la release previa.

El cierre administrativo debe leerse como cierre **funcional** (los bloques
están implementados y aceptados), no como dispensa de versionado.

## Release notes requeridas (mínimo)

Para `v1.3.20` deben aparecer entradas para:

- Fix: counter unificado top bar ⇄ FilterBar (5.100/5.095) — PR-COUNTS-1.
- Fix: counts consistentes en subtabs Mantener — PR-COUNTS-2.
- Feature: ejes Geo / Tipo / Tags / Legacy en Con deuda y Sin enriquecer.
- Feature: footer contextual con CTA principal único + "Más acciones".
- Feature: fila compacta A/B/C/D en Mantener + gating de Resolver deuda.
- Feature/Fix: Resolver deuda — wiring del botón + modal de triage por grupos.

PR-EXPORT-2 no se relista.

## Decisión de versión

Agregación por la regla §4 (`max(patch, patch, minor, minor, minor, minor,
none)`):

`recommended_release_bump = minor`

Línea actual: `v1.3.19`. Próxima release:

**`v1.4.0`** (NO `v1.3.20`).

Justificación: hay al menos un bloque `minor` en la ventana (de hecho
cuatro), por lo que un bump `patch` (`v1.3.20`) violaría la política §2.
La propuesta original `v1.3.20` queda **rechazada** explícitamente por esta
auditoría.

## Decisión final

`DECISIÓN: APROBADO` — política, template y auditoría existen; los 7 bloques
están revisados; cada uno declara `version_history_required`,
`bump_required`, `recommended_bump` y motivo; la auditoría declara que 6 de
7 bloques requieren release notes; y decide explícitamente la versión
siguiente como **`v1.4.0`** (rechazando `v1.3.20`).

No se ejecuta bump en este paso, conforme a la restricción del encargo.
