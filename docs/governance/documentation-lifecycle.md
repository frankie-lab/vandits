# Documentation Lifecycle

> Status: **ACTIVE — FOUNDATION**. Estados canónicos de cualquier
> documento bajo `docs/`. Companion to
> [`./documentation-governance-policy.md`](./documentation-governance-policy.md).

---

## 1. Estados canónicos

| Estado        | Significado                                                       |
|---------------|-------------------------------------------------------------------|
| `draft`       | En construcción. No vinculante. No citable como canon.            |
| `active`      | Vigente y aplicable. Mantenimiento obligatorio.                   |
| `ratified`    | Ratificado por ADR. Cambios requieren nuevo ADR.                  |
| `deprecated`  | Desaconsejado. Aún válido como referencia; no para nuevo trabajo. |
| `superseded`  | Reemplazado por otro doc; debe enlazar al sucesor.                |
| `archived`    | Fuera de uso. Conservado por trazabilidad histórica.              |

Todo doc declara su estado en el bloque inicial:

```md
> Status: **ACTIVE**. (o DRAFT / RATIFIED / DEPRECATED / SUPERSEDED / ARCHIVED)
```

`superseded` y `deprecated` deben incluir link al sucesor o motivo.

## 2. Transiciones permitidas

```
draft ──────► active ──────► ratified
  │             │                │
  │             │                ▼
  │             ├─────────► superseded ──► archived
  │             ▼                              ▲
  └────────► deprecated ────────────────────── ┘
```

- `draft → active`: el autor + 1 reviewer del dominio aprueban.
- `active → ratified`: requiere **ADR** que lo ratifique
  explícitamente.
- `active → deprecated`: owner del doc-set marca con motivo.
- `active|deprecated → superseded`: existe doc sucesor enlazado.
- `* → archived`: ≥90 días en `deprecated`/`superseded` y sin tráfico
  de cambios; mover a `docs/<area>/archive/` opcional.
- `ratified → *`: sólo vía ADR sucesor (no se baja de `ratified` por
  decisión informal).

## 3. Cuándo cambia de estado

| Trigger                                                | Transición                          |
|---------------------------------------------------------|-------------------------------------|
| Primer commit del doc                                   | `— → draft`                         |
| Aprobado por owner + reviewer                           | `draft → active`                    |
| ADR lo cita como canon ratificado                       | `active → ratified`                 |
| Canon Change Policy con Migration Impact Check aprobado | crea sucesor + `active → superseded`|
| Funcionalidad eliminada del producto                    | `active → deprecated`               |
| 90+ días sin uso + sin enlaces vivos                    | `deprecated → archived`             |
| Drift detectado entre doc y código                      | abrir issue `docs-debt`; no cambia estado hasta resolver |

## 4. Quién puede promover

| Transición            | Quién                                                  |
|-----------------------|--------------------------------------------------------|
| `draft → active`      | Owner del doc-set + 1 reviewer del dominio             |
| `active → ratified`   | ADR aprobado (tech lead + architecture WG)             |
| `active → deprecated` | Owner del doc-set                                      |
| `* → superseded`      | Autor del sucesor + owner del doc-set                  |
| `* → archived`        | Owner del doc-set                                      |

## 5. Qué requiere ratificación

Ratificación (= ADR) es obligatoria para:

- Cualquier contract en `docs/contracts/`.
- Cualquier primitive en `docs/primitives/`.
- Cualquier canon proposal aprobada (popup, marker, visibility, QA).
- Cualquier cambio de gramática visual sistémica.
- Cualquier nuevo pilot que introduzca contratos.

No requieren ratificación:

- Inventarios y audits (suficiente `active`).
- Glossary entries.
- Notas internas de QA sin impacto de assertion sistémica.

## 6. Relación con ADRs

- Un ADR puede **ratificar** uno o varios docs vivos.
- Un ADR puede **superseder** otro ADR; ambos quedan enlazados.
- Un doc `ratified` lista en su header el ADR que lo ratifica:

```md
> Ratified by: [ADR-007](../adr/007-popup-canon-v2.md)
```

- Un ADR no se "deprecated"; se "superseded" por otro ADR.

## 7. Auditoría de lifecycle

Cada release-window:

- Listar `draft` con >30 días → revisar o cerrar.
- Listar `deprecated` con >90 días → archivar.
- Listar `superseded` con enlace roto al sucesor → bloquear y corregir.
- Listar `active` sin commit en 180 días → revisar drift.

La auditoría es responsabilidad del owner del doc-set; el resultado se
registra como audit en `docs/audits/`.
