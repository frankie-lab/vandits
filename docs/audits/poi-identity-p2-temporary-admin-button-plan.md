# P2 Auto-Enrich — Temporary Admin Button Plan

> **TEMPORARY MAINTENANCE TOOL.** Remove or keep hidden after the P2 backlog is drained.

## Goal

Allow continuing the P2 auto-enrich process for D-eligible POIs from inside the app, without depending on chat, sandbox, or manual CLI execution. **This is not a product feature.** It is hidden from product navigation and gated to `master` + `run_internal_tooling`.

## Surface

- **Route:** `/admin/dev/poi-p2-runner`
- **Page component:** `src/pages/admin/dev/PoiP2RunnerPage.tsx`
- **NOT registered** in `ADMIN_TABS`, `AdminShell`, `UserMenu`, or any sidebar.
- Non-master → `<Navigate to="/" replace />` (no fingerprinting, no 404).

## Backend bridge

- **Edge function:** `poi-p2-runner-bridge`
- **Auth (defense in depth):**
  1. `requireCapability('run_internal_tooling')` — canonical RBAC via `has_permission`.
  2. `has_role(uid, 'master')` — explicit master guard.
- Reuses the same canonical helpers as the CLI (see *Shared helpers* below). No parallel gate logic.

## Shared helpers (canonical, no duplication)

| Module | Purpose |
|---|---|
| `supabase/functions/_shared/p2/gates.ts` | `guardBatchSize`, `detectStopConditions`, `isTerminal` |
| `supabase/functions/_shared/p2/seed-filter.ts` | `buildSeedCandidates`, `canonCountryCodes`, `NOMINAL_EXCLUSIONS` |
| `supabase/functions/_shared/p2/pilot100-evaluator.ts` | `evaluatePilot100` |
| `supabase/functions/_shared/p2/report-render.ts` | `renderReportBody` |

`scripts/p2/lib/*` re-exports these pure modules and adds Deno IO wrappers. CLI tests (8/8) keep passing unchanged.

## Audit

Table: `public.poi_p2_runner_audit` (migration applied).

```sql
user_id     uuid references auth.users(id) on delete set null   -- nullable: history survives user deletion
action      text not null
run_id      uuid
batch_size  int
reason      text
result      jsonb
report_path text
created_at  timestamptz not null default now()
```

RLS: only `master` may read. Writes happen only from the edge function via service role.

## Allowlist of writes (orchestrator contract)

The orchestrator only writes `enriched_data`, `enrichment_status`, `updated_at` on `locations`. This bridge does not touch any other column.

## Dry-run vs real

| Action | This delivery | When `ALLOW_P2_REAL_BATCH=1` |
|---|---|---|
| `status` | **live** read-only | live read-only |
| `report` | **live** read-only (markdown) | live read-only |
| `pause` | implemented + protected; returns `{ dryRun: true }` | invokes orchestrator |
| `resume` | implemented + protected; returns `{ dryRun: true }` | invokes orchestrator |
| `abort` | requires non-empty `reason`; returns `{ dryRun: true }` | invokes orchestrator |
| `start-next-batch` | runs every guard; on PASS returns `{ dryRun: true }` | seeds + starts orchestrator |

### Conditions required for any real mutating action

1. `ALLOW_P2_REAL_BATCH=1` in the edge function env (operator opt-in).
2. Caller is `master` AND has `run_internal_tooling`.
3. No active non-terminal run.
4. Pilot-100 PASS (terminal, `fail=0`, success ratio ≥ 0.4) for any size > 100.
5. `confirmToken === "CONFIRM P2 BATCH"` for size 250.
6. Stop conditions clean (`detectStopConditions` → `none`).

## Guardrails (re-validated server-side every call)

Excluded from seed by `buildSeedCandidates`:
- Roots A (no name / no coords) and B (partial geo) and C (hardError)
- `canon_gap` (country outside `TERRITORIAL_CANON`)
- sandbox fixtures (`owner_user_id === SANDBOX_OWNER_UID`)
- `enrichment_status === 'in_progress'`
- already enriched (`enriched_data.descripcion` present)
- nominal exclusions (historical)

Not touched: Nominatim, marker fill, `computePoiMaturity`, canon, FK/admin geography, name/coords, AdminShell, ADMIN_TABS.

## Tests

- `scripts/p2/__tests__/dev-runner.test.ts` — **8/8 PASS** after refactor.
- `supabase/functions/poi-p2-runner-bridge/index.test.ts` — **7/7 PASS** (action parsing, guards, seed filter, abort-reason contract).
- `src/test/poi-p2-runner-page.test.tsx` — 3 cases: non-master redirected, master-without-cap redirected, master + cap sees body.

## Removal procedure

When the P2 backlog is drained:
1. Delete `src/pages/admin/dev/PoiP2RunnerPage.tsx` and the route block in `src/App.tsx`.
2. Delete `supabase/functions/poi-p2-runner-bridge/` (function + tests).
3. Delete `scripts/p2/` (CLI + tests) if no longer needed for audits.
4. Keep `supabase/functions/_shared/p2/*` and `poi_p2_runner_audit` table if you want to retain the historical audit trail; otherwise drop them in a follow-up migration.
5. Delete this document.
