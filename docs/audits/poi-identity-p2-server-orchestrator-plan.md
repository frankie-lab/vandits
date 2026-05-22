# P2 Server-Side Orchestrator — Plan

- **Estado:** PROPUESTA. No ejecutar hasta aprobación explícita.
- **Referencias:** `docs/audits/poi-identity-p1-p2-parallel-execution-plan.md`, `docs/audits/poi-identity-phase1-filter-wiring-20260521T214635Z.md`, `docs/audits/poi-identity-phase2-nightly-batch-20260521T215800Z-execution.md`.
- **Objetivo:** procesar los 1.259 IDs D del scope congelado P2 sin depender del sandbox, respetando todos los gates Fase 1 y todas las stop conditions del plan paralelo.

---

## 1. Arquitectura

```
+---------------------------+      +-----------------------------+
| frozen scope CSV (1.259)  | ---> |  enrichment_batch_runs (new) |
+---------------------------+      |  + enrichment_batch_items    |
                                   +--------------+--------------+
                                                  |
                                                  v
                          +-------------------------------------------+
                          | enrich-batch-orchestrator (edge function) |
                          | - claim next chunk (FOR UPDATE SKIP LOCKED)|
                          | - revalidate gates (Fase 1)                |
                          | - dispatch enrich-location per POI         |
                          | - record success/fail/skip                 |
                          | - sleep 60s between chunks                 |
                          +-------------------------------------------+
                                                  |
                                                  v
                                       +----------------------+
                                       | enrich-location      |
                                       | (re-revalidates)     |
                                       +----------------------+
```

- **Persistencia:** la cola vive en Postgres, no en memoria del sandbox. El job sobrevive a reinicios, cierres de sesión y deploys.
- **Disparo:** llamada HTTP única (manual o pg_cron). El edge function corre con `EdgeRuntime.waitUntil` y procesa hasta agotar la cola o disparar una stop condition.
- **Idempotencia:** un POI consumido (success o fail terminal) no vuelve a procesarse en la misma `run_id`.

## 2. Schema

```sql
-- Catálogo de runs (1 por batch nocturno)
CREATE TABLE enrichment_batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,                            -- p.ej. 'nightly-20260522'
  source_csv_path TEXT NOT NULL,                  -- /mnt/documents/poi-nightly-batch/...
  scope_count INT NOT NULL,                       -- 1.259
  chunk_size INT NOT NULL DEFAULT 25,
  pause_seconds INT NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'pending',         -- pending|running|paused|completed|aborted
  abort_reason TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {success, fail, noop, skipped, by_reason}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Item por POI (1.259 filas por run)
CREATE TABLE enrichment_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES enrichment_batch_runs(id) ON DELETE CASCADE,
  location_id UUID NOT NULL,
  country_code TEXT,                              -- para ordering GB→US→IE→…
  status TEXT NOT NULL DEFAULT 'pending',         -- pending|in_flight|success|fail|skip|noop
  skip_reason TEXT,                               -- catálogo cerrado SkipReason (Fase 1)
  fail_reason TEXT,
  attempts INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (run_id, location_id)
);

CREATE INDEX idx_ebi_pending ON enrichment_batch_items (run_id, status, country_code, location_id)
  WHERE status = 'pending';
```

- **RLS:** ambas tablas master-only (`manage_permissions`). Lectura admin para reporting.
- **Ordering canónico:** `country_code ASC, location_id ASC` (mismo que CSV congelado → GB→US→IE→…).

## 3. Seeding

1. Master sube el CSV congelado al storage `audit-snapshots/` (o lo deja en `/mnt/documents/` referenciado por path).
2. Master invoca `POST /enrich-batch-orchestrator/seed` con `{ label, csv_path }`.
3. Orchestrator inserta 1 fila en `enrichment_batch_runs` + 1.259 en `enrichment_batch_items` (todas `pending`).
4. Devuelve `run_id`. Estado `pending`.

## 4. Run loop

