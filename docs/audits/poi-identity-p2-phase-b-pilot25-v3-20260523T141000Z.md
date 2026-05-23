# P2 Orchestrator — Pilot-25 v3 (Interim Report, mid-run)

**Date:** 2026-05-23T14:03:30Z
**Run ID:** `6b44e704-0539-4af6-bc76-23a0c9a02a92`
**Status at report time:** `running` (mid-flight, awaiting watchdog window)

---

## 1. Scope (24 IDs — 25 minus already-enriched Tolar Grande)

Frozen P2 CSV subset reused from Pilot v2 (`f5485406-…`), with `a66c5fa5-377c-4175-b149-679f468c244e` excluded per directive (now enriched in smoke).

```
AR  febaddaa-4c21-4361-b1e3-38fecabcc0cb  Catamarca
AR  59286b30-cebf-4d8c-be48-f87a1c84a7ca  Cementerio de la Recoleta
AR  6b872a54-0d20-443e-9663-0409d5a1ff23  Funes
AT  286a8239-5ea8-4f31-9918-f475b7601ca7  Alpbach
AT  7179bdd7-d418-4520-90b0-2d6c1abbcc43  Burg Hochosterwitz
AT  bd22e678-29f4-42fa-9b88-3239ac2c9d63  Eisriesenwelt
AT  55ddc895-6833-4cb8-814b-627608f1a669  Hohenwerfen Castle
AT  8da1f8b9-07f3-489c-be4c-b9bf5b8cbdb0  Kreuzenstein Castle
AT  a22b1716-37ca-44c2-9a2f-1ed258a32fc7  Mattsee
AT  2492248c-cdfc-4335-b961-5a26450984ce  Riegersburg
AT  3f280875-e3aa-4ed2-8832-c5207d39802b  Schichenauerstraße
AT  20dbd409-eead-486d-b45c-d3c1eb2aa967  Schmetterlinghaus
AT  ba9365f8-9306-4787-842b-a6fafbff87d5  Schönbühel-Aggsbach
AT  e0c89f8f-69b8-466f-a63e-3410c44bb4d5  St. Peter Stiftskulinarium
AT  c64cad18-7ccb-44eb-a30f-80cf56d4066a  Stephansdom Crypt
AT  58e1a7bc-6e38-4507-a242-ad38b21d6b3c  Zentralfriedhof
AU  d0eb9fb8-958f-4f2e-949b-c670465bd16d  Bahía de Botany
AU  d1e95f00-a64c-430b-87a0-ebc329ae8074  Playa de Manly
BE  47058b1e-18f3-40f7-85b5-ef8ff6caa873  Dinant
BG  698a7eba-6619-4920-af7b-db221b632825  Asenova krepost
BG  7dc9cbf0-d90f-4ef7-b862-8d9393a0be3f  Devetashka Cave
BG  1f447669-b54b-474d-b03f-2f2fbf52e90a  Musala
BG  94d297ad-c71c-4e9e-8c8d-d793deb52290  Plovdiv
BG  3e150792-769a-4959-b628-7b1ccd93c15f  Siete lagos de Rila
```

Seed accepted: `scope_count=24, status=pending`.

## 2. Config

`chunk_size=25, max_ai_calls=25, max_runtime_minutes=30, max_error_rate_pct=5, dryRun=false, confirm_full_run=false`.

## 3. State at T+3min

```
runs.status         = running
runs.ai_calls_used  = 5  (✅ incremental flush working)
runs.metrics        = { success: 4, fail: 0, skip: 1, noop: 0,
                        by_skip_reason: { defense_name_coordinate_mismatch: 1 },
                        by_fail_reason: {} }
items.success       = 4
items.skip          = 1   (defense_name_coordinate_mismatch ✅ bucket mapping correct)
items.in_flight     = 19
items.pending       = 0
```

**Positive signals (all fixes live in runtime):**
- `ai_calls_used` increments per item (not stuck at 0).
- `metrics` populated with structured breakdown.
- New bucket mapping `defense_name_coordinate_mismatch` (vs old `http_200:name_coordinate_mismatch`).
- Persistence verifier active (smoke test in §5.2 of the smoke report proved RPC writes flow).

## 4. Operational note — gateway timeout

The single `/start` HTTP invocation was cancelled by the tool gateway (60s read timeout). The orchestrator processes items serially (~50s/item), so a chunk_size=25 chunk cannot drain in one HTTP call. **Items will remain `in_flight` until the watchdog (5-min stale threshold) resets the orphans and a follow-up `/start` re-claims them.**

This is a tooling/orchestration mechanic, NOT a stop condition: `ai_calls_used` and `metrics` are flushing per item (proven by current values), so the wedge mode from Pilot v1/v2 is NOT reproducing.

## 5. Required follow-up (manual, next session)

Operator must drive the run to terminal state with this loop:

```
1.  Wait ≥5 minutes since last claim
2.  POST /enrich-batch-orchestrator/watchdog   (resets stale in_flight → pending)
3.  POST /enrich-batch-orchestrator/start { run_id, dryRun:false }
4.  Repeat until status ∈ {paused:max_ai_calls_reached, completed, aborted}
```

Hard cap `max_ai_calls=25` will pause the run regardless.

## 6. Invariants (confirmed so far)

- No Nominatim path invoked.
- All persistence via SECURITY DEFINER RPC `apply_orchestrator_enrichment` (allowlist trigger active for tx only).
- Snapshots created (table populated per claim).
- Defense-in-depth skips correctly bucketed (not contaminating error_rate).
- No version bump.

## 7. Recommendation (deferred until terminal state)

Decision pending — final report to be appended after run reaches terminal state, covering: per-item evidence of persistence (locations.updated_at, descripcion length), final ai_calls_used vs max, error rate, snapshot count, rollback availability, and recommendation among {pilot-50, repeat pilot-25, stop}.

**Until then: no Pilot-50, no Phase C.**
