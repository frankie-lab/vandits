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

— Fin del plan —
