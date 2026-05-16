# Documentation Taxonomy

> Status: **ACTIVE — FOUNDATION**. Estructura canónica de `docs/`.
> Companion to [`./documentation-governance-policy.md`](./documentation-governance-policy.md).

---

## 1. Estructura canónica

```
docs/
  adr/             # Architecture Decision Records (ratified)
  architecture/    # Domain maps, pipelines, cross-domain contracts
  audits/          # Transversal reviews of existing surface
  contracts/       # Canonical contracts (interaction, popup, canon-change…)
  governance/      # This system: policy, taxonomy, lifecycle, matrix, review
  glossary/        # Shared vocabulary (terms, acronyms, domain language)
  markers/         # Marker grammar, palette, shape, identity
  migrations/      # Migration plans + Migration Impact Checks archived
  pilots/          # Pilot specs + validation reports
  popups/          # Popup inventories, canon proposals, contracts
  primitives/      # Interaction primitives (ContextualSurface, ObservableAction…)
  qa/              # QA contracts, E2E specs notes, harness rules
  visibility/      # Visibility/filtering/subset-fit canon
```

> Las carpetas no marcadas existentes hoy (`adr/`, `contracts/`,
> `popups/`, `qa/`, `pilots/` si aplica) se mantienen. Las nuevas
> (`architecture/`, `markers/`, `migrations/`, `primitives/`,
> `visibility/`, `audits/`, `glossary/`) se crean **on-demand** cuando
> reciben su primer doc — no se crean placeholders vacíos.

## 2. Por carpeta

### `docs/adr/`
- **Propósito**: decisiones arquitectónicas ratificadas, irreversibles.
- **Owner esperado**: tech lead del dominio afectado.
- **Ejemplos**: `001-manageable-unit.md`, `003-panel-system.md`.
- **Lifecycle**: `draft → ratified → superseded` (nunca `deprecated`
  silencioso; superseder explícito con link).
- **Relaciones**: ratifica contracts, cierra canon proposals, ancla
  Migration Impact Checks.

### `docs/architecture/`
- **Propósito**: mapas de dominios, pipelines canónicos, diagramas
  cross-domain.
- **Owner**: architecture WG / tech lead transversal.
- **Ejemplos**: domain map de Identity/Content/Privacy/Social
  Graph/Routes/Discovery; pipeline POI source canónico.
- **Lifecycle**: `active`, actualizado a cada cambio estructural.
- **Relaciones**: referenciado por ADRs, contracts, audits.

### `docs/audits/`
- **Propósito**: discovery transversal de superficie existente
  (read-only, sin implementación).
- **Owner**: autor del audit + reviewer asignado.
- **Ejemplos**: popup inventory (vive hoy en `popups/`; futuras
  auditorías de selectors, markers, panels van aquí).
- **Lifecycle**: `draft → active → superseded` cuando se aplica la
  migración derivada.
- **Relaciones**: alimenta canon proposals + Migration Impact Checks.

### `docs/contracts/`
- **Propósito**: contratos canónicos de interacción, primitives,
  semánticas globales.
- **Owner**: owner del canon (ej. canon-change-policy → architecture WG).
- **Ejemplos**: `popup-contract.md`, `canon-change-policy.md`.
- **Lifecycle**: `active → superseded` con ADR.
- **Relaciones**: referenciado por primitives, QA, pilots.

### `docs/governance/`
- **Propósito**: meta-sistema documental.
- **Owner**: architecture WG.
- **Ejemplos**: este archivo + policy + lifecycle + matrix + review.
- **Lifecycle**: `active`, raramente `superseded`.
- **Relaciones**: aplicable a todas las carpetas.

### `docs/glossary/`
- **Propósito**: vocabulario compartido, evita ambigüedad
  (ej. "POI", "marker", "popup", "canon", "primitive", "owner",
  "followed", "subset-fit").
- **Owner**: architecture WG.
- **Lifecycle**: `active`, append-only salvo correcciones.
- **Relaciones**: referenciado por cualquier doc.

### `docs/markers/`
- **Propósito**: marker grammar, palette, shape, identity, health rings.
- **Owner**: map/UX lead.
- **Ejemplos**: `marker-palette.md`, `health-rings.md`,
  `marker-shape-by-origin.md`.
- **Lifecycle**: `active`. Cambios requieren canon proposal + ADR.
- **Relaciones**: contracts, primitives (StatusSurface), QA visuales.

### `docs/migrations/`
- **Propósito**: planes de migración + Migration Impact Checks
  archivados.
- **Owner**: autor de la migración.
- **Ejemplos**: `MIC-popup-canon-v2.md`, `MIG-poi-source-pipeline.md`.
- **Lifecycle**: `draft → active → completed` (no se borran).
- **Relaciones**: vinculado a ADR + contracts afectados.

### `docs/pilots/`
- **Propósito**: pilots de validación (Pilot 1, Pilot 2, …) y sus
  reportes.
- **Owner**: autor del pilot.
- **Ejemplos**: `interaction-pilot-1-validation.md`.
- **Lifecycle**: `draft → active → ratified` (validation closed) →
  `archived`.
- **Relaciones**: contracts, primitives, QA.

### `docs/popups/`
- **Propósito**: inventory + canon proposals + contracts específicos
  de popups POI.
- **Owner**: map/UX lead.
- **Ejemplos**: `poi-popup-inventory.md`, `poi-popup-canon-proposal.md`.
- **Lifecycle**: inventory `active` mientras refleje código; canon
  proposal `draft → ratified` (→ ADR).
- **Relaciones**: primitives, contracts, QA, pilots.

### `docs/primitives/`
- **Propósito**: definición canónica de interaction primitives.
- **Owner**: architecture WG.
- **Ejemplos**: `ContextualSurface.md`, `ObservableAction.md`,
  `StatusSurface.md`, `FocusEmitter.md`, `DismissibleSurface.md`,
  `BlockingOperation.md`. Hoy agrupados en
  `docs/interaction-primitives.md`; futura disgregación va aquí.
- **Lifecycle**: `active`. Cambios = canon → ADR.
- **Relaciones**: contracts, popups, markers, QA.

### `docs/qa/`
- **Propósito**: QA contracts, reglas de harness E2E, contratos de
  assertion sistémica.
- **Owner**: QA/E2E lead.
- **Ejemplos**: `e2e-camera-qa.md`.
- **Lifecycle**: `active`. Cambio de assertion sistémica = canon → ADR.
- **Relaciones**: contracts, pilots, primitives.

### `docs/visibility/`
- **Propósito**: canon de visibilidad/filtrado/subset-fit/zoom gates.
- **Owner**: map lead.
- **Ejemplos**: `subset-fit-contract.md`, `visibility-rule.md`,
  `zoom-gates.md`. Hoy disperso entre `mem://` y `contracts/`;
  consolidación pendiente.
- **Lifecycle**: `active`. Cambio = canon → ADR.
- **Relaciones**: markers, popups, QA, pilots.

## 3. Reglas de ubicación

- Un doc vive en **una** carpeta. Si pertenece a dos dominios, vive en
  el más específico y se enlaza desde el otro.
- Nombres en `kebab-case.md`.
- Prefijos numéricos sólo en `adr/` y `migrations/`.
- Suffix `-inventory`, `-proposal`, `-contract`, `-validation` cuando
  aplique (el nombre comunica el tipo).
