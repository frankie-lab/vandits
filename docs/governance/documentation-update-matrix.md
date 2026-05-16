# Documentation Update Matrix

> Status: **ACTIVE — FOUNDATION**. Si cambia X, qué docs deben
> revisarse. Companion to
> [`./documentation-governance-policy.md`](./documentation-governance-policy.md)
> y [`../contracts/canon-change-policy.md`](../contracts/canon-change-policy.md).

---

## 1. Cómo leer esta matriz

Para cada **trigger de cambio** (columna izquierda):

- **Impacto mínimo**: qué docs hay que tocar sí o sí.
- **Docs obligadas**: lista de archivos/carpetas a revisar.
- **Tests afectados**: dominios de test a actualizar/correr.
- **Migration Impact Check**: si aplica `canon-change-policy.md`.

Si una fila aplica, **ninguna de sus columnas es opcional**.

## 2. Matriz

### 2.1 Popup canon (POI popups)

- **Impacto mínimo**: actualizar inventory + canon proposal/contract +
  primitives afectadas + QA.
- **Docs obligadas**:
  - `docs/popups/poi-popup-inventory.md`
  - `docs/popups/poi-popup-canon-proposal.md`
  - `docs/contracts/popup-contract.md`
  - `docs/interaction-primitives.md` (o `docs/primitives/*` cuando
    exista)
  - `docs/qa/e2e-camera-qa.md` (si toca persistencia/rebuild)
- **Tests**: E2E popups (open/close/persist), unit
  `buildPopupModel`, visual snapshots de header.
- **Migration Impact Check**: **SÍ**.

### 2.2 Marker grammar (palette, shape, identity, health rings)

- **Impacto mínimo**: actualizar canon de markers + primitives
  StatusSurface + popups (header lee del mismo helper).
- **Docs obligadas**:
  - `docs/markers/*` (cuando exista; hoy `mem://style/map/*`)
  - `docs/popups/poi-popup-canon-proposal.md` §1.5/§1.6
  - `docs/contracts/popup-contract.md`
  - `docs/interaction-primitives.md` (StatusSurface)
- **Tests**: visual snapshots de markers + popup header + E2E
  identidad cromática (owner identity).
- **Migration Impact Check**: **SÍ**.

### 2.3 Subset-fit / camera

- **Impacto mínimo**: contract de subset-fit + QA camera + cualquier
  consola que dispare `requestSubsetFit`.
- **Docs obligadas**:
  - `docs/visibility/subset-fit-contract.md` (cuando exista;
    hoy `mem://logic/map/subset-fit-contract`)
  - `docs/qa/e2e-camera-qa.md`
  - `docs/pilots/*` que dependan de cámara
- **Tests**: E2E camera, assertions de bounds/zoom clamp/cooldown.
- **Migration Impact Check**: **SÍ**.

### 2.4 Visibility contracts (zoom gates, is_approved, layer visibility)

- **Impacto mínimo**: canon de visibilidad + pipeline POI source +
  markers + QA.
- **Docs obligadas**:
  - `docs/visibility/*`
  - `docs/architecture/poi-source-pipeline.md` (cuando exista; hoy
    `mem://logic/poi/source-pipeline-canonical`)
  - `docs/markers/*`
  - `docs/qa/*` relacionados
- **Tests**: E2E filtros, zoom gates, owner filter.
- **Migration Impact Check**: **SÍ**.

### 2.5 Selector semantics (popovers, quick filters)

- **Impacto mínimo**: contract de selector + primitives
  ObservableAction/DismissibleSurface + QA.
- **Docs obligadas**:
  - `docs/contracts/selector-interaction-contract.md` (cuando exista;
    hoy `mem://ui/selector-interaction-contract`)
  - `docs/interaction-primitives.md`
  - `docs/qa/*` de selectors
- **Tests**: E2E selector (apply/re-apply/close/opId).
- **Migration Impact Check**: **SÍ**.

### 2.6 Replay / toggle contracts

- **Impacto mínimo**: contract + primitives + QA harness.
- **Docs obligadas**:
  - `docs/contracts/replay-contract.md` (cuando exista)
  - `docs/contracts/toggle-contract.md` (cuando exista)
  - `docs/interaction-primitives.md`
  - `docs/qa/*`
- **Tests**: E2E replay/toggle determinism.
- **Migration Impact Check**: **SÍ**.

### 2.7 QA contracts (assertion sistémica, harness)

- **Impacto mínimo**: QA contract + pilots dependientes.
- **Docs obligadas**:
  - `docs/qa/*`
  - `docs/pilots/*`
- **Tests**: ejecutar suite completa antes de promover.
- **Migration Impact Check**: **SÍ** si cambia assertion sistémica.

### 2.8 Primitives (nuevas o modificadas)

- **Impacto mínimo**: definición de primitive + contracts consumidores
  + audits que la usan.
- **Docs obligadas**:
  - `docs/primitives/<Primitive>.md` (o sección en
    `docs/interaction-primitives.md`)
  - `docs/contracts/*` que la consumen
  - `docs/audits/*` que la mencionan
- **Tests**: unit de la primitive + E2E de al menos un consumidor.
- **Migration Impact Check**: **SÍ** para cambios; nueva primitive
  requiere ADR.

### 2.9 Pipeline POI source / ownership

- **Impacto mínimo**: pipeline doc + markers + popups + filtros.
- **Docs obligadas**:
  - `docs/architecture/poi-source-pipeline.md`
  - `docs/markers/*`
  - `docs/popups/*`
  - `docs/visibility/*`
- **Tests**: E2E owner filter, source filter, shape por origen.
- **Migration Impact Check**: **SÍ**.

### 2.10 Geografía canónica / FK resolver

- **Impacto mínimo**: doc geografía + import + enrichment.
- **Docs obligadas**:
  - `docs/architecture/canonical-geo-tree.md` (cuando exista)
  - cualquier doc de import/enrichment que dependa
- **Tests**: unit FK resolver + E2E import.
- **Migration Impact Check**: **SÍ** si cambia el árbol canónico.

### 2.11 Pilots (cambio o cierre)

- **Impacto mínimo**: validation doc + contracts ratificados por el
  pilot.
- **Docs obligadas**:
  - `docs/pilots/<pilot>-validation.md`
  - contracts/primitives ratificados
- **Tests**: suite del pilot.
- **Migration Impact Check**: **SÍ** si el pilot ratifica canon.

## 3. Reglas transversales

- Si una fila aplica y no se actualizan **todas** sus docs obligadas,
  el PR se rechaza por **deuda documental** (ver
  `documentation-review-rules.md`).
- Si el cambio cae fuera de la matriz pero afecta canon, **aplicar
  igualmente** el principio y registrar la nueva fila en este doc en
  el mismo PR.
- Esta matriz es viva: cada vez que aparece un nuevo canon, se añade
  una fila.
