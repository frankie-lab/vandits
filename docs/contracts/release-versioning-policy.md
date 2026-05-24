# Release & Versioning Policy

Status: canon. Applies to every PR merged after `v1.3.19`.

## 1. Scope

Defines when a change needs **version-history entry** and when it needs an
explicit **semver bump**. The policy is automatic: every postflight MUST
answer it, no PR may merge with "release impact = no" unjustified.

## 2. Semver semantics (this repo)

- **MAJOR** (`x.0.0`) — breaking change visible to users or to public
  contracts (schema, RPC signature, capability rename, route removal).
- **MINOR** (`1.x.0`) — new user-visible feature, new operator surface, new
  capability, new public test contract, new admin panel.
- **PATCH** (`1.3.x`) — bugfix, wiring fix, UX polish, doc-only,
  performance, internal refactor, test-only.

## 3. Required fields per PR / postflight

Every postflight MUST declare, with explicit `yes/no`:

| Field | Definition |
|---|---|
| `user_visible` | A non-admin tester can perceive the change in the running app. |
| `contract_change` | Public contract changes: schema, RPC, capability id, exported helper signature, event name, route. |
| `version_history_required` | Must appear in user-facing release notes. **Required if** `user_visible=yes` OR `contract_change=yes`. |
| `bump_required` | A semver bump is required at merge. **Required if** `user_visible=yes` OR `contract_change=yes`. |
| `recommended_bump` | `none` / `patch` / `minor` / `major`. |
| `release_impact` | `yes` / `no`. Equal to `version_history_required OR bump_required`. |

`release_impact = no` is only legitimate when the change is:
internal-only (no UI surface, no contract change) **and** is doc-only,
test-only, refactor with no behaviour change, or bug fix on a not-yet-shipped
feature in the same release line.

## 4. Aggregation rule (release-level)

For a release cut (e.g. `v1.3.19 → v1.3.20`):

```
recommended_release_bump = max(recommended_bump of every block in window)
   patch < minor < major
```

If any block has `version_history_required = yes`, the release notes for that
version MUST list it.

## 5. Forbidden patterns

- "Release impact: no" without justification mapped to §3.
- Marking `bump_required = no` while `user_visible = yes`.
- Deferring bump decision to "a future PR".
- Editing version-history retroactively without an audit doc.
- Mixing pending features with closed work inside the same release cut.

## 6. Gate

A PR is **NOT mergeable** unless its postflight has every §3 field filled.
A release cut is **NOT publishable** unless an audit document
(`docs/audits/release-versioning-<window>-audit.md`) exists, reviews every
block in the window, and decides the next version explicitly.

## 7. Stable references

- Template: `docs/templates/postflight-template.md`
- Closure example: `docs/audits/post-v1-3-19-functional-closure.md`
- First audit under this policy: `docs/audits/release-versioning-post-v1-3-19-audit.md`
