# P2 Orchestrator — Infra Fix Report (snapshot idempotency + background drain)

**UTC:** 2026-05-23T14:20:00Z
**Status:** code fixes landed, deployed, 30/30 tests green, **no new pilot executed**.
**Scope:** unblocks the two structural defects detected in Pilot-25 v3
(Run `6b44e704-0539-4af6-bc76-23a0c9a02a92`). No business-logic
changes, no canon changes, no IA executed.

---

## 1. Causa raíz

### Fix 1 — Snapshot idempotency

`processChunk` in `enrich-batch-orchestrator/index.ts` issued a raw
`INSERT INTO enrichment_batch_snapshots` per item attempt. The table
has `UNIQUE(run_id, location_id)`. The FIRST orphan-recovery path ever
exercised in production hit the constraint:

```
item 985f46c5… (location 286a8239…, attempts=2)
  attempt 1 → snapshot row created (taken_at=T0)
  watchdog reset → item back to pending
  attempt 2 → INSERT fails: duplicate key value violates unique
              constraint enrichment_batch_snapshots_run_id_location_id_key
  orchestrator → applyAbort(snapshot_failure) → entire run halted
```

The original `INSERT` could not distinguish "duplicate of my own prior
snapshot" (benign) from "FK / permission / write error" (fatal).
Result: any single watchdog reset aborted the run before any retry
could succeed.

### Fix 2 — Chunking vs gateway timeout

`handleStart` ran `processChunk` synchronously in the HTTP handler. With
~50s/item and `chunk_size=25`, a single chunk needs ~1250s. The Supabase
gateway cancels any single HTTP invocation at ~60s, so every live
dispatch chunk was guaranteed to leave items `in_flight` when the
request was killed. Recovery required watchdog + manual `/start`
reinvocation, which then tripped Fix 1.

---

## 2. Decisión arquitectónica

### Snapshot

`INSERT … ON CONFLICT (run_id, location_id) DO NOTHING` (via
`upsert(..., { ignoreDuplicates: true })`). The FIRST snapshot is
canonical; every subsequent attempt is a soft no-op. The original
`previous_enriched_data` / `previous_enrichment_status` are NEVER
overwritten by post-write values, so rollback semantics remain valid
across retries.

A real DB error (permission denied, FK violation, etc.) still surfaces
as `snapshot_failed:<msg>` and aborts the run — only the duplicate-key
class is downgraded to "alreadyExisted".

### Chunking — Option C: real background execution

Of the four options on the table (A: chunk=1, B: small chunk, C: real
background, D: cron/worker), Option C was selected:

- `/start` returns **202 Accepted** immediately with `{ run_id, mode:
  "background", started:true, poll: "/status?run_id=…" }`.
- The processing loop runs detached via `EdgeRuntime.waitUntil(...)`
  until the run reaches `completed | aborted | paused` or hits the
  `maxChunksPerInvocation` safety cap (default 200, was 50).
- All progress is flushed per-item to the DB (`flushOne`), so
  `/status` remains the authoritative source.
- `body.foreground === true` keeps the legacy blocking mode for the
  smoke test and unit harnesses that need a synchronous result.

Why C over A/B/D:
- A (chunk=1 synchronous) still needs ~25 manual invocations per
  pilot — operationally fragile.
- B (chunk small synchronous) only delays the problem; >1 item per
  invocation still risks orphans.
- D (cron) requires `pg_cron` plumbing and obscures progress for the
  operator.
- C lets the existing operator UX (`/seed` → `/start` → poll
  `/status`) work end-to-end with a single click, and watchdog +
  pause-on-budget already provide the safety net we need.

Constraints preserved:
- `max_ai_calls` enforced per-item inside `processChunk`.
- Manual `/pause` honoured: `evaluateBudget` rejects further claims
  when `status='paused'`.
- Error-rate abort still triggered after ≥50 finalised items.
- Watchdog (`/watchdog`) still required for crash recovery (background
  workers can be killed by edge-runtime maintenance just like
  foreground ones); now safe because re-claim is idempotent.

---

## 3. Archivos modificados

- `supabase/functions/enrich-batch-orchestrator/snapshot.ts` *(new)* —
  pure helper `recordPreDispatchSnapshot()` returning
  `{ ok, alreadyExisted }` or `{ ok:false, error }`. Mockable, no
  Supabase types leak.
