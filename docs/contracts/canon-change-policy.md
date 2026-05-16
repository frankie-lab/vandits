# Canon Change Policy

> **Política sistémica del proyecto.** Ningún canon global puede modificarse
> sin actualizar documentación, evaluar impacto, decidir migración y
> registrar tests necesarios. Toda propuesta de cambio de canon DEBE incluir
> un **Migration Impact Check** completo (plantilla más abajo).

---

## 1. Qué cuenta como "canon"

Un cambio se considera **cambio de canon** cuando toca cualquiera de las
siguientes superficies globales del sistema:

- **Interaction contracts** — reglas de interacción documentadas en
  `docs/contracts/*` y `docs/interaction-*`.
- **UI primitives** — `Selectable`, `RecenterableSelection`,
  `ToggleableSelection`, `OverlaySurface`, `ContextualSurface`,
  `StatusSurface`, `FocusEmitter`, `BlockingOperation`,
  `DismissibleSurface`, `StatefulSelection`, `ObservableAction`
  (ver `docs/interaction-primitives.md`).
- **Visual grammar** — `MarkerGrammar`, gramática POI por origen,
  paleta de estados, identidad cromática del owner, render canon
  por zoom.
- **Marker states** — los tres estados `enriched | imported | empty`
  decididos por `getPointVisualState(loc)`, health rings v2, collection
  tints, owner identity triangle.
- **Popup states** — `popup-contract`, persist-on-rebuild, inline
  context (`UnenrichedRecoveryBlock` + `<NearbyPanel variant="inline">`),
  popup matrix rule.
- **Health states** — `partial | chain | review | hardError`, health
  filter axis, repair → GeocodingLane wiring.
- **Subset-fit behavior** — `requestSubsetFit`, listener único en
  `LocationMap`, cooldowns, reasons canónicas, zoom gates bypass.
- **QA contracts** — fixture E2E sandbox, harness Playwright,
  `window.__cameraFitTrace`, contratos observables de tests.
- **Selector semantics** — `applyRow`, opId único, `count===0 &&
  !active ⇒ disabled`, prohibición de silent noop.
- **Disabled / replay / toggle / focus rules** — invariantes de §1.2a
  y §1.2b en `interaction-primitives.md`, focus selection contract,
  filter axis contract.

Si dudas si tu cambio es "de canon": probablemente lo es. Aplica la
política.

---

## 2. Regla obligatoria

Ningún canon global de los listados arriba puede modificarse sin:

1. **Actualizar documentación** — contrato y/o ADR correspondiente
   reflejan la regla nueva antes del merge.
2. **Evaluar impacto** — Migration Impact Check (§3) completo en la PR.
3. **Decidir migración** — explícita: ahora, por fases, o deuda
   aceptada con ADR.
4. **Registrar tests necesarios** — los tests que protegen la
   invariante nueva existen o están agendados como deuda explícita.

Una PR que toque canon sin Impact Check es **bloqueante en review** y
debe devolverse hasta cumplir la política.

---

## 3. Plantilla — Migration Impact Check

Copiar y rellenar todos los campos en la descripción de la PR (o en un
ADR adjunto si el cambio es suficientemente grande).

```markdown
## Migration Impact Check

1. **Canon/contrato afectado**:
   <p.ej. "Selector interaction contract" / "Subset-fit behavior" /
   "Marker grammar — followed POI">

2. **Regla anterior**:
   <una frase con la invariante previa, citando contrato/ADR origen>

3. **Regla nueva**:
   <una frase con la invariante nueva>

4. **Motivo del cambio**:
   <por qué la regla anterior es insuficiente o incorrecta; evidencia>

5. **Componentes afectados**:
   <lista de componentes React / módulos del producto>

6. **Hooks/helpers afectados**:
   <lista de hooks, helpers, stores, reducers>

7. **Tests afectados**:
   <lista de tests unit/integration/E2E que cambian o se añaden>

8. **Docs afectadas**:
   <lista de archivos en docs/** que se actualizan en esta PR>

9. **Migración requerida**:
   <inmediata / por fases / no aplica; describir pasos>

10. **Riesgo si no se migra**:
    <qué se rompe, qué queda inconsistente, qué deuda introduce>

11. **Plan de rollout**:
    <flag, pilot, big-bang; qué orden; qué métrica valida cada paso>

12. **Criterio de aceptación**:
    <cómo se verifica que la regla nueva está vigente y la antigua no
    sobrevive en el código>

13. **Deuda explícita fuera de scope**:
    <call sites, surfaces o tests que NO se migran en esta PR; ADR/
    backlog entry que los rastrea>
```