```ts
// Pseudocódigo del orchestrator (Deno edge function)
async function processRun(runId: string) {
  while (true) {
    const stop = await checkStopConditions(runId);
    if (stop) return abort(runId, stop);

    // 1. Claim next chunk (atomic FOR UPDATE SKIP LOCKED)
    const chunk = await claimChunk(runId, 25);  // returns [{location_id, country_code}, ...]
    if (chunk.length === 0) return complete(runId);

    // 2. Process each POI in chunk (parallel within chunk OK, sequential by default)
    for (const item of chunk) {
      const fresh = await fetchLocation(item.location_id);
      const verdict = classifyPoiIdentityRootStatus(fresh);

      // 2a. Gate Fase 1 pre-IA
      if (!verdict.eligibleForAutoEnrich) {
        await markItem(item, 'skip', verdict.skipReason);
        continue;
      }

      // 2b. Optimistic lock
      const locked = await tryLockOptimistic(item.location_id);  // sets enrichment_status='in_progress'
      if (!locked) {
        await markItem(item, 'skip', 'in_progress');
        continue;
      }

      // 2c. Dispatch enrich-location (which ALSO revalidates just-before-write)
      try {
        const r = await invokeEnrichLocation({ locationId: item.location_id });
        if (r.aborted) await markItem(item, 'noop', r.reason);
        else if (r.success) await markItem(item, 'success');
        else await markItem(item, 'fail', r.error);
      } catch (e) {
        await markItem(item, 'fail', String(e));
        await releaseLock(item.location_id);
      }
    }

    // 3. Pause 60s between chunks
    await sleep(60_000);
  }
}
```

### 4.1 Claim atómico

```sql
WITH next AS (
  SELECT id FROM enrichment_batch_items
  WHERE run_id = $1 AND status = 'pending'
  ORDER BY country_code ASC, location_id ASC
  LIMIT 25
  FOR UPDATE SKIP LOCKED
)
UPDATE enrichment_batch_items i
SET status = 'in_flight', claimed_at = now(), attempts = attempts + 1
FROM next WHERE i.id = next.id
RETURNING i.location_id, i.country_code;
```

Garantiza que dos instancias del orchestrator no procesen el mismo POI.

### 4.2 Lock optimista por POI

`UPDATE locations SET enrichment_status='in_progress' WHERE id=$1 AND enrichment_status IS DISTINCT FROM 'in_progress' RETURNING id` — si devuelve 0 filas, otro proceso ya lo tomó → skip.

## 5. Revalidación (gates Fase 1)

- **Pre-IA (orquestador):** `classifyPoiIdentityRootStatus(freshRow)` antes de despachar. Skip silencioso si `!eligibleForAutoEnrich`, con `skip_reason` registrado.
- **Just-before-write (enrich-location):** ya existe (Fase 1). Aborta sin escribir si el estado cambió entre claim y write.
- **Catálogo cerrado de SkipReason:** `root_a_missing_identity | root_b_unresolved | root_c_incoherent_identity | canon_gap | geo_hard_error | fixture | under_review | already_enriched | in_progress | unresolved_flag | invalid_coordinates | deleted | not_approved`.

## 6. Rate-limit

- **Pausa entre chunks:** 60 s (configurable en `enrichment_batch_runs.pause_seconds`).
- **Concurrencia intra-chunk:** secuencial por defecto (1 POI a la vez). Opcional: `max_parallel_per_chunk` en metadata del run (default 1).
- **AI gateway:** ya rate-limited upstream; orquestador respeta backoff exponencial si `enrich-location` devuelve 429.

## 7. Retry policy

- `fail` con error transitorio (429, 502, 503, timeout < 30 s): re-encolable hasta `attempts <= 3`. Tras 3 intentos → `fail` terminal con `fail_reason`.
- `fail` con error semántico (IA rechaza, JSON inválido del modelo): terminal en attempt 1 (no retry).
- `skip` y `noop`: terminales. Nunca reintentables dentro del mismo run.

## 8. Stop conditions

Disparan `abort_reason` y detienen el run (estado `aborted`):

| # | Condición | Detección |
|---|---|---|
| 1 | error rate > 5 % (después de >= 50 items finalizados) | métrica `fail / (success+fail)` |
| 2 | cualquier POI procesado pertenece a A/C/B-no-resuelto/canon_gap/hardError/fixture | gate Fase 1 lo bloquearía como skip; si LLEGA a `success` ⇒ bug → abort |
| 3 | UPDATE en `locations` fuera de allowlist (`enriched_data`, `enrichment_status`, `updated_at`) | trigger DB de auditoría (a definir en migration aparte) |
| 4 | re-enrich detectado (POI ya `success` en este run vuelve a IA) | UNIQUE (run_id, location_id) + status check |
| 5 | Nominatim invocado | grep en logs / pre-flight: orquestador NUNCA invoca Nominatim |
| 6 | `computePoiMaturity` o marker fill tocados | invariante de código, no runtime — checklist pre-deploy |
| 7 | abort manual | `UPDATE enrichment_batch_runs SET status='paused' WHERE id=$1` — loop lo respeta |

