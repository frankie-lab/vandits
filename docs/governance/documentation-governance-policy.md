# Documentation Governance Policy

> Status: **ACTIVE — FOUNDATION**. Sistema de gobernanza documental
> de Vandits. No es una guía de estilo: es contrato de proyecto.
>
> Companion to:
> - [`./documentation-taxonomy.md`](./documentation-taxonomy.md)
> - [`./documentation-lifecycle.md`](./documentation-lifecycle.md)
> - [`./documentation-update-matrix.md`](./documentation-update-matrix.md)
> - [`./documentation-review-rules.md`](./documentation-review-rules.md)
> - [`../contracts/canon-change-policy.md`](../contracts/canon-change-policy.md)

---

## 1. Propósito del sistema documental

Vandits es una app multiusuario con dominios independientes, contratos
estrictos de canon, pilots de validación, y migraciones que afectan
gramáticas visuales y semánticas globales. Sin gobernanza documental:

- las decisiones se pierden en chat,
- los contratos se rompen sin trazabilidad,
- los pilots no quedan validables,
- las migraciones se reabren porque nadie recuerda el porqué,
- el onboarding es imposible.

El sistema documental existe para garantizar **persistencia,
trazabilidad y mantenimiento obligatorio** de toda decisión sistémica.

## 2. Principio rector

> **No existe trabajo terminado si no queda persistido y enlazado.**

Corolarios:

- Discovery/análisis **sin doc en repo** = trabajo no realizado.
- Canon ratificado **sin ADR** = canon inválido.
- Pilot ejecutado **sin validation doc** = pilot inexistente.
- Migración aplicada **sin Migration Impact Check** = migración
  bloqueada en review.

## 3. Tipos de artefactos obligatorios

| Tipo                 | Carpeta canónica       | Cuándo es obligatorio                                  |
|----------------------|------------------------|--------------------------------------------------------|
| **ADR**              | `docs/adr/`            | Toda decisión arquitectónica irreversible o sistémica  |
| **Contract**         | `docs/contracts/`      | Todo contrato de interacción, primitive o canon        |
| **Audit**            | `docs/audits/`         | Toda revisión transversal de superficie existente      |
| **Canon proposal**   | dominio + `-proposal`  | Antes de cualquier refactor de canon                   |
| **Migration impact** | en PR + linkeado ADR   | Todo cambio de canon (ver canon-change-policy)         |
| **QA contract**      | `docs/qa/`             | Todo flujo cubierto por E2E o assertion sistémica      |
| **Pilot validation** | `docs/pilots/`         | Todo pilot debe cerrar con validación documentada      |
| **Architecture map** | `docs/architecture/`   | Toda relación entre dominios / pipelines               |
| **Inventory**        | dominio + `-inventory` | Discovery de superficie existente antes de tocarla     |

## 4. Obligación de persistencia real en repo

- Todo artefacto debe vivir en `docs/` dentro del repo.
- **Prohibido**: "analysis only in chat", "lo dejo apuntado", "esto va
  en la descripción del PR y ya". El PR puede resumir, pero el
  artefacto canónico vive en repo.
- Diagramas, matrices y tablas → markdown en repo (ASCII si hace
  falta), no screenshots en chat.

## 5. Ownership documental

- Cada carpeta de `docs/` tiene un **owner doc-set** definido en
  `documentation-taxonomy.md`.
- El owner es responsable de:
  - mantener el doc al día tras cambios de su dominio,
  - marcar `deprecated`/`superseded` cuando corresponde,
  - aprobar promociones de estado (ver lifecycle).
- Sin owner identificable → el doc es **orphan** (ver review rules).

## 6. Linking obligatorio

- Todo doc debe enlazar:
  - sus **companions** (docs hermanos),
  - su **policy parent** si aplica (ej. canon-change-policy),
  - los **contracts** que toca,
  - los **ADRs** que lo ratifican o que ratifica.
- Linking bidireccional preferido: si A → B, B debe mencionar a A.
- Links rotos = deuda documental (ver review rules).

## 7. Triggers de actualización

Un doc debe actualizarse cuando:

1. Cambia el canon que describe (ver `documentation-update-matrix.md`).
2. Se ratifica un ADR que lo afecta.
3. Se cierra/abre un pilot relacionado.
4. Se detecta drift entre doc y código (auditoría periódica).
5. Se supera por un doc nuevo (marcar `superseded` con link).

## 8. Relación con CI/review

- **Hoy (Fase 1)**: la política es **review-enforced**, no
  CI-enforced. Reviewers DEBEN rechazar PRs que violen estas reglas.
- **Fase 2 (planificada)**: indexing + READMEs por carpeta + linking
  bidireccional explícito.
- **Fase 3 (propuesta)**: PR checklist, stale-doc warnings,
  migration-impact enforcement, CI doc validation, orphan detection.

Las fases 2 y 3 **no están activas**. Su definición vive en
`documentation-review-rules.md` §Roadmap.

## 9. Excepciones

- **Hotfixes de producción**: pueden mergear sin doc completa, pero
  abren ticket `docs-debt` con SLA 48h.
- **Cambios estrictamente cosméticos** (typos, formato): exentos.
- **Spikes desechables**: deben borrarse o promoverse a `audit` en
  ≤7 días; no se quedan en limbo.

## 10. Aplicabilidad

Esta política aplica a:

- todo PR que toque `src/` con impacto sistémico,
- todo PR que toque `supabase/migrations/`,
- todo PR que cree/modifique contratos, primitives, canon, QA o pilots,
- toda decisión registrada en `mem://` que afecte canon.

No aplica a: edits puramente de copy, ajustes de tokens visuales
contenidos, o bugfixes locales sin impacto de contrato.
