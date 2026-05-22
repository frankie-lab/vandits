# P2 Orchestrator — Fase A Execution Report

- **UTC:** 2026-05-22T09:19Z
- **Fase:** A (schema + edge function + tests, SIN IA)
- **Plan ref:** `docs/audits/poi-identity-p2-server-orchestrator-plan.md` (v1 + Adenda v2)

---

## 1. Migraciones aplicadas

Dos migraciones SQL aplicadas con éxito. Linter: 93 issues totales en el proyecto (pre-existentes; mi PR introdujo y luego cerró 1 warning `search_path` en `enforce_orchestrator_update_allowlist`).

**Migración 1 — schema + trigger + RPCs**
- Tablas creadas (master-only RLS; admin read en `_runs`/`_items`):
  - `enrichment_batch_runs` (presupuesto + métricas JSONB + estado canónico)
  - `enrichment_batch_items` (cola + UNIQUE(run_id,location_id) + índices parciales)
  - `enrichment_batch_snapshots` (rollback futuro Fase B)
- Trigger `trg_enforce_orchestrator_update_allowlist` sobre `locations` (BEFORE UPDATE).
- Función `enforce_orchestrator_update_allowlist()` — **acotada por `current_setting('app.batch_orchestrator', true) = 'true'`**; sin flag, retorna `NEW` sin tocar nada (importers/recovery/edición manual NO afectados).
- RPCs master-only:
  - `claim_batch_items(run_id, chunk_size)` — `FOR UPDATE SKIP LOCKED`, orden `country_code ASC, location_id ASC`, marca `in_flight` + `attempts+1`.
  - `restart_stale_batch_items(run_id, stale_minutes)` — reset `in_flight → pending` para huérfanos.
  - `batch_orchestrator_health()` — diagnóstico de presencia.

**Migración 2 — fix linter**
- `enforce_orchestrator_update_allowlist` con `SET search_path TO 'public'`.

**Verificación schema (post-migración):**
```
batch_orchestrator_health() => {
  trigger_active: true, runs_table: true,
  items_table: true, snapshots_table: true
}
```

## 2. Edge Function: `enrich-batch-orchestrator`

Creada en `supabase/functions/enrich-batch-orchestrator/`:
- `budget.ts` — helpers puros `evaluateBudget` + `validateSeedConfig`.
- `budget.test.ts` — 13 tests unitarios.
- `index.ts` — router HTTP con auth master-only + 6 endpoints.

**Endpoints:**
| Método | Path | Función |
|---|---|---|
| POST | `/seed` | Inserta run + items desde `location_ids[]`. Valida budget (rechaza scope >50 sin `confirm_full_run`, exige `max_ai_calls >= scope_count` para full run). Resuelve `country_code` por lookup read-only. Dedupea IDs. |
| POST | `/start` | **Fase A: REQUIERE `dryRun:true`** (rechaza con 403 `phase_a_dry_run_only` en otro caso). Bucle: `evaluateBudget → claim → revalidar gate Fase 1 → marcar (skip/noop/fail)`. Procesa hasta `maxChunksPerInvocation` (default 50). En Fase A NUNCA llama IA y NUNCA escribe en `locations`. |
| POST | `/pause` | `status='paused'` + `pause_reason`. |
| POST | `/resume` | `paused → running` (sólo si está paused). |
| POST | `/restart` | Invoca `restart_stale_batch_items`. |
| GET | `/status` | Devuelve estado + pending/in_flight count + métricas + `elapsed_minutes` + `next_action`. |

**Auth:** doble check — JWT user resolved + `has_role(uid, 'master')` vía service role. Sin master ⇒ 403.

**Budget guard (`evaluateBudget`):**
- `pause:max_ai_calls_reached` — pre-chunk y mid-chunk (proyección con `ai_calls_used + aiCallsThisChunk`).
- `pause:max_runtime_reached` — `elapsed_min >= max_runtime_minutes`.
- `pause:already_paused` — respeta pausa manual.
- `abort:error_rate_exceeded` — `fail/(success+fail) > max_error_rate_pct` con `finalised >= 50`.
- `abort:terminal_completed|terminal_aborted`.

**Phase A safety stub:** dentro del loop, rama `if (!dryRun)` marca item como `fail:phase_b_not_active` — defensa en profundidad si el gate del endpoint fallara.

## 3. Tests ejecutados

**`enrich-batch-orchestrator/budget.test.ts`** — 13/13 OK:
- continue when fresh
- pause when max_ai_calls reached
- pause when runtime exceeded
- abort when error rate > threshold after >=50 finalised
- error rate ignored below 50 finalised
- manual pause respected
- terminal statuses abort the loop
- seed config: rejects oversized scope without confirm_full_run
- seed config: requires max_ai_calls >= scope_count for full run
- seed config: pilot 25 passes / pilot 50 passes / full run 1259 with confirm
- seed config: rejects zero/negative

**`_shared/poi-identity-root-status.test.ts`** (gates Fase 1) — 21/21 OK. Sin regresión.

