# POI Identity P2 — Orchestrator Post-Fix Smokes (Smoke A + Smoke B)

**UTC:** 2026-05-23T14:28:00Z
**Scope:** Validar en runtime los fixes de infraestructura del orquestador
(snapshot idempotency + background execution) antes de cualquier piloto.
**Decisión global previa:** no Pilot-25, no Pilot-50, no Phase C, no Nominatim,
no A/B/C, no canon_gap, no re-enrich, no marker fill, no `computePoiMaturity`,
no bump.

---

## 0. Pre-flight — Unit / Deno test suite

`supabase--test_edge_functions enrich-batch-orchestrator` →
**30/30 PASS** (budget 13 / dispatch-outcome 11 / snapshot 6).

Relevant tests:
- `snapshot: second attempt does NOT fail (idempotent)` ✅
- `snapshot: second attempt does NOT overwrite original previous_* values` ✅
- `snapshot: watchdog re-claim scenario — survives retry without abort` ✅
- `verifyPersistence: pilot-25 regression — pilot's '5 success' rows MUST fail verification` ✅
- `classifyDispatch: HTTP 200 success:false name_coordinate_mismatch -> skip:defense_*` ✅

---

## 1. Smoke A — 1 POI foreground (real persistence)

| Campo | Valor |
| ----- | ----- |
| `run_id` | `f3165bf6-16a6-47a7-bb8a-c112330b7588` |
| Label | `smoke-A-postfix-foreground-1poi-20260523T142500Z` |
| Location ID | `bd22e678-29f4-42fa-9b88-3239ac2c9d63` (Eisriesenwelt, AT) |
| `scope_count` | 1 |
| `max_ai_calls` | 1 |
| `chunk_size` | 1 |
| `dryRun` | false |
| Modo HTTP | `foreground:true` (gateway canceló a 60s — comportamiento esperado, el background loop completó el item) |

### Resultado runtime

```
run.status          = paused
run.pause_reason    = max_ai_calls_reached
run.abort_reason    = null
run.ai_calls_used   = 1
run.metrics         = { success: 1, skip: 0, fail: 0, noop: 0,
                        by_fail_reason: {}, by_skip_reason: {} }
```

### Item

| location_id | status | attempts | skip | fail |
| ----------- | ------ | -------- | ---- | ---- |
| `bd22e678…` | `success` | 1 | null | null |

### Persistencia real (post-write join)

| `enrichment_status` | `updated_at` | `desc_present` | `desc_len` |
| ------------------- | ------------ | -------------- | ---------- |
| `enriched` | `2026-05-23 14:24:35.446105+00` | `true` | **762** |

### Snapshot

| run_id | location_id | `previous_enrichment_status` | `previous_enriched_data` | `taken_at` |
| ------ | ----------- | ---------------------------- | ------------------------ | ---------- |
| `f3165bf6…` | `bd22e678…` | null (POI estaba sin enriquecer) | non-null | `2026-05-23 14:23:43.698455+00` |

→ **Una sola fila de snapshot** para el par `(run_id, location_id)`.

### Checklist invariantes (Smoke A)

- [x] Snapshot creado una sola vez
- [x] Success solo con persistencia real (`desc_len=762`, `enrichment_status='enriched'`, `updated_at` avanzado)
- [x] `enriched_data.descripcion` persiste
- [x] `updated_at` avanza
- [x] `ai_calls_used = 1`
- [x] `metrics` flusheado
- [x] Item terminal (`success`), no queda `in_flight`
- [x] Run pausa por `max_ai_calls_reached`
- [x] No Nominatim
- [x] No UPDATE fuera del allowlist (toda escritura vía `apply_orchestrator_enrichment` SECURITY DEFINER)
- [x] No marker fill, no `computePoiMaturity`, no canon

**Veredicto:** ✅ PASS — pipeline foreground correcto, persistencia verificada.

---

## 2. Smoke B — Orphan recovery / Snapshot idempotency (runtime)

### Estrategia

Para reproducir el bug Pilot-25 v3 (`snapshot_failure` por
`duplicate key value violates unique constraint
enrichment_batch_snapshots_run_id_location_id_key`) **sin necesitar
una ventana de timing exacta** entre `claim` y `watchdog`, pre-insertamos una
**fila sentinela** en `enrichment_batch_snapshots` para el `(run_id,
location_id)` ANTES de invocar `/start`. El orquestador llamará a
`recordPreDispatchSnapshot` y, si el UPSERT idempotente es correcto:

1. NO debe abortar el run.
2. NO debe sobrescribir los `previous_*` originales (sentinela).
3. Debe procesar el item normalmente.

Esto es semánticamente equivalente al caso "watchdog reseteó el item, hay
snapshot previo, segunda claim → `INSERT` chocaría con la UNIQUE".

| Campo | Valor |
| ----- | ----- |
| `run_id` | `3d6eaf1d-de8a-42ac-b757-ae7e6c234215` |
| Label | `smoke-B-postfix-orphan-idempotency-20260523T142800Z` |
| Location ID | `7179bdd7-d418-4520-90b0-2d6c1abbcc43` (Burg Hochosterwitz, AT) |
| Sentinela pre-insertada | `previous_enrichment_status='SENTINEL_PRESERVED'`, `previous_enriched_data={"sentinel":"SMOKE_B_PRESERVE_ME"}` |
| `max_ai_calls` | 1 |
| `chunk_size` | 1 |
| `dryRun` | false |
| Modo HTTP | background (`/start` devolvió `202` inmediato) |

### Línea de tiempo

```
14:25:53Z  /seed → run_id 3d6eaf1d…
14:26:02Z  INSERT sentinela en enrichment_batch_snapshots
14:26:05Z  /start → 202 background (EdgeRuntime.waitUntil)
14:26:05Z  recordPreDispatchSnapshot (UPSERT ON CONFLICT DO NOTHING)
            → alreadyExisted=true, NO ABORT
14:27:16Z  item terminó success, persistencia confirmada
```

### Resultado runtime

```
run.status          = paused
run.pause_reason    = max_ai_calls_reached
run.abort_reason    = null   ← (bug Pilot-25 v3 habría puesto 'snapshot_failure')
run.ai_calls_used   = 1
run.metrics         = { success: 1, skip: 0, fail: 0, noop: 0,
                        by_fail_reason: {}, by_skip_reason: {} }
```

### Item

| location_id | status | attempts | enrichment_status | `updated_at` | `desc_len` |
| ----------- | ------ | -------- | ----------------- | ------------ | ---------- |
| `7179bdd7…` | `success` | 1 | `enriched` | `2026-05-23 14:27:16.436735+00` | **809** |

### Snapshot — preservación del original

Post-run, una única fila para `(run_id, location_id)`:

| `previous_enrichment_status` | `previous_enriched_data->>'sentinel'` | `taken_at` |
| ---------------------------- | ------------------------------------- | ---------- |
| **`SENTINEL_PRESERVED`** | **`SMOKE_B_PRESERVE_ME`** | `2026-05-23 14:26:02.174643+00` (pre-`/start`) |

→ El orquestador NO sobrescribió los `previous_*` con datos post-write,
y el UPSERT idempotente NO duplicó la fila NI generó error.

### Evidencia de no-duplicación de procesamiento

- `attempts=1` (única dispatch ejecutada).
- `ai_calls_used=1` (respetado).
- `metrics.success=1` (no doble flush).

### Checklist invariantes (Smoke B)

- [x] Snapshot UPSERT no falla con fila pre-existente
- [x] Snapshot original NO se sobrescribe (`SENTINEL_PRESERVED` intacto)
- [x] El watchdog/restart no rompería el run (caso simulado en runtime)
- [x] Item pasa de `pending` → `in_flight` → `success` correctamente con snapshot pre-existente
- [x] No queda `in_flight` final
- [x] `max_ai_calls` se respeta (1/1)
- [x] No se duplica procesamiento (`attempts=1`)
- [x] No se marca success sin persistencia (desc_len=809, status=enriched, updated_at avanzado)
- [x] No Nominatim, no marker fill, no `computePoiMaturity`, no canon, no re-enrich

**Veredicto:** ✅ PASS — la regresión que abortó Pilot-25 v3 (`snapshot_failure`)
**no se reproduce**. Idempotencia confirmada en runtime con preservación
del baseline original.

---

## 3. Invariantes globales (ambos smokes)

