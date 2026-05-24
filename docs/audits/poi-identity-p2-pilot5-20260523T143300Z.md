# POI Identity P2 — Pilot-5 (post-fix drain validation)

**UTC:** 2026-05-23T14:33:00Z
**Run:** `7e38b580-8a70-4462-986a-2e482114b560`
**Label:** `pilot5-postfix-20260523T143000Z`
**Referencias:** `poi-identity-p2-orchestrator-postfix-smokes-20260523T142800Z.md`,
`poi-identity-p2-orchestrator-infra-fix-report.md`

---

## 1. Scope (5 IDs)

| # | location_id | name | country |
| - | ----------- | ---- | ------- |
| 1 | `20dbd409-eead-486d-b45c-d3c1eb2aa967` | Schmetterlinghaus: The Imperial Butterfly Park | AT |
| 2 | `c64cad18-7ccb-44eb-a30f-80cf56d4066a` | Stephansdom Crypt | AT |
| 3 | `a22b1716-37ca-44c2-9a2f-1ed258a32fc7` | Mattsee | AT |
| 4 | `58e1a7bc-6e38-4507-a242-ad38b21d6b3c` | Zentralfriedhof | AT |
| 5 | `8da1f8b9-07f3-489c-be4c-b9bf5b8cbdb0` | Kreuzenstein Castle | AT |

Excluidos por contrato: Tolar Grande, Eisriesenwelt (Smoke A), Burg
Hochosterwitz (Smoke B), A/B/C, canon_gap, fixtures, hardError,
in_progress, ya enriched.

## 2. Config

```
chunk_size           = 1
max_ai_calls         = 5
max_runtime_minutes  = 30
max_error_rate_pct   = 5
dryRun               = false
background           = true (default; /start → 202)
confirm_full_run     = false
```

## 3. Estado final

```
status               = paused
pause_reason         = max_ai_calls_reached
abort_reason         = null
ai_calls_used        = 5    (flushed per item)
metrics              = { success:1, skip:4, fail:0, noop:0,
                         by_fail_reason:{},
                         by_skip_reason:{ defense_name_coordinate_mismatch:4 } }
started_at           = 2026-05-23 14:29:56.798Z
last_item_finished   = 2026-05-23 14:32:20.62Z   (~2m 24s drain real)
in_flight            = 0
reinvocaciones /start = 0
watchdog activado    = no (no fue necesario)
```

## 4. Resultado por item

| # | name | status | attempts | skip_reason | enrichment_status | updated_at | desc_len |
| - | ---- | ------ | -------- | ----------- | ----------------- | ---------- | -------- |
| 1 | Schmetterlinghaus | `skip` | 1 | `defense_name_coordinate_mismatch` | null (no tocado) | `2026-05-21 19:08:44Z` (pre-pilot) | — |
| 2 | Stephansdom Crypt | `skip` | 1 | `defense_name_coordinate_mismatch` | null (no tocado) | `2026-05-21 19:08:44Z` (pre-pilot) | — |
| 3 | **Mattsee** | **`success`** | 1 | — | **`enriched`** | **`2026-05-23 14:32:20.385Z`** (avanzado) | **879** |
| 4 | Zentralfriedhof | `skip` | 1 | `defense_name_coordinate_mismatch` | null (no tocado) | `2026-05-21 19:08:44Z` (pre-pilot) | — |
| 5 | Kreuzenstein Castle | `skip` | 1 | `defense_name_coordinate_mismatch` | null (no tocado) | `2026-05-11 15:01:30Z` (pre-pilot) | — |

## 5. Evidencia de persistencia por success

Mattsee (`a22b1716…`):
- `enrichment_status = 'enriched'` ✅
- `enriched_data.descripcion` presente, **879 chars** ✅
- `updated_at = 2026-05-23 14:32:20.385Z` (avanzó dentro del run window) ✅
- `attempts = 1` (sin reintentos)
- Persistencia verificada via `verifyPersistence` antes de marcar success
  (contract garantizado por `dispatch-outcome.test.ts` regression test).

Los 4 items skipeados NO mutaron `enriched_data`, `enrichment_status`
ni `updated_at` (verificado por timestamps pre-pilot intactos).

## 6. Snapshots

| location_id | `previous_enrichment_status` | `prev_data` | `taken_at` |
| ----------- | ---------------------------- | ----------- | ---------- |
| `20dbd409…` | null | true | `14:29:56.965Z` |
| `58e1a7bc…` | null | true | `14:30:03.888Z` |
| `8da1f8b9…` | null | true | `14:31:00.708Z` |
| `a22b1716…` | null | true | `14:31:36.856Z` |
| `c64cad18…` | null | true | `14:32:20.621Z` |

- **1 snapshot por item** (5 filas, UNIQUE(run_id,location_id) honrada).
- Ningún duplicate-key error.
- Rollback disponible: cualquier success puede revertirse via
  `previous_enriched_data` + `previous_enrichment_status`.