---

## 4. Trigger checklist

Marca la casilla en la PR si tu cambio toca alguna de estas zonas. Si
hay ≥1 marcada, el Migration Impact Check es **obligatorio**.

- [ ] Edita un archivo en `docs/contracts/**`.
- [ ] Edita `docs/interaction-primitives.md` o
      `docs/interaction-pilot-*`.
- [ ] Modifica `src/shared/interaction/**`,
      `src/components/map/subset-fit.ts`, o el listener de cámara en
      `LocationMap`.
- [ ] Modifica la firma o invariantes de helpers únicos:
      `getPointVisualState`, `isPointEnriched`, `createCustomIcon`,
      `getPointHealthRings`, `getBucketStats`,
      `isLocationVisibleInGlobalMap`, `getLocationOwnerUserId`,
      `requestSubsetFit`, `applyLayerVisibility`, `resolvePoiSource`,
      `resolveMarkerGrammar`, `resolveLayerGroupKey`.
- [ ] Cambia estados/transiciones de marker, popup, health o filter
      axis.
- [ ] Cambia reglas de `Selectable` / `RecenterableSelection` /
      `ToggleableSelection` o introduce un nuevo primitive.
- [ ] Cambia QA contracts (Playwright projects, fixture E2E,
      `window.__cameraFitTrace`, `storageState`).
- [ ] Modifica `mem://` Core rules.

---

## 5. Enforcement

- **Reviewers**: deben rechazar la PR si toca canon y no incluye el
  Impact Check. No se permite "lo añado después".
- **Authors**: la responsabilidad es del autor; el reviewer sólo
  valida.
- **CI**: la PR checklist (`docs/ci/pr-checklist.md`) referenciará
  esta política en una iteración futura — hasta entonces, enforcement
  es manual en review.
- **Memorias**: si el cambio modifica una Core rule del índice de
  memoria, la actualización del índice forma parte del Impact Check
  (campo "Docs afectadas").

---

## 6. Relación con ADRs

- Un cambio de canon **ratificado** y estable se promueve a **ADR**
  (`docs/adr/NNNN-*.md`). El ADR captura la decisión final.
- El **Migration Impact Check** vive en la descripción de la PR que
  introduce el cambio, y/o se enlaza desde el ADR como evidencia del
  análisis de impacto.
- Cuando un ADR supersede a otro, el Impact Check de la PR debe
  identificar el ADR anterior en el campo "Regla anterior" y citar el
  ADR nuevo en "Docs afectadas".
- Pilot programs (ver `docs/interaction-pilot-1-validation.md`) NO
  son ADRs: son evidencia. La promoción de un pilot a canon estable
  dispara un Impact Check + ADR nuevo.

---

## 7. Excepciones

No hay excepciones por urgencia, hotfix ni "cambio pequeño". Si el
cambio toca canon, aplica la política. Si la urgencia exige merge
inmediato, el Impact Check puede ser **minimal** (campos 1, 2, 3, 9,
13) y debe completarse en una PR de seguimiento dentro de 48h, con la
deuda registrada en `docs/audits/backlog.md`.

---

## 8. Histórico

- 2026-05 — Política creada tras Pilot 1 (split
  `RecenterableSelection` / `ToggleableSelection`) y la deuda QA
  documentada en `docs/interaction-pilot-1-validation.md`.
