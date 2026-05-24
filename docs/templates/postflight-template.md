# Postflight — <PR / Block name>

> Copy this file to `docs/audits/<block-slug>-postflight.md` and fill every
> section. Sections marked **MANDATORY** block merge if missing.

## 1. Summary

One paragraph: what shipped, why it shipped.

## 2. Files changed

- `path/to/file.tsx`
- ...

## 3. Tests executed

- `path/to/test.test.ts` (N/N green)

## 4. Visual validation

Where applicable. Screenshots or "n/a (no UI surface)".

## 5. Release impact — MANDATORY

Per `docs/contracts/release-versioning-policy.md` §3. All fields required.

| Field | Value | Justification |
|---|---|---|
| `user_visible` | yes / no | … |
| `contract_change` | yes / no | … |
| `version_history_required` | yes / no | … |
| `bump_required` | yes / no | … |
| `recommended_bump` | none / patch / minor / major | … |
| `release_impact` | yes / no | derived = `version_history_required OR bump_required` |

If `release_impact = no`, justify against §3 (internal-only AND
doc/test/refactor/bugfix-in-unshipped-feature).

## 6. Decision — MANDATORY

`DECISIÓN: APROBADO` / `DECISIÓN: NO APROBADO` with one-line reason.