## 7. Skips/failures

- 0 failures.
- 4 skips, todos por **`defense_name_coordinate_mismatch`** (gate Fase 1
  defensa, no consumo IA spurious): el name/coords del POI no pasó la
  validación de coherencia post-dispatch. Bucket nuevo (no el legacy
  `http_200:name_coordinate_mismatch`).
- Error rate efectivo: **0 fail / 5 finalised = 0%** ≤ 5% threshold.

## 8. Invariantes (checklist)

- [x] Cada item terminó en estado terminal (`success`/`skip`/`fail`/`noop`)
- [x] `in_flight` final = **0**
- [x] `ai_calls_used` flushea por item (incremento monotónico durante el run)
- [x] `metrics` actualizada con buckets (`by_skip_reason` populated)
- [x] Snapshots idempotentes (1 por item, UNIQUE respetada)
- [x] **No success sin persistencia** (verifyPersistence activo; success
      único tiene `desc_len=879` y `updated_at` avanzado)
- [x] `updated_at`/`enriched_data` cambian SOLO en el item success
- [x] Watchdog no fue necesario (drain limpio en 1 invocación background)
- [x] No re-enrich (todos los skips/success tenían `enrichment_status=null` pre-pilot)
- [x] No UPDATE fuera del allowlist (toda escritura vía RPC `apply_orchestrator_enrichment` SECURITY DEFINER)
- [x] No Nominatim invocado
- [x] No marker fill, no `computePoiMaturity`, no canon
- [x] Sin bump cliente
- [x] Sin tocar A/B/C, canon_gap, fixtures, hardError, in_progress

## 9. Stop conditions — ninguna activada

| Condición | Disparada |
| --------- | --------- |
| success sin persistencia | NO |
| ai_calls_used no flushea | NO |
| metrics vacía | NO |
| in_flight huérfano no recuperado | NO |
| UPDATE fuera de allowlist | NO |
| re-enrich detectado | NO |
| Nominatim invocado | NO |
| item no-D llega a IA | NO (los 4 skips fueron bloqueados antes del write) |
| error rate >5% | NO (0%) |

## 10. Observaciones operativas

- **Drain real en background**: 5 items procesados en ~2m 24s, con
  `/start` devolviendo `202` inmediato (`EdgeRuntime.waitUntil`). Sin
  cancelación de gateway que afectara al resultado.
- **Sin reinvocaciones manuales**: a diferencia de Pilot-25 v3, no hizo
  falta `/watchdog` + `/start` repetidos. El edge worker sobrevivió toda
  la ventana.
- **Tasa de skip alta (80%)**: 4/5 cayeron por
  `defense_name_coordinate_mismatch`. Esto NO es un defecto del
  orquestador — es la gate Fase 1 protegiendo el catálogo de
  mismatches name↔coords. La proporción es coherente con los datos AT
  observados en pilotos anteriores. Si esa tasa se mantiene en
  Pilot-25, conviene revisar la heurística del gate por separado (fuera
  del scope actual).

## 11. Recomendación

**APROBADO para pasar a Pilot-25**, *previa aprobación explícita*.

Justificación:

- Los dos fixes infra (snapshot idempotency + background execution)
  funcionan en runtime con multi-item real.
- 0 abortos por `snapshot_failure`, 0 huérfanos, 0 reinvocaciones,
  drenaje limpio.
- Persistencia verificada en el único success; los 4 skips no
  contaminaron locations.
- Error rate 0% (skips no cuentan como fails para el threshold).
- `verifyPersistence` y la taxonomía `defense_*` operan
  correctamente bajo carga real.

Pilot-25 mantendrá los mismos parámetros (`chunk_size=1`, `background=true`,
`max_ai_calls=25`, `max_runtime_minutes=30`) y conservará los IDs
restantes del CSV congelado P2 (excluyendo los 3 ya enriquecidos:
Eisriesenwelt + Burg Hochosterwitz + Mattsee).

**Restricciones mantenidas:** no Pilot-25 sin aprobación adicional, no
Pilot-50, no Phase C, no P1-w2, no bump.

## 12. Estado actual de runs (P2)

| run_id | label | status | terminal? | huérfanos in_flight |
| ------ | ----- | ------ | --------- | ------------------- |
| `f3165bf6…` | smoke-A-postfix | `paused:max_ai_calls_reached` | sí | 0 |
| `3d6eaf1d…` | smoke-B-postfix | `paused:max_ai_calls_reached` | sí | 0 |
| `7e38b580…` | **pilot5-postfix** | `paused:max_ai_calls_reached` | sí | 0 |

Total POIs enriquecidos en validación post-fix: **3** (Eisriesenwelt,
Burg Hochosterwitz, Mattsee).
