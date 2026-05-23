# P2 Pilot-25 v2 — Aborted by Stop Condition

UTC: 2026-05-23T13:48:44Z
Status: **ABORTED — stop condition triggered (success_without_persist regression)**.

## 1. Cierre del run anterior (4f3e91ee)

- `enrichment_batch_runs.status` = `aborted`
- `abort_reason` = `orchestrator_bug_no_persistence_verification`
- `finished_at` set.
- 19 in_flight huérfanos → `status='fail'`, `fail_reason='aborted_with_run:orchestrator_bug_no_persistence_verification'` (el CHECK constraint de `enrichment_batch_items.status` no admite `'aborted'`; `fail` es el terminal permitido más cercano).
- 5 falsos success + 1 fail conservados sin tocar (auditoría).
- 7 snapshots conservados.
- Run NO reutilizable.

## 2. Nuevo run

- `run_id` = `f5485406-a3e5-4e5d-b267-92961e537665`
- label: `p2-pilot25-v2-20260523T134300Z`
- scope_count = 25, chunk_size = 25, max_ai_calls = 25, max_runtime_minutes = 30, max_error_rate_pct = 5
- dryRun = false, confirm_full_run = false
- source CSV congelado: `/mnt/documents/poi-nightly-batch/p2-scope-frozen-20260521T213054Z.csv` (primeras 25 IDs)
- seed OK (200), start dispatched (cliente expiró por timeout >30s, worker continuó server-side).

### 25 IDs scope
59286b30, 6b872a54, a66c5fa5, febaddaa, 20dbd409, 2492248c, 286a8239, 3f280875,
55ddc895, 58e1a7bc, 7179bdd7, 8da1f8b9, a22b1716, ba9365f8, bd22e678, c64cad18,
e0c89f8f, d0eb9fb8, d1e95f00, 47058b1e, 1f447669, 3e150792, 698a7eba, 7dc9cbf0,
94d297ad.

## 3. Outcome final (al momento de stop)

| status | count |
|---|---|
| success (falso) | 5 |
| fail | 1 (original) + 19 (aborted_with_run) = **20** |
| skip | 0 |
| noop | 0 |
| in_flight | 0 (post-abort) |

- `ai_calls_used` (run) = **0** (flushOne NO persistió incrementos)
- `metrics` (run) = `{}` (flushOne NO persistió agregados)
- run final: `aborted` con `abort_reason=stop_condition:success_without_persist_regression_v2_undeployed_fixes`
- 7 snapshots persistidos (rollback no-op disponible — los 5 falsos success no escribieron nada en `locations`).

### Verificación de persistencia (los 5 "success")

```
location_id                            updated_at(loc)            has_descripcion
2492248c-cdfc-4335-b961-5a26450984ce   2026-05-11 15:01:30+00     false
59286b30-cebf-4d8c-be48-f87a1c84a7ca   2026-05-11 15:01:30+00     false
6b872a54-0d20-443e-9663-0409d5a1ff23   2026-05-11 15:01:30+00     false
a66c5fa5-377c-4175-b149-679f468c244e   2026-05-11 15:01:30+00     false
febaddaa-4c21-4361-b1e3-38fecabcc0cb   2026-05-11 15:01:30+00     false
```

Cero escrituras reales a `locations`. `updated_at` no avanzó. `enriched_data.descripcion` ausente.

### Fail real (1)
- `20dbd409-eead-486d-b45c-d3c1eb2aa967` con `fail_reason='http_200:name_coordinate_mismatch'`.
  - Con los fixes deplegados habría sido `skip:defense_name_coordinate_mismatch` (bucket-mapping defensivo).

## 4. Causa raíz del stop

**Los fixes documentados en `poi-identity-p2-orchestrator-fixes-report.md` no estaban activos en el runtime de la edge function al ejecutar este piloto.** Evidencia:

