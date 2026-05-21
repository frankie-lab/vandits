# Dry-run — POI Identity Root Status (A/B/C/D)

Status: DRY-RUN. **No UPDATE. No código de UI. No bump.** Sólo lectura.

Contrato: `docs/contracts/poi-identity-root-status-contract.md`.

## 1. Universo

POIs visibles = `locations WHERE deleted_at IS NULL AND is_approved = true`.
Total auditado: **5.100** POIs (snapshot al ejecutar este dry-run).

## 2. Heurística aplicada (sin escribir)

```sql
CASE
  WHEN name IS NULL OR btrim(name)=''
    OR latitude IS NULL OR longitude IS NULL
    OR (latitude=0 AND longitude=0)
    THEN 'A'   -- Incompleto real
  WHEN geo_health IN ('broken','stale_name','empty')
    THEN 'C'   -- Identidad incoherente
  WHEN country_id IS NULL
    OR geo_health = 'partial'
    OR (has_descripcion AND region_id IS NULL)
    THEN 'B'   -- Canon/backfill pendiente
  ELSE 'D'     -- Identidad confirmada
END
```

`has_descripcion` = `enriched_data ? 'descripcion' AND length(...) > 0`.

Orden de evaluación importa: A > C > B > D.

## 3. Distribución global

| Root | Count | % | Color aux | Owner |
|------|------:|---:|-----------|-------|
| A — Incompleto real | 1 | 0,02 % | rojo | user |
| B — Canon/backfill pendiente | 11 | 0,22 % | amarillo | system |
| C — Identidad incoherente | 8 | 0,16 % | naranja | user |
| D — Identidad confirmada | 5.080 | 99,60 % | verde | auto |
| **Total** | **5.100** | 100 % | — | — |

Lectura: el catálogo visible está sano en >99 %. La cola operativa real
A∪B∪C = **20 POIs**.

## 4. Desglose por país (top)

| Root | Country | Count |
|------|---------|------:|
| A | ES | 1 |
| B | NO | 3 |
| B | ES | 3 |
| B | FR | 2 |
| B | MA | 1 |
| B | GB | 1 |
| B | IT | 1 |
| C | RO | 3 |
| C | MA | 2 |
| C | (sin código) | 2 |
| C | PL | 1 |
| D | ES | 1.309 |
| D | FR | 1.065 |
| D | IT | 988 |
| D | GB | 401 |
| D | US | 349 |
| D | PT | 250 |
| D | IE | 55 |
| D | RO | 49 |
| D | DE | 49 |
| D | FI | 49 |

(D continúa para los 49 países restantes del canon mundial; ningún país queda
fuera del eje D.)

## 5. Muestras A / B / C (cola operativa completa)

### A — Incompleto real (1)

| id | name | cc | geo_health |
|----|------|----|------------|
| `89867d20-bc1e-4a12-82fa-ba4820a5cdab` | Antarctica Roundabout | ES | hardError |

> Acción esperada: usuario completa identidad mínima o se descarta.

### B — Canon/backfill pendiente (11)

| id | name | cc | geo_health |
|----|------|----|------------|
| `a2b185ee-…` | beta-partial-2 | ES | partial |
| `2990233a-…` | beta-partial-3 | ES | partial |
| `1555901f-…` | beta-partial-1 | ES | partial |
| `3633c693-…` | Passage du Gois | FR | partial |
| `fdd7af66-…` | Lighthouse of the Black Stones | FR | partial |
| `e68260c5-…` | Loch Nevis | GB | partial |
| `3878d5c5-…` | Cala Coticcio Beach | IT | partial |
| `951370e0-…` | alpha-private-8 | MA | ok |
| `ab13d8fd-…` | Narvik | NO | partial |
| `620967fe-…` | Reine | NO | partial |
| `c53e3ad2-…` | Hamnøy | NO | partial |

> Acción esperada: jobs `backfill-admin-fks` / canonicalize completan FKs.
> **No penalizar al usuario.**

### C — Identidad incoherente (8)

| id | name | cc | geo_health |
|----|------|----|------------|
| `2bb2d2e6-…` | beta-chain-1 | MA | broken |
| `435a2dcf-…` | beta-chain-2 | MA | broken |
| `2b81c378-…` | Castillo de Malbork | PL | broken |
| `47c49cf2-…` | Biertan | RO | broken |
| `2584a104-…` | Șirnea | RO | broken |
| `f9d5f63d-…` | Cârlibaba | RO | broken |
| `f04b3b95-…-e2e000000002` | E2E Fixture — Empty POI | — | empty |
| `f04b3b95-…-e2e000000001` | E2E Fixture — Imported POI | — | empty |

> Acción esperada: revisión usuario (no auto-resolver, no enriquecer).
> Notar 2 fixtures E2E sintéticos esperados — no son deuda real.

## 6. Implicaciones operativas (informativas, no se ejecutan aquí)

- **Cola IA / re-enrich**: si se filtrara hoy por `D`, se procesarían 5.080
  POIs y se saltarían 20 (A=1, B=11, C=8). Coincide con el contrato §5.1 y §5.3.
- **Cola backfill canon**: 11 POIs B. Esperable cero crecimiento neto cuando
  T2A + P0 World Canon Coverage (v1.3.17 + v1.3.18) penetren en todo el
  pipeline.
- **Cola revisión usuario**: A+C reales (sin fixtures E2E) = 1 + 6 = **7 POIs**.
- **Salud global del catálogo**: 99,60 % en D. No hay deuda masiva.

## 7. Lo que este dry-run NO hizo

- No escribió ninguna columna.
- No creó `identity_root_status` / `identity_action_owner` / `identity_reason`.
- No tocó `locations`, `admin_areas`, `enriched_data`.
- No llamó Nominatim ni re-enrich.
- No movió POI-N de ningún punto.
- No tocó marker fill.
- No subió versión.

## 8. Próximos pasos (propuesta, NO ejecutar sin aprobación)

1. Revisar manualmente los 7 POIs reales A∪C y decidir corrección vs descarte.
2. Ejecutar `backfill-admin-fks` sobre los 11 POIs B una vez confirmado que
   T2A + P0 cubren sus países (ES, FR, GB, IT, NO, MA ya canónicos).
3. Si la heurística se valida en producción durante ≥7 días sin discrepancias,
   materializar campos `identity_root_status` / `identity_action_owner` /
   `identity_reason` como derivados (trigger o job), siguiendo §6 del contrato.
4. Cablear filtros A/B/C/D en panel admin y cola de trabajo (no UI usuario).