- `supabase/functions/enrich-batch-orchestrator/snapshot.test.ts` *(new)* —
  6 Deno tests covering:
  - first attempt creates row;
  - second attempt does NOT fail;
  - second attempt does NOT overwrite original `previous_*`;
  - distinct `(run_id, location_id)` creates separate rows;
  - real DB errors still surface as `ok=false`;
  - Pilot-25 v3 regression (exact run/location IDs) — watchdog re-claim
    survives without abort.
- `supabase/functions/enrich-batch-orchestrator/index.ts` —
  - `processChunk` snapshot section: uses `recordPreDispatchSnapshot`
    instead of raw insert; aborts only on real errors.
  - `handleStart`: extracted `drain()` closure; default mode is
    background via `EdgeRuntime.waitUntil`; returns 202 immediately;
    `foreground:true` preserves the blocking path.

## 4. Migraciones

**Ninguna.** The table already has `UNIQUE(run_id, location_id)` (see
`supabase/migrations/20260522091857_…sql:92`). The fix is purely
client-side (PostgREST upsert with `onConflict`). No DDL change, no
RLS change, no canon change.

## 5. Tests

```
deno test supabase/functions/enrich-batch-orchestrator/
  budget.test.ts          13/13
  dispatch-outcome.test.ts 11/11
  snapshot.test.ts          6/6
Total                      30/30 PASS  (288ms)
```

Background-mode (`/start` returning 202 + `EdgeRuntime.waitUntil`) is
NOT unit-tested — `EdgeRuntime` is a runtime-only global. Validation
must come from the smoke run (see §7).

## 6. Limpieza de runs anteriores

**No requerida para esta entrega.** Estado actual:

- Run `4f3e91ee-…` (Pilot v1) — `aborted` (superseded), 19 in_flight
  preservados como testigo del bug original.
- Run `f5485406-…` (Pilot v2) — terminal.
- Run `6b44e704-…` (Pilot-25 v3) — `aborted` (`snapshot_failure`), 0
  in_flight, 4 success persistidos legítimos, 1 skip defense, 18 items
  cerrados como `aborted_with_run:snapshot_idempotency_bug`.
- Run `019b2d79-…` (smoke 1-POI) — `paused:max_ai_calls_reached`,
  Tolar Grande enriched.

Snapshots conservados 90 días. Rollback disponible para cualquiera de
los 4 success v3 si se requiere (no recomendado: son legítimos).

Cuando se abra el smoke posterior, se usará un **run nuevo** (no
reaprovechar ninguno de los anteriores).

## 7. Invariantes confirmadas

- ✅ Sin Nominatim invocado.
- ✅ Sin re-enrich (gate `already_enriched` intacto).
- ✅ Sin UPDATE fuera de allowlist (trigger + RPC GUC sin cambios).
- ✅ Snapshots disponibles, rollback documentado.
- ✅ Marker fill / `computePoiMaturity` / canon territorial intactos
  (no se tocó código cliente ni canon).
- ✅ No bump (cambios sólo server-side: edge function).
- ✅ No P1-w2.

## 8. Recomendación posterior

**Smoke 1-POI primero, NO piloto-25 v4 todavía.**

Plan sugerido (todos requieren aprobación explícita por separado):

1. **Smoke 1-POI con `/start` background**:
   - Nuevo run con 1 POI D válido.
   - `dryRun=false`, `max_ai_calls=1`, `chunk_size=1`.
   - Validar que /start devuelve 202, /status converge a `paused`
     o `completed`, 0 in_flight, persistencia verificada.
   - Sin watchdog necesario (1 ítem, sin reset).
2. **Smoke orphan-recovery**:
   - Run con 2 POIs, `chunk_size=2`.
   - Tras el primer flush, llamar `/watchdog` manualmente con
     `stale_minutes=0` para forzar reset del segundo.
   - Re-invocar `/start`. Verificar que el snapshot duplicado NO
     aborta el run y que el segundo POI completa.
3. Si ambos smokes pasan → aprobación para **piloto-5** (no
   piloto-25) como puente.
4. Si piloto-5 limpio → piloto-25.
5. Phase B se considera validado tras piloto-25 limpio en modo
   background.

**Bloqueado hasta aprobación:**
- piloto-25 v4, piloto-50, Phase C, P1-w2, Nominatim, marker fill,
  computePoiMaturity, bump.