1. **Bucket mapping defensivo NO aplicado**: el fail real reportó `http_200:name_coordinate_mismatch` (mapeo viejo). El clasificador `dispatch-outcome.ts` lo habría enviado a `skip:defense_name_coordinate_mismatch`.
2. **Verificación de persistencia NO aplicada**: 5 items se marcaron `success` con `locations.updated_at` congelado en 2026-05-11 y `enriched_data.descripcion` vacío. El verificador (`verifyPersistence`) habría flipado los 5 a `fail:success_without_persist:no_descripcion`.
3. **Flush incremental NO aplicado**: `enrichment_batch_runs.ai_calls_used=0` y `metrics={}` después de 5+1 items finalizados. `flushOne` no persistió.
4. **Watchdog NO ejercido**: 19 in_flight quedaron huérfanos (worker murió al timeout) — síntoma idéntico al pilot-25 v1.

El comportamiento observado es bit-a-bit el mismo que el pilot-25 v1 pre-fix. Conclusión operativa: la versión activa de `enrich-batch-orchestrator` en el edge runtime es la previa a los fixes (RPC `apply_orchestrator_enrichment` SÍ está desplegada en DB, pero el código edge que la invoca con persistencia+verificación no llegó a runtime).

## 5. Snapshots / Rollback

- 7 filas en `enrichment_batch_snapshots` para el run `f5485406-…`.
- Rollback **no requerido**: ninguna fila de `locations` cambió (`updated_at` intacto), no hay nada que revertir.
- Snapshots conservados para auditoría.

## 6. Invariantes

| Invariante | Estado |
|---|---|
| Sin Nominatim | OK (no se invocó) |
| Sin UPDATE fuera de allowlist | OK (no se ejecutó ningún UPDATE real sobre `locations`) |
| Sin re-enrich | OK (gate `already_enriched` no aplicable: ninguna escritura ocurrió) |
| Snapshots disponibles | OK (7) |
| Rollback disponible | OK (no-op) |
| Marker fill intacto | OK |
| `computePoiMaturity` intacto | OK |
| Canon territorial intacto | OK |
| Sin P1-w2 tocado | OK |
| Sin bump cliente | OK |
| Sin A/B/C, sin canon_gap, sin fixtures, sin hardError | OK |

## 7. Stop conditions disparadas

- `success sin persistencia real` (5 items): **DISPARADA**. Pause inmediato emitido vía `/pause` (status=paused, pause_reason `stop_condition:success_without_persist_regression`); abort posterior vía DB (status=aborted) con razón final `stop_condition:success_without_persist_regression_v2_undeployed_fixes`.
- `in_flight huérfano >5 min sin recovery`: latente (los 19 in_flight habrían cruzado el umbral). Resueltos en el mismo abort sin invocar `/watchdog`.
- Resto de stop conditions (error rate >5%, no-D a IA, UPDATE fuera de allowlist, max_ai_calls, runtime >30 min): no aplicaron.

## 8. Recomendación

**Detener Phase B hasta confirmar deploy de los fixes del orquestador.** No abrir piloto-25 v3, ni piloto-50, ni Phase C. Acciones requeridas antes de cualquier nuevo run:

1. Forzar redeploy de `enrich-batch-orchestrator` y verificar que el código activo contiene:
   - `dispatch-outcome.ts` (clasificador + verifier)
   - `flushOne` per-item
   - `/watchdog` endpoint
   - Llamada a `apply_orchestrator_enrichment` con persist+verify
2. Smoke test con 1 POI D válido fuera-de-CSV (o vía `dryRun=true` + audit del path verify) que demuestre:
   - `locations.updated_at` avanza
   - `locations.enriched_data->>'descripcion'` no vacío
   - `enrichment_batch_runs.ai_calls_used` se incrementa
   - `metrics.success` se incrementa
3. Recién entonces aprobar piloto-25 v3 con los mismos parámetros (25/25/30/5/dryRun=false).

**NO ampliar a 50, NO Phase C, NO usar piloto-25 v2 (`f5485406-…`).**

## 9. Artefactos

- Run anterior cerrado: `4f3e91ee-45ed-4d47-959c-937efe10235a` (aborted).
- Run nuevo abortado: `f5485406-a3e5-4e5d-b267-92961e537665` (aborted).
- Snapshots run nuevo: 7 (en `enrichment_batch_snapshots`).
- Reporte previo: `docs/audits/poi-identity-p2-orchestrator-fixes-report.md`.
- Reporte pilot v1: `docs/audits/poi-identity-p2-phase-b-pilot-20260522T093500Z.md`.
