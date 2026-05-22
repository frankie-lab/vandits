# P1-w2 Postflight — 2026-05-21T22:08:00Z

- **Scope autorizado:** 11 POIs plan-conformes del snapshot `p1-w2-snapshot-20260521T213054Z.csv`.
- **Resultado:** **DETENIDO EN GATE DE CONTRADICCIÓN** — sin UPDATE, sin Nominatim, sin escritura. Snapshot intacto.

## 1. Stop condition

El usuario autoriza P1-w2 con la restricción explícita **"no Nominatim"**. La única vía existente en runtime para resolver las FKs faltantes (`country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`) a partir de `(latitude, longitude)` es el edge function `backfill-admin-fks`, que **internamente llama a `reverseGeocodeCanonical` (Nominatim)** — ver `supabase/functions/backfill-admin-fks/index.ts` líneas 20-24 y 286.

- `resolveAllFks` (cliente, `src/shared/geography/resolve-admin-fks.ts`) requiere strings administrativos como input (country/region/zone/…), no coordenadas. No reemplaza al reverse-geocoder.
- No existe en repo un resolver punto-en-polígono local contra `admin_areas` (sin Nominatim) que cubra los 11 países (ES, MA, FR, GB, IT, NO).
- Asignar FKs manualmente sin reverse-geocode sería heurístico (no auditable, no idempotente, no rollback-safe).

**Por contrato del usuario ("Si falla cualquier gate o stop condition: detener y reportar, sin reintentar ciegamente"), se detiene.**

## 2. Distribución

| Métrica | Valor |
|---|---:|
| Applied | **0** |
| Preserved (no plan-conformes) | 6 (intactos por diseño) |
| Blocked (plan-conformes sin vía no-Nominatim) | **11** |

Campos tocados: **ninguno**. Snapshot `p1-w2-snapshot-20260521T213054Z.csv` sigue siendo el rollback canónico (irrelevante porque no hubo cambios).

## 3. Distribución A/B/C/D post-P1

Idéntica a pre-P1 (no se escribió nada). Invariantes Fase 1 confirmadas: `computePoiMaturity`, marker fill, canon, package, app-version, README sin tocar.

## 4. Desbloqueos posibles para P1-w2

El usuario debe elegir **una** ruta — sin esa decisión P1-w2 queda diferido:

- **P1-w2.a** Autorizar `backfill-admin-fks` acotado a los 11 IDs (relaja "no Nominatim" sólo para este lote, con rate-limit Nominatim 1 req/s y snapshot/rollback ya listo). Coste: 11 req Nominatim.
- **P1-w2.b** Asignar FKs manualmente por inspección humana (mapa + admin_areas) — sin Nominatim, sin código. Coste: trabajo humano puntual, 11 filas.
- **P1-w2.c** Construir resolver punto-en-polígono local contra `admin_areas` GIS — PR de código + datos GIS completos por país (no garantizado para los 6 países del lote). Coste: alto, fuera de scope nocturno.

## 5. Siguiente acción

Decidir ruta P1-w2.a / .b / .c. Mientras tanto, el plan A (orquestador P2) queda entregado en `docs/audits/poi-identity-p2-server-orchestrator-plan.md`.

— Fin —
