# Documentation Review Rules

> Status: **ACTIVE — FOUNDATION**. Reglas vinculantes de review
> documental. Companion to
> [`./documentation-governance-policy.md`](./documentation-governance-policy.md),
> [`./documentation-update-matrix.md`](./documentation-update-matrix.md)
> y [`../contracts/canon-change-policy.md`](../contracts/canon-change-policy.md).

---

## 1. Reglas de rechazo obligatorio

Un reviewer **DEBE rechazar** un PR si:

1. **Cambio sistémico sin docs**: el PR toca canon, primitives,
   contracts, markers, popups, visibility, QA o pilots sin actualizar
   los docs listados en `documentation-update-matrix.md`.
2. **Canon change sin Migration Impact Check**: cualquier modificación
   de canon sin MIC adjunto al PR o linkeado desde el ADR
   correspondiente.
3. **Nueva primitive sin contract**: se introduce una primitive
   (o se renombra/extiende una existente) sin doc en
   `docs/primitives/` o sección dedicada en
   `docs/interaction-primitives.md`.
4. **Nuevo behavior sin QA update**: se introduce comportamiento
   observable sin actualizar `docs/qa/*` y sin assertion/harness
   correspondiente.
5. **Nuevo pilot sin validation doc**: se ejecuta o cierra un pilot
   sin doc en `docs/pilots/` con criterios de aceptación.
6. **Doc en chat / PR description únicamente**: análisis o decisiones
   sistémicas que no quedan persistidas en `docs/`.
7. **Link roto a sucesor**: doc `superseded`/`deprecated` sin enlace
   válido a su sustituto.
8. **Estado inconsistente**: doc en `ratified` sin ADR referenciado, o
   ADR sin docs ratificados listados.
9. **Owner ausente**: doc en carpeta sin owner identificable según
   `documentation-taxonomy.md`.
10. **Drift confirmado no reportado**: cambio de código que invalida
    un doc `active` sin actualización en el mismo PR ni issue
    `docs-debt` abierto.

## 2. Reglas blandas (warnings, no rechazo)

- Doc `draft` con >30 días: warning, requerir comentario del autor.
- Doc `active` sin commit en 180 días en dominio que sí cambió:
  warning, abrir revisión.
- Doc sin links bidireccionales declarados: warning, no rechazo en
  Fase 1.

## 3. Tipos de deuda documental

### 3.1 Deuda explícita
Declarada por el autor en el PR o en el propio doc, con SLA y
responsable. **Permitida** si está enlazada a un issue `docs-debt`.
Ejemplos:
- "F0 ratifica canon; F1 desglose pendiente — issue #1234, SLA 7d."

### 3.2 Stale docs
Docs `active` cuyo código subyacente ha cambiado y la doc no refleja
el estado real. Detección:
- review manual durante PRs,
- auditoría de lifecycle (ver `documentation-lifecycle.md` §7),
- futura automatización (Fase 3).

Acción: abrir `docs-debt`, marcar el doc con banner `> ⚠ STALE —
pending sync (issue #...)` mientras se resuelve.

### 3.3 Orphan docs
Docs sin owner identificable, sin enlaces entrantes, o en carpeta no
declarada en `documentation-taxonomy.md`.
Acción: el primer reviewer que lo detecte debe asignar owner o mover
a carpeta canónica; si no es posible, marcar `deprecated` con motivo.

### 3.4 Superseded docs
Docs sustituidos por otros. Deben:
- declarar `Status: SUPERSEDED`,
- enlazar al sucesor,
- conservarse en su ubicación (no borrar) salvo archivado por
  lifecycle.

## 4. Checklist de reviewer (Fase 1 — manual)

Antes de aprobar un PR sistémico, el reviewer confirma:

- [ ] ¿El cambio aparece en `documentation-update-matrix.md`? Si sí,
      ¿se actualizaron todas las docs obligadas?
- [ ] ¿El cambio es de canon? Si sí, ¿hay Migration Impact Check?
- [ ] ¿El cambio introduce primitive/contract/pilot nuevos? Si sí,
      ¿existe el doc correspondiente?
- [ ] ¿Los docs tocados declaran `Status` correcto?
- [ ] ¿Los links a companions/ADRs/contracts funcionan?
- [ ] ¿Hay deuda documental? Si sí, ¿está declarada con issue + SLA?

## 5. Roadmap (Fases 2 y 3 — propuesta, no activas)

### Fase 2 — Indexing
- README por carpeta de `docs/` con índice de docs vivos.
- Linking bidireccional explícito (`Referenced by:` blocks).
- Mapa de relaciones ADR ↔ contracts ↔ QA ↔ pilots.
- Índices por dominio (`docs/architecture/index.md` listando docs por
  dominio).

### Fase 3 — Enforcement
- PR checklist integrada (`docs/ci/pr-checklist.md`, no tocar hoy).
- Stale-doc warnings automáticos basados en mtime + paths tocados.
- Migration Impact enforcement: bloquear merge si etiqueta `canon` sin
  MIC linkeado.
- CI doc validation: links rotos, estado declarado, owner declarado.
- Orphan doc detection: docs sin enlaces entrantes + sin owner.

Ambas fases requieren su propio PR + Migration Impact Check cuando
toque ratificarlas como canon de proceso.

## 6. Responsabilidades

- **Autor del PR**: aplica la matriz, actualiza docs, adjunta MIC.
- **Reviewer**: aplica este checklist. Sin checklist completo,
  no aprobar.
- **Owner del doc-set**: arbitra disputas, promueve estados, mantiene
  el doc-set sano.
- **Architecture WG**: dueño último de la política; modificaciones
  vía ADR.