**Total Fase 1 + Fase A: 34/34 verde.**

## 4. Cobertura de los 10 tests obligatorios pedidos

| # | Test pedido | Cobertura |
|---|---|---|
| 1 | Schema creado | `batch_orchestrator_health()` verifica las 4 piezas in-vivo. |
| 2 | Seed sin duplicados | `handleSeed` aplica `Array.from(new Set(...))` server-side; UNIQUE(run_id,location_id) bloquea cualquier reinserción a nivel DB. |
| 3 | Trigger sólo con flag | `enforce_orchestrator_update_allowlist` `RETURN NEW` cuando `current_setting('app.batch_orchestrator', true) <> 'true'`. |
| 4 | Trigger no afecta otros flujos | Misma fuente del #3. **Verificación funcional in-vivo del bloqueo positivo + permisivo se difiere a smoke test Fase B** (requiere setear flag en transacción real con datos; en Fase A NO se toca `locations`). Marcado como **pending smoke** en checklist Fase B. |
| 5 | Claim atómico no duplica | `FOR UPDATE SKIP LOCKED` + UNIQUE(run_id,location_id). Inherente al RPC. |
| 6 | max_ai_calls pausa | `evaluateBudget pause:max_ai_calls_reached` cubierto en tests (×1). |
| 7 | max_runtime pausa | `evaluateBudget pause:max_runtime_reached` cubierto (×1). |
| 8 | Restart resetea huérfanos | RPC `restart_stale_batch_items` + endpoint `/restart`. Test funcional in-vivo diferido a smoke (no se ejecuta loop real en Fase A). |
| 9 | Gates Fase 1 verdes | 21/21 tests existentes pasan. |
| 10 | Invariantes / no-hardcode | Sin cambio en `computePoiMaturity`, marker fill, canon, paleta, capabilities. |

## 5. Confirmaciones invariantes

- **NO IA** — Loop `dryRun` no invoca `enrich-location` ni AI Gateway. Gate de endpoint (`phase_a_dry_run_only`) + defensa en profundidad (`fail:phase_b_not_active`).
- **NO writes a `locations`** — Sólo SELECT en `handleSeed` y `processChunk`. Sin UPDATE/INSERT/DELETE a `locations`.
- **NO ejecución P2 real** — Ningún `/start` invocado contra la cola de 1.259.
- **NO Nominatim** — Orquestador no la importa ni la invoca.
- **NO re-enrich** — UNIQUE(run_id,location_id) + status terminal por item.
- **NO P1-w2** — Sin tocar.
- **NO bump** — Server-side puro (migración + edge). `package.json` intacto.
- **NO UI** — Sin tocar `src/`.

## 6. Archivos

**Creados:**
- `supabase/functions/enrich-batch-orchestrator/index.ts`
- `supabase/functions/enrich-batch-orchestrator/budget.ts`
- `supabase/functions/enrich-batch-orchestrator/budget.test.ts`
- `docs/audits/poi-identity-p2-phase-a-execution-20260522T091900Z.md` (este reporte)

**Migraciones aplicadas (gestionadas por la plataforma):**
- M1: schema + trigger + RPCs (`enrichment_batch_runs/items/snapshots`, `enforce_orchestrator_update_allowlist`, `claim_batch_items`, `restart_stale_batch_items`, `batch_orchestrator_health`).
- M2: fix `search_path` del trigger function.

**Modificados:** ninguno.

## 7. Checklist para aprobar Fase B (piloto 25/50)

- [ ] Smoke positivo del trigger acotado: setear `SET LOCAL app.batch_orchestrator='true'` y verificar que UPDATE fuera de allowlist lanza `orchestrator_update_outside_allowlist`.
- [ ] Smoke negativo: UPDATE típico de importer/recovery/edición manual SIN flag pasa sin error.
- [ ] Smoke claim atómico: dos claims paralelos no devuelven el mismo `item_id`.
- [ ] Smoke restart: marcar `in_flight` antiguo manualmente y verificar reset.
- [ ] Confirmar en `enrich-location` que ya snapshot-ea `enriched_data` previo en `audit_logs`; si NO, activar `enrichment_batch_snapshots` en el dispatch antes de IA.
- [ ] Aprobar subset 25 ó 50 IDs (muestreo estratificado por país desde el CSV congelado de 1.259) — congelar como nuevo CSV `pilot-25` / `pilot-50`.
- [ ] Aprobar parámetros: `max_ai_calls = scope_count`, `max_runtime_minutes = 30`, `max_error_rate_pct = 5`.
- [ ] Quitar gate `phase_a_dry_run_only` en `/start` (PR separado con tag `phase-b-pilot-only`).
- [ ] Implementar dispatch a `enrich-location` bajo `SELECT set_config('app.batch_orchestrator','true',true)` por transacción.
- [ ] Aprobar ejecución del piloto con sign-off explícito.

**Fase B NO iniciada. Pendiente de aprobación separada.**

— Fin del reporte —