| Invariante | Smoke A | Smoke B |
| ---------- | ------- | ------- |
| No Nominatim | ✅ | ✅ |
| No re-enrich | ✅ | ✅ |
| No UPDATE fuera del allowlist (`apply_orchestrator_enrichment` RPC) | ✅ | ✅ |
| Snapshot único por `(run_id, location_id)` | ✅ | ✅ (sentinela intacta) |
| Background mode operativo (`/start` 202) | n/a (foreground) | ✅ |
| `verifyPersistence` rechaza success vacío | ✅ (post-write desc 762) | ✅ (post-write desc 809) |
| Sin marker fill, sin `computePoiMaturity`, sin canon | ✅ | ✅ |
| Sin bump de versión cliente | ✅ | ✅ |
| Sin scope adicional, sin tocar A/B/C, sin canon_gap | ✅ | ✅ |

---

## 4. Diagnóstico

Los dos fixes infra entregados en
`docs/audits/poi-identity-p2-orchestrator-infra-fix-report.md` están **activos
en runtime**:

1. **Snapshot idempotency** — `recordPreDispatchSnapshot` con
   `upsert({ ignoreDuplicates:true, onConflict:"run_id,location_id" })`
   convierte la colisión en no-op. Smoke B prueba que el camino "snapshot
   pre-existente" no aborta el run y preserva el baseline original.
2. **Background execution** — `/start` devuelve 202 con
   `EdgeRuntime.waitUntil`. Smoke B procesó el item completo (~70s desde
   `/start` hasta `success`) sin que la cancelación del gateway HTTP a 60s
   afectara el resultado. Smoke A, lanzado en `foreground`, también
   completó pese a la cancelación HTTP (`context canceled`), porque la
   misma `waitUntil` semántica mantiene viva la worker hasta convergencia
   terminal.

Además, las clasificaciones nuevas (`defense_*` taxonomy) y el flush
per-item de `ai_calls_used`/`metrics` siguen funcionando como en los tests
unitarios.

---

## 5. Estado actual de runs

| run_id | label | status | terminal? | huérfanos in_flight |
| ------ | ----- | ------ | --------- | ------------------- |
| `f3165bf6…` | smoke-A-postfix | `paused:max_ai_calls_reached` | sí (cap budget) | 0 |
| `3d6eaf1d…` | smoke-B-postfix | `paused:max_ai_calls_reached` | sí (cap budget) | 0 |

Ningún run quedó en estado inconsistente. Ningún ítem `in_flight` huérfano.

---

## 6. Recomendación

**Avanzar a Pilot-5 (escalón intermedio) antes de Pilot-25**, *previa
aprobación explícita*.

Razonamiento:

- Smoke A y Smoke B confirman las dos correcciones críticas (idempotencia +
  background) en runtime, contra DB real, con persistencia verificada.
- Sin embargo, el comportamiento de drenaje real con `N>1` items
  (encadenamiento background, presión sobre `max_ai_calls` y watchdog en
  carrera real) no se ha vuelto a observar desde Pilot-25 v3. Saltar
  directamente a 25 vuelve a exponer ~50s × 25 = ~21 min de drenaje
  continuo sobre un edge worker, donde un eventual reciclaje de runtime
  por mantenimiento del gateway puede dejar items `in_flight`. El
  watchdog + idempotencia ahora lo absorberían, pero conviene validarlo
  primero en escala pequeña.
- **Pilot-5** (5 POIs D, `max_ai_calls=5`, `chunk_size=1`, background)
  cubre exactamente ese gap con coste IA mínimo y permite observar:
  1) drenaje multi-item en background; 2) watchdog real si hay
  reciclaje; 3) clasificación de skips en lote pequeño.
- Si Pilot-5 termina limpio (todos terminal, sin huérfanos, persistencia
  verificada en todos los success), aprobar Pilot-25. Si no, iterar.

**No proceder a Pilot-25/Pilot-50/Phase C sin aprobación explícita.**

### Alternativa equivalente

Si se prefiere economizar un escalón, repetir Smoke A con **3 POIs**
(`max_ai_calls=3`) — cubre el drenaje multi-item con presupuesto mínimo y
es funcionalmente análogo a Pilot-5 para los riesgos identificados.

---

## 7. Archivos / referencias

- `supabase/functions/enrich-batch-orchestrator/snapshot.ts` (UPSERT idempotente)
- `supabase/functions/enrich-batch-orchestrator/snapshot.test.ts` (6/6 PASS)
- `supabase/functions/enrich-batch-orchestrator/index.ts` (`handleStart` background + `recordPreDispatchSnapshot`)
- `docs/audits/poi-identity-p2-orchestrator-infra-fix-report.md` (fixes entregados)
- `docs/audits/poi-identity-p2-phase-b-pilot25-v3-20260523T141000Z.md` (origen del bug)
