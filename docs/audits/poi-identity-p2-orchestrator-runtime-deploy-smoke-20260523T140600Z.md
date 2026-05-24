# P2 Orchestrator — Runtime Deploy Verification + 1-POI Smoke Test

**Date:** 2026-05-23T14:06:00Z
**Scope:** Verify edge-runtime deploy parity, force redeploy, and execute a single-POI smoke test before authorizing any new pilot.
**Outcome:** ✅ Smoke test PASS. Awaiting separate approval for Pilot-25 v3.

---

## 1. Deploy verification (BEFORE)

### Code present in repository (`supabase/functions/enrich-batch-orchestrator/index.ts`, 718 lines)

| Fix | Marker | Line(s) | Status |
|-----|--------|---------|--------|
| Persistence verifier (descripcion + updated_at advance) | `success_without_persist:no_descripcion` / `:updated_at_not_advanced` | 447–448 | ✅ present |
| `apply_orchestrator_enrichment` RPC call | `client.rpc("apply_orchestrator_enrichment", …)` | 424 | ✅ present (but **bug**, see §3) |
| Incremental flush (`flushOne`) | per-item flush after every dispatch | 259, 463, 469, 475 | ✅ present |
| Watchdog endpoint | `/watchdog` → `restart_stale_batch_items` | 507, 528, 710 | ✅ present |
| Defense-in-depth bucket mapping | `DEFENSE_SKIP_REASONS` → `skip:defense_<reason>` | 234–244, 416 | ✅ present |
| Phase B pilot scope cap (≤50) when `dryRun=false` | `phase_b_pilot_scope_cap` / `phase_b_pilot_max_ai_calls_cap` | 566–573 | ✅ present |

### Runtime state observed
- Pre-deploy runtime was demonstrably **still running pre-fix code** (Pilot-25 v2 showed `ai_calls_used=0`, empty `metrics`, no persistence, old bucket `http_200:name_coordinate_mismatch`). See `poi-identity-p2-phase-b-pilot2-20260523T134844Z.md`.

---

## 2. Forced redeploy

Two explicit redeploys triggered via `supabase--deploy_edge_functions`:

1. **Deploy A** (2026-05-23 ~13:54Z) — pushed initial post-fix code.
2. **Deploy B** (2026-05-23 ~13:55Z) — pushed RPC-client fix (see §3).

Both reported `Successfully deployed edge functions: enrich-batch-orchestrator`. No batch executed during either deploy window.

No version/hash bump in `package.json` (server-only changes — per memory `Core` no-bump rule for edge/schema-only changes).

---

## 3. Defect discovered & patched during smoke

### Defect
First smoke attempt (run `9103a818-bc0f-45f1-b6b8-4d02098731f3`) returned:
```
fail · persist_rpc_error:42501
```
PostgreSQL `42501 = insufficient_privilege`.

### Root cause
`apply_orchestrator_enrichment` is `SECURITY DEFINER` and gates on `public.has_role(auth.uid(), 'master')`. The orchestrator was invoking the RPC through the **service-role client** (`client.rpc(...)`), which carries no end-user JWT → `auth.uid()` was `NULL` inside the RPC → master check failed → `42501` raised.

Critically, this is the **third manifestation of the same class of bug**: the verifier worked exactly as designed (refused to mark `success` without confirmed persistence). The new bucket mapping correctly classified it as a real `fail` (not as silent `success`).

