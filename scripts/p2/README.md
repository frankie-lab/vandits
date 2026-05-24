# P2 Dev Runner — `dev-run-poi-identity-p2`

> **Internal, temporary, maintenance-only.** This tool exists exclusively
> to drain the historical P2 queue of D POIs that are still pending
> auto-enrich. It is **not** a UX panel, **not** a user feature, and
> **not** a permanent product flow. Once the P2 queue is empty,
> generate a final closure report and leave this script untouched
> except for contingencies. The normal future flow stays:
>
> ```
> new POI → A/B/C/D classification → if D, normal enrichment
> ```

See `docs/audits/poi-identity-p2-dev-runner-plan.md` for the full plan.

---

## Prerequisites

```
export SUPABASE_URL=...                  # or VITE_SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY=...     # master-equivalent, server-side only
```

Run with Deno (already installed in the sandbox):

```
deno run -A scripts/p2/dev-run-poi-identity-p2.ts <command> [flags]
```

---

## Commands

| Command | Side-effects | Notes |
|---|---|---|
| `status [--json]` | none (read-only) | snapshot of active + last terminal run + D-remaining + Pilot-100 gate |
| `report [--run-id <uuid>]` | writes `docs/audits/poi-identity-p2-<label>-<created_at>.md` | overwrite-safe; deterministic path |
| `close-current` | minimal: watchdog OR abort+report OR report-only | inspects active run, applies the right closure |
| `pause --run-id <uuid> [--reason <text>]` | POST `/pause` | confirm before running |
| `resume --run-id <uuid>` | POST `/start` (background) | requires paused, sane run |
| `abort --run-id <uuid> --reason "<text>"` | UPDATE `enrichment_batch_runs.status='aborted'` | reason mandatory |
| `next-batch [--size 25\|100\|250] [--confirm]` | seed + start | `size > 100` requires `--confirm` AND Pilot-100 PASS |

---

## Decision tree

1. `status` — always start here.
2. Active run still running and healthy ⇒ do nothing.
3. Active run terminal or stuck ⇒ `close-current`.
4. Last run PASS + no active ⇒ `next-batch --size <N>`:
   - Until Pilot-100 PASS ⇒ only `--size 25` or `--size 100`.
   - After Pilot-100 PASS ⇒ `--size 250 --confirm` per tanda.
5. Repeat 1–4 until `D remaining == 0`.
6. Emit final closure report and stop.

---

## Hard rules (enforced in code)

- D-only seeding (canonical `classifyPoiIdentityRootStatus`).
- Excludes A, B-unresolved, C, canon_gap, fixtures, hardError,
  already enriched, in_progress, deleted, not_approved.
- Excludes historical POIs: Tolar Grande, Eisriesenwelt,
  Burg Hochosterwitz, Mattsee.
- `chunk_size = 1`, `confirm_full_run = true` when `size > 50`.
- Writes only the allowlist (`enriched_data`, `enrichment_status`,
  `updated_at`) — enforced by the orchestrator + DB triggers.
- Never calls Nominatim, never touches canon, marker fill,
  `computePoiMaturity`, FKs, admin geography, or P1-w2.

---

## Stop conditions

- `error_rate > 5%` with ≥50 finalised items.
- Any success with empty `enriched_data.descripcion` post-flush.
- Orphan `in_flight` with `claimed_at < now() - 5 min` AND `attempts >= 3`.
- UPDATE outside allowlist (item lands as `fail` via DB trigger).
- Literal `nominatim` mention in errors.

---

## Tests

```
deno test -A scripts/p2/__tests__/
```

---

## Lifecycle

After the P2 queue is empty:

1. Run `report` against the last terminal run as the closure report.
2. Commit the closure report.
3. Leave this CLI in the repo as dev-only / maintenance-only.
4. Do **not** expose in UI.
5. Do **not** turn it into a recurring user flow.