## 9. Métricas

Campo `enrichment_batch_runs.metrics` (JSONB) actualizado tras cada item:

```json
{
  "processed": 873,
  "success": 821,
  "fail": 12,
  "skip": 38,
  "noop": 2,
  "by_skip_reason": {
    "already_enriched": 25,
    "canon_gap": 8,
    "in_progress": 3,
    "fixture": 2
  },
  "by_fail_reason": {
    "ai_timeout": 7,
    "ai_invalid_json": 3,
    "network_502": 2
  },
  "by_country": { "GB": 387, "US": 329, "IE": 52, "...": "..." },
  "elapsed_seconds": 4520,
  "estimated_remaining_seconds": 1660
}
```

## 10. Reporte final

Al alcanzar `status='completed'` o `status='aborted'`:

1. Orquestador emite `docs/audits/poi-identity-phase2-nightly-batch-<run_label>-execution.md` con:
   - processed / success / fail / skip / noop totales,
   - desglose por SkipReason y FailReason,
   - desglose por país,
   - distribución A/B/C/D post-run (re-query contra `locations`),
   - D pendientes restantes (re-query: `eligibleForAutoEnrich=true` count),
   - B pendientes restantes,
   - confirmación de invariantes (`computePoiMaturity`, marker fill, canon, Nominatim, bump),
   - rollback disponible,
   - siguiente acción recomendada.

2. CSV de items: `/mnt/documents/poi-nightly-batch/<run_label>-items.csv` con status por POI.

## 11. Resume / Restart

- **Resume:** `POST /enrich-batch-orchestrator/resume` con `{ run_id }` reanuda el loop desde el siguiente `pending`. Idempotente (claim atómico).
- **Restart:** `POST /enrich-batch-orchestrator/restart` con `{ run_id }` resetea `in_flight` huérfanos (claimed_at > 5 min sin update) a `pending` y reanuda.
- **Cron de health-check:** opcional, `pg_cron` cada 5 min ejecuta restart de runs `running` sin update reciente.

## 12. Rollback / Compensación

- **Rollback por POI:** `enriched_data` previo se snapshot-ea en `audit_logs` por `enrich-location` (comportamiento ya existente). Compensación = `UPDATE locations SET enriched_data = audit.previous WHERE id=$1`.
- **Rollback de run completo:** SELECT location_ids con `status='success' AND run_id=$1` → script de compensación que itera audit_logs y reaplica `previous`. Migración acotada bajo aprobación.
- **Conservación de scope:** CSV congelado nunca se borra; sirve como fuente de verdad del alcance autorizado.

## 13. Exclusiones (gate Fase 1, ya cableadas)

| Exclusión | Skip reason |
|---|---|
| A (identity ausente / coords inválidas) | `root_a_missing_identity` / `invalid_coordinates` |
| B canon_gap | `canon_gap` |
| B geo_partial / country_id null | `root_b_unresolved` |
| C broken/stale_name/empty | `root_c_incoherent_identity` |
| C hardError | `geo_hard_error` |
| Fixtures (sandbox uid / metadata.synthetic / beta-chain-* / e2e id) | `fixture` |
| under_review | `under_review` |
| in_progress | `in_progress` |
| unresolved | `unresolved_flag` |
| Ya enriquecido (`enriched_data.descripcion`) | `already_enriched` |
| Borrado / no aprobado | `deleted` / `not_approved` |

Ninguna de estas exclusiones requiere lógica nueva en el orquestador — todas las aplica `classifyPoiIdentityRootStatus`.

## 14. Checklist de aprobación

- [ ] Aprobar schema (tablas `enrichment_batch_runs` + `enrichment_batch_items`, RLS master-only).
- [ ] Aprobar trigger DB de auditoría de allowlist (campos permitidos en UPDATE de `locations` desde orquestador).
- [ ] Aprobar PR del edge function `enrich-batch-orchestrator` (seed / start / pause / resume / restart / status).
- [ ] Aprobar test contra CSV congelado (debe seed-ear exactamente 1.259 filas y filtrar 0 fuera).
- [ ] Aprobar dispararlo en run real (separado).

