# P2 Orchestrator — Fixes Report

UTC: 2026-05-22T10:10:00Z
Status: code + schema fixes landed, tests green, **no new pilot ejecutado**.

## 1. Causa raíz de los 5 "success" sin persistencia

`supabase/functions/enrich-location/index.ts:2966-2969` devuelve
`{ success: true, data: enrichedData }` **sin escribir nunca** a
`locations`. Es una función pura: genera el contenido enriquecido y delega
la persistencia al caller (patrón confirmado en `batch-enrich`:
`enrichData.data` → `supabase.from('locations').update(...)`,
`batch-enrich/index.ts:335-369`).

El orquestador P2 (versión pilot-25) interpretaba `success:true` como
"item completado" y marcaba `status='success'` sin escribir nada. Por eso
los 5 "successes" del run `4f3e91ee-…` tienen `updated_at = 2026-05-11` y
`enriched_data` sin `descripcion`.

**Clasificación del bug:** orquestador. enrich-location no es responsable
de persistir; el contrato siempre fue caller-persists.

## 2. Fixes aplicados

### 2.1 Verificación de persistencia (mandatorio)

Nueva RPC master-only `public.apply_orchestrator_enrichment(location_id,
enriched_data, enrichment_status)`:

- `SET LOCAL app.batch_orchestrator = 'true'` → activa el trigger
  allowlist (sólo `enriched_data` / `enrichment_status` / `updated_at`).
- `UPDATE locations SET enriched_data, enrichment_status, updated_at = now()`.
- Devuelve `id, enrichment_status, updated_at, descripcion_present,
  descripcion_length` para verificación inmediata.

Orquestador (`processChunk`):

1. dispatch a enrich-location (sin persistir).
2. si `body.success === true && body.data` → llama a la RPC.
3. **verifica** `descripcion_present === true` AND `updated_at >
   baselineUpdatedAt`.
4. si verificación falla → `status='fail'`,
   `fail_reason='success_without_persist:no_descripcion'` (o
   `updated_at_not_advanced`).
5. snapshot pre-dispatch sigue creándose ANTES del dispatch (rollback).

### 2.2 Bucket-mapping correcto

Toda respuesta `success:false` de enrich-location es defense-in-depth
(gate refusal, no error real). Mapeo único en
`dispatch-outcome.ts:DEFENSE_SKIP_REASONS`:

`identity_root_skip, identity_root_revalidation_failed,
invalid_coordinates, reverse_geocode_failed, identity_lookup_unavailable,
name_coordinate_mismatch, name_found_elsewhere, geo_narrative_mismatch,
llm_unverifiable` → `status='skip'`, `skip_reason='defense_<reason>'`.

Resto: `skip_reason='defense_other:<reason>'`. Nunca consumen retry como
fail. `fail` queda reservado para HTTP no-OK, excepciones, persistencia
fallida o `no_data_in_response`.

### 2.3 Flush incremental por ítem

`flushMetricsAndCalls` eliminado. Nuevo helper inline `flushOne(delta,
aiCallDelta)` dentro de `processChunk` que:

- re-lee la run desde DB (merge con writes concurrentes),
- incrementa `ai_calls_used` por ítem (no por chunk),
- merge incremental de `metrics.{success,fail,skip,noop,by_skip_reason,by_fail_reason}`.

Si el worker muere mid-chunk, `enrichment_batch_runs` refleja el progreso
real. El run wedged del pilot (`ai_calls_used=0, metrics={}` con 6
finalizados) ya no puede ocurrir.

### 2.4 Watchdog / restart policy

Nuevo endpoint `POST /enrich-batch-orchestrator/watchdog
{run_id, stale_minutes=5}`:

- si `ai_calls_used >= max_ai_calls` AND `status='running'` → pausa con
  `worker_died`/`max_ai_calls_reached` y NO resetea (no consume IA extra).
- si hay huérfanos → `restart_stale_batch_items()` los devuelve a
  `pending`. Si la run estaba `running` con huérfanos, se pausa con
  `pause_reason='worker_died'` (requiere `/start` explícito para reanudar).
- devuelve `{action, reset_count, prev_status, status, ai_calls_used,
  max_ai_calls}`.

Endpoint existente `/restart` se conserva (reset manual sin pausa).

### 2.5 Pause-on-budget (defensa redundante)

Tras cada ítem (no sólo entre chunks): re-lee run, si
`ai_calls_used >= max_ai_calls` → `applyPause('max_ai_calls_reached')`.
También evalúa `evaluateBudget` por si error_rate ≥5% con ≥50 finalizados
→ `applyAbort('error_rate_exceeded')`. No se reclaman ítems nuevos
mientras `status='paused'` (gate en `evaluateBudget`).

## 3. Archivos modificados

- `supabase/migrations/<ts>_apply_orchestrator_enrichment.sql` (nuevo):
  RPC master-only que aplica el UPDATE allowlist y devuelve evidencia de
  persistencia.
- `supabase/functions/enrich-batch-orchestrator/index.ts`:
  - `processChunk`: flush incremental, persistencia + verificación, bucket
    mapping defensivo, pause-on-budget per-item.
  - `flushMetricsAndCalls` eliminado.
  - `handleWatchdog` nuevo + router `/watchdog`.
- `supabase/functions/enrich-batch-orchestrator/dispatch-outcome.ts`
  (nuevo): clasificador puro `classifyDispatch` + `verifyPersistence` +
  `DEFENSE_SKIP_REASONS`.