### Fix
`supabase/functions/enrich-batch-orchestrator/index.ts` (lines 421–433): switched the `apply_orchestrator_enrichment` call from `client` (service role) to `rpcClient` (user-context client carrying the master's `Authorization` header), matching the existing pattern already used for `claim_batch_items` and `restart_stale_batch_items`.

Redeployed (Deploy B) before retrying smoke.

---

## 4. Smoke test execution

### Configuration
| Field | Value |
|-------|-------|
| Run ID (final, passing) | `019b2d79-32f3-4f1c-b773-cafc43848ab2` |
| Run ID (first attempt, persist_rpc_error) | `9103a818-bc0f-45f1-b6b8-4d02098731f3` |
| POI ID | `a66c5fa5-377c-4175-b149-679f468c244e` (Tolar Grande, AR) |
| `chunk_size` | 1 |
| `max_ai_calls` | 1 |
| `max_runtime_minutes` | 5 |
| `dryRun` | `false` |
| Baseline `updated_at` | `2026-05-11 15:01:30.59698+00` |
| Baseline `enrichment_status` | `NULL` |
| Baseline `descripcion` | absent |

### Result — final run `019b2d79…`

```
enrichment_batch_runs:
  status            = paused
  pause_reason      = max_ai_calls_reached
  abort_reason      = NULL
  ai_calls_used     = 1
  metrics           = { success: 1, fail: 0, skip: 0, noop: 0,
                        by_fail_reason: {}, by_skip_reason: {} }

enrichment_batch_items (1 row):
  status      = success
  fail_reason = NULL
  skip_reason = NULL
  attempts    = 1
  claimed_at  = 2026-05-23 13:55:28.170455+00
  finished_at = 2026-05-23 13:56:18.493+00

locations[a66c5fa5…]:
  enrichment_status                 = enriched
  updated_at                        = 2026-05-23 13:56:18.478288+00  (advanced ✅)
  length(enriched_data->descripcion) = 930 chars  (present ✅)
```

### Acceptance criteria

| Criterion | Required | Observed | Verdict |
|-----------|----------|----------|---------|
| `ai_calls_used` increments to 1 | yes | 1 | ✅ |
| `metrics` is updated (not `{}`) | yes | populated | ✅ |
| Item not left `in_flight` | yes | `success`, `finished_at` set | ✅ |
| `success` only if persistence verified | yes | desc 930 chars, `updated_at` advanced | ✅ |
| If RPC fails → item is `fail`/`noop`, never `success` | yes | first attempt: `fail · persist_rpc_error:42501` | ✅ |
| No Nominatim called | yes | no Nominatim code path invoked; allowlist trigger active in RPC tx only | ✅ |
| No `UPDATE` on `locations` outside allowlist | yes | only path = SECURITY DEFINER RPC with `app.batch_orchestrator='true'` GUC | ✅ |
| Pause on `max_ai_calls_reached` | yes | `paused`, `pause_reason=max_ai_calls_reached` | ✅ |
| Zero orphaned `in_flight` items globally | yes | `SELECT COUNT(*) WHERE status='in_flight'` → **0** | ✅ |

---

## 5. Final state

- Run `019b2d79-32f3-4f1c-b773-cafc43848ab2`: `paused` (budget exhausted, terminal-for-piloto).
- Run `9103a818-bc0f-45f1-b6b8-4d02098731f3`: `paused` (budget exhausted after `persist_rpc_error` fail). Documented as evidence of verifier correctness. No `aborted` transition needed because budget already reached; no live items remain.
- `enrichment_batch_items.status='in_flight'` globally: **0 rows**.
- Snapshots: created per run (snapshot logic unchanged).

---

## 6. Invariants

| Invariant | Status |
|-----------|--------|
| No Nominatim | ✅ |
| No re-enrich of already-enriched POIs | ✅ (Tolar Grande was unenriched) |
| No UPDATE on `locations` outside allowlist trigger | ✅ |
| `computePoiMaturity` / canon untouched | ✅ |
| Marker fill / popup contract untouched | ✅ |
| No client code bump | ✅ (server-only fix) |

---

## 7. Files touched

| File | Change |
|------|--------|
| `supabase/functions/enrich-batch-orchestrator/index.ts` | Switched persist RPC call from service-role client to user-context client (lines 421–433) |
| `docs/audits/poi-identity-p2-orchestrator-runtime-deploy-smoke-20260523T140600Z.md` | This report |

---

## 8. Recommendation

**Smoke test PASSED.** All acceptance criteria green; one latent defect (`persist_rpc_error:42501`) was discovered by the verifier itself and patched in-flight.

Request approval to proceed with **Pilot-25 v3** under the same Phase B constraints (25 IDs from frozen CSV, `max_ai_calls=25`, `chunk_size=25`, `max_runtime_minutes=30`, `max_error_rate_pct=5`, `dryRun=false`).

**Do NOT proceed without explicit approval.** No Pilot-50, no Phase C, no P1-w2.