## 15. Lo que el plan NO hace

- No toca `computePoiMaturity`, marker fill, canon, paleta, `package.json`, `app-version`, README.
- No invoca Nominatim.
- No re-enriquece POIs ya enriquecidos.
- No procesa A/B/C/canon_gap/hardError/fixtures.
- No depende del sandbox para correr.
- No introduce nuevos gates por rol.
- No emite bump.

— Fin del plan v1 —

---

# Adenda v2 — Cambios obligatorios pre-aprobación

Estado: PROPUESTA v2. Sobrescribe las secciones equivalentes de v1 cuando hay conflicto. Sin ejecución (ni migración, ni código, ni IA) hasta aprobación explícita de Fase A.

## A1. Budget guard por run (sustituye §6 parcial)

Campos añadidos a `enrichment_batch_runs`:

```sql
ALTER TABLE enrichment_batch_runs
  ADD COLUMN max_ai_calls         INT  NOT NULL DEFAULT 25,    -- piloto
  ADD COLUMN max_runtime_minutes  INT  NOT NULL DEFAULT 60,
  ADD COLUMN max_error_rate_pct   INT  NOT NULL DEFAULT 5,     -- ya implícito en stop #1
  ADD COLUMN ai_calls_used        INT  NOT NULL DEFAULT 0,
  ADD COLUMN pause_reason         TEXT;                         -- p.ej. 'max_ai_calls_reached'
```

Defaults:
- Piloto (Fase B): `max_ai_calls = 25` (configurable 25 ó 50 en el seed).
- Run completo (Fase C): debe aprobarse explícitamente; sin default implícito. La llamada `seed` exige `max_ai_calls >= scope_count` con flag `confirm_full_run=true`.

Comportamiento:
- El loop incrementa `ai_calls_used` cada vez que dispatch-a `enrich-location` con verdict elegible (no cuenta skips/noops).
- Si `ai_calls_used >= max_ai_calls` ⇒ `status='paused'`, `pause_reason='max_ai_calls_reached'`. El run NO se aborta — `resume` reanuda sólo si master eleva el techo.
- Si `elapsed_minutes >= max_runtime_minutes` ⇒ `status='paused'`, `pause_reason='max_runtime_reached'`.
- Si `fail / (success+fail) > max_error_rate_pct` tras ≥50 finalizados ⇒ `status='aborted'`, `abort_reason='error_rate_exceeded'` (terminal, requiere análisis manual).
- `pause manual`: `UPDATE enrichment_batch_runs SET status='paused', pause_reason='manual'` — loop lo respeta en la siguiente iteración.

## A2. Status endpoint (nuevo)

`GET /enrich-batch-orchestrator/status?run_id=…` (master + admin lectura) devuelve:

```json
{
  "run_id": "…",
  "label": "pilot-25-20260522",
  "status": "running|paused|completed|aborted",
  "pause_reason": null,
  "abort_reason": null,
  "scope_count": 25,
  "max_ai_calls": 25,
  "ai_calls_used": 18,
  "max_runtime_minutes": 60,
  "elapsed_minutes": 42,
  "metrics": { /* §9 v1 */ },
  "next_action": "auto-resume|awaiting-approval|terminal"
}
```

## A3. Trigger DB de auditoría — acotado (sustituye §8 stop #3)

El trigger de allowlist **NO es global**. Sólo bloquea UPDATEs cuando el contexto declara que la sesión es del orquestador:

```sql
CREATE OR REPLACE FUNCTION enforce_orchestrator_update_allowlist()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  is_orchestrator boolean := COALESCE(current_setting('app.batch_orchestrator', true) = 'true', false);
BEGIN
  IF NOT is_orchestrator THEN
    RETURN NEW;  -- importers, recovery, edición manual, otros jobs => NO afectados
  END IF;
  -- Allowlist estricta para el orquestador
  IF (NEW.name              IS DISTINCT FROM OLD.name)
  OR (NEW.latitude          IS DISTINCT FROM OLD.latitude)
  OR (NEW.longitude         IS DISTINCT FROM OLD.longitude)
  OR (NEW.country_id        IS DISTINCT FROM OLD.country_id)
  OR (NEW.region_id         IS DISTINCT FROM OLD.region_id)
  OR (NEW.zone_id           IS DISTINCT FROM OLD.zone_id)
  OR (NEW.admin3_id         IS DISTINCT FROM OLD.admin3_id)
  OR (NEW.locality_id       IS DISTINCT FROM OLD.locality_id)
  OR (NEW.sublocality_id    IS DISTINCT FROM OLD.sublocality_id)
  OR (NEW.continent_id      IS DISTINCT FROM OLD.continent_id)
  OR (NEW.type_id           IS DISTINCT FROM OLD.type_id)
  OR (NEW.owner_user_id     IS DISTINCT FROM OLD.owner_user_id)
  OR (NEW.visibility        IS DISTINCT FROM OLD.visibility)
  OR (NEW.is_approved       IS DISTINCT FROM OLD.is_approved)
  OR (NEW.custom_data       IS DISTINCT FROM OLD.custom_data)
  OR (NEW.place_type        IS DISTINCT FROM OLD.place_type)
  OR (NEW.personal_category_id IS DISTINCT FROM OLD.personal_category_id) THEN
    RAISE EXCEPTION 'orchestrator_update_outside_allowlist: only enriched_data/enrichment_status/updated_at allowed';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_enforce_orchestrator_update_allowlist
BEFORE UPDATE ON locations
FOR EACH ROW EXECUTE FUNCTION enforce_orchestrator_update_allowlist();
```

Activación: el orquestador (y sólo el orquestador) ejecuta `SELECT set_config('app.batch_orchestrator', 'true', true)` (LOCAL a la transacción) antes de cada `UPDATE locations`. Cualquier otro flujo (importers, recovery, edición manual, `geocoding_jobs`, `image_recovery_jobs`, edición desde UI) NO setea el flag y por tanto NO ve restricciones nuevas. Verificación obligatoria en Fase A: tests que confirmen que importer, recovery y edición manual siguen pudiendo escribir name/coords/FKs.

## A4. Modo piloto (Fase B)

Primer run real = piloto acotado:
- `scope_count`: 25 ó 50 IDs (sub-muestra del CSV congelado, preservando distribución por país).
- `max_ai_calls`: igual al `scope_count`.
- `max_runtime_minutes`: 30.
- Subset elegido: primeros N tras ordering canónico (GB→US→IE→…), o muestreo estratificado por país (a decidir antes del seed).

Validaciones obligatorias del piloto antes de Fase C:
- métricas success/fail/skip dentro de banda esperada (<5 % fail);
- coste IA real registrado y comparado vs estimación;
- ningún re-enrich (UNIQUE + status check);
- allowlist no violada (0 excepciones del trigger);
- rollback verificado en 1 POI piloto (compensación efectiva);
- ningún A/B/C/canon_gap/hardError/fixture llegó a `success`;
- ningún Nominatim invocado (grep en logs);
- `computePoiMaturity`, marker fill, canon, paleta intactos.

Sólo si todas las validaciones pasan ⇒ se solicita aprobación de Fase C.

## A5. Rollback / Compensación (sustituye §12)

**Requisito previo:** confirmar que `enrich-location` ya snapshot-ea `enriched_data` previo en `audit_logs` antes de escribir. Si NO lo hace (a verificar en Fase A), el orquestador crea snapshot propio antes de cualquier piloto:

```sql
CREATE TABLE enrichment_batch_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES enrichment_batch_runs(id) ON DELETE CASCADE,
  location_id UUID NOT NULL,
  previous_enriched_data JSONB,
  previous_enrichment_status TEXT,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, location_id)
);
```

Flujo de snapshot:
1. Antes de despachar IA para un POI, el orquestador hace INSERT en `enrichment_batch_snapshots` con el estado actual (idempotente por UNIQUE).
2. Si la escritura de `enrich-location` triunfa, el snapshot queda como fuente de verdad del estado pre-batch.
3. Compensación por POI: `UPDATE locations SET enriched_data = s.previous_enriched_data, enrichment_status = s.previous_enrichment_status WHERE id = s.location_id` (ejecutado bajo flag orquestador para pasar trigger).
4. Compensación del piloto entero: cursor sobre `enrichment_batch_snapshots WHERE run_id=$1` aplica el rollback in bulk.