- `supabase/functions/enrich-batch-orchestrator/dispatch-outcome.test.ts`
  (nuevo): 11 tests.

## 4. Tests ejecutados

```
✓ budget.test.ts        13/13
✓ dispatch-outcome.ts   11/11
Total                   24/24 PASS
```

Cobertura crítica:

- `classifyDispatch: every catalogued defense reason maps to defense_*`
- `classifyDispatch: success:true without data -> fail no_data_in_response`
- `verifyPersistence: descripcion_present=false -> fail no_descripcion`
- `verifyPersistence: descripcion ok but updated_at NOT advanced -> fail`
- `verifyPersistence: pilot-25 regression — los 5 "success" del pilot
  MUST fail verification` (test explícito anti-regresión).
- `budget: pause when max_ai_calls reached` (sin cambios).
- `budget: terminal statuses abort the loop` (sin cambios).

Sin Nominatim, sin IA, sin UPDATE a `locations` durante los tests
(`dispatch-outcome.ts` es pura).

## 5. Estado del run wedged `4f3e91ee-…`

Sin tocar (per instrucción "no procesar más"). Estado actual:

- `status='running'` (wedged), `ai_calls_used=0`, `metrics={}`.
- Items: 5 success (falsos, sin persistir), 1 fail
  (`http_200:name_coordinate_mismatch` — con los fixes habría sido
  `skip:defense_name_coordinate_mismatch`), 19 in_flight (huérfanos
  ~40 min).
- 7 snapshots persistidos (rollback no-op disponible).

## 6. Recomendación 19 in_flight + run wedged

**Preservar para auditoría, marcar el run como aborted superseded.**

Procedimiento sugerido (NO ejecutado, requiere aprobación):

1. `UPDATE enrichment_batch_runs SET status='aborted',
   abort_reason='superseded_by_fixes_report', finished_at=now() WHERE
   id='4f3e91ee-…';`
2. Dejar los 19 ítems `in_flight` tal cual (testigo del bug del worker).
3. Snapshots conservados 90 días.
4. Abrir run nuevo para el próximo piloto-25 con el mismo scope_count=25
   y `max_ai_calls=25`. Los 5 "success" falsos siguen sin `descripcion`
   en `locations`, por lo que pasarán de nuevo el gate Fase 1 (D
   elegible) en el run nuevo.

Alternativa más limpia: ejecutar `/watchdog` sobre la run wedged →
pausará con `worker_died` y reseteará los 19 a `pending`. Luego marcar
manualmente la run como `aborted`. Tampoco se ejecutó.

## 7. Recomendación final

**Repetir piloto-25 con los fixes** (run NUEVO, scope_count=25,
max_ai_calls=25, dryRun=false). Pre-flight checklist:

- [x] RPC `apply_orchestrator_enrichment` desplegada y master-only.
- [x] Trigger `enforce_orchestrator_update_allowlist` activo.
- [x] Persistencia verificada en orquestador (descripcion + updated_at).
- [x] Bucket-mapping defensivo cubre las 9 razones conocidas.
- [x] Flush incremental por ítem.
- [x] `/watchdog` cableado.
- [x] 24/24 tests verdes.
- [ ] Run wedged `4f3e91ee-…` marcado como `aborted` (requiere
      aprobación).
- [ ] Aprobación explícita del master para abrir nuevo run.

Si el piloto-25 nuevo cumple éxito ≥90% real (`descripcion` persistida +
`updated_at` movido), sin fails inesperados, sin abort, sin UPDATE fuera
de allowlist → abrir aprobación para piloto-50. Phase C (1.259) sigue
bloqueado hasta validar piloto-50 limpio.

**NO** ampliar a 50 ni Phase C sin esa validación.

## 8. Invariantes confirmadas

- Sin Nominatim invocado.
- Sin UPDATE fuera de allowlist (trigger sigue activo; RPC fuerza GUC).
- Sin bump (cambios sólo server-side: schema + edge).
- Sin P1-w2 tocado.
- Sin re-enrich (gate `already_enriched` en classifier).
- Marker fill / computePoiMaturity / canon territorial intactos.
- Snapshots disponibles, rollback documentado.

---

## Addendum v2 — 2026-05-23T14:20Z — Infra fix (snapshot idempotency + background drain)

Two additional structural fixes landed after Pilot-25 v3 exposed them in production. Full report:
`docs/audits/poi-identity-p2-orchestrator-infra-fix-report.md`.

**TL;DR:**
1. **Snapshot idempotency** — `INSERT` replaced with `UPSERT … ON CONFLICT (run_id, location_id) DO NOTHING` via new `recordPreDispatchSnapshot()` helper (`./snapshot.ts`). Watchdog re-claim no longer aborts the run. Original `previous_*` values preserved on retries. 6 new Deno tests, including the exact Pilot-25 v3 regression with real IDs.
2. **Background drain** — `/start` returns **202** immediately and processes via `EdgeRuntime.waitUntil(...)`. Gateway 60s cancellation no longer leaves orphans. Foreground mode preserved via `body.foreground:true` for smoke/test harnesses.

**No migration required** (`UNIQUE(run_id, location_id)` already exists in `20260522091857_…sql:92`). **No canon, marker fill, or computePoiMaturity changes. No bump.**

Tests: 30/30 PASS. Deployed.

Recommendation: smoke 1-POI + smoke orphan-recovery before any new pilot. NO piloto-25 v4 yet.