Conservación:
- Snapshot vive 90 días, luego archivado a `audit-snapshots/`.
- CSV congelado original nunca se borra.

## A6. Checklist de ejecución en 3 fases (sustituye §14)

### Fase A — Schema + Edge + Tests (SIN IA)

- [ ] Migración: tablas `enrichment_batch_runs`, `enrichment_batch_items`, `enrichment_batch_snapshots`; trigger acotado `enforce_orchestrator_update_allowlist` con flag `app.batch_orchestrator`.
- [ ] RLS master-only (lectura admin para reporting/status).
- [ ] Edge function `enrich-batch-orchestrator` con endpoints `seed | start | pause | resume | restart | status` y `confirm_full_run` para Fase C.
- [ ] Tests Deno:
  - seed exactamente 1.259 desde CSV congelado, filtra 0 fuera de scope;
  - claim atómico no entrega el mismo POI a dos procesos;
  - gate Fase 1 ejecutado pre-IA (skip silencioso, sin dispatch);
  - trigger no afecta a UPDATEs simulados de importer/recovery/edición manual;
  - trigger bloquea UPDATE fuera de allowlist cuando flag activo;
  - budget guard pausa run al alcanzar `max_ai_calls`;
  - status endpoint refleja métricas correctamente.
- [ ] Confirmación auditada: `enrich-location` snapshot-ea `enriched_data` previo en `audit_logs`. Si NO, snapshot propio activado por defecto.
- [ ] Sin IA. Sin bump. Sin tocar P1-w2. Sin Nominatim.

### Fase B — Piloto 25/50 (CON IA, scope acotado)

- [ ] Aprobación explícita de Fase A cerrada.
- [ ] Seed piloto: 25 ó 50 IDs (subset del CSV congelado).
- [ ] `max_ai_calls = scope_count`, `max_runtime_minutes = 30`, `max_error_rate_pct = 5`.
- [ ] Run real; orquestador respeta budget guard y status endpoint.
- [ ] Validar las 8 condiciones de §A4.
- [ ] Reporte: `docs/audits/poi-identity-p2-pilot-<run_label>-execution.md` con métricas + verificación rollback en 1 POI.
- [ ] Sin bump.

### Fase C — Run completo 1.259 (aprobación separada)

- [ ] Aprobación explícita de Fase B cerrada y reporte firmado.
- [ ] Seed completo con `confirm_full_run=true`, `max_ai_calls >= 1259`, `max_runtime_minutes` acordado (estimación ~4–6 h).
- [ ] Stop conditions activas (error rate, budget, manual).
- [ ] Reporte final §10 v1 + distribución A/B/C/D post-run.
- [ ] Sin bump (server-side puro).

## A7. Versionado / bump impact (sustituye §11)

- Fase A: migración + edge function nuevo + tests. **Sin código cliente. No requiere bump.**
- Fase B/C: ejecución server-side. **Sin código cliente. No requiere bump.**
- Bump sólo si en algún momento se decide exponer UI de control del orquestador (no contemplado en este plan).

## A8. Riesgos actualizados

- **R1 (resuelto):** trigger acotado por `app.batch_orchestrator` ⇒ no afecta a importer/recovery/edición manual. Validación obligatoria en Fase A.
- **R2:** lock optimista deja huérfanos `in_progress` si el orquestador cae mid-flight. Mitigación v1 (restart resetea >5 min).
- **R3 (resuelto):** budget guard `max_ai_calls` + piloto 25/50 acotan coste.
- **R4:** re-clasificación entre seed y claim infla `skip` count. Aceptable.
- **R5:** concurrencia con `enrichment_jobs` / `global_enrichment_jobs`. Lock optimista evita doble escritura; en Fase A se documenta orden de precedencia.
- **R6:** `pg_cron` opcional; restart manual disponible.
- **R7 (nuevo):** snapshot `enrichment_batch_snapshots` puede crecer rápido en Fase C. TTL 90 días + archivado documentado.

## A9. Lo que la adenda NO cambia

- Sigue prohibido: Nominatim, re-enrich, A/B/C/canon_gap/hardError/fixtures, `computePoiMaturity`, marker fill, canon, paleta, bump cliente.
- P1-w2 sigue bloqueado.
- Gates Fase 1 inalterados (ya cableados, contract tests verdes).

— Fin de la adenda v2 —
