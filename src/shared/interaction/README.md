# `src/shared/interaction/` — Pilot kernel

Stateless helpers extracted during **Pilot 1** of the interaction
primitives consolidation (see `docs/interaction-primitives.md` and
`docs/interaction-pilot-1-diff.md`).

## Status: **pilot-frozen / transitional**

`runSelectable` is a transitional helper kept alive ONLY for the three
surfaces migrated in Pilot 1. **Do NOT extend it to new call sites.**

Pilot 1 demonstrated that the original `Replayable` contract collapses
two opposite product intents into one syntactic shape. The contract has
been split into two candidates (see `docs/interaction-primitives.md`
§1.2a / §1.2b), validated by — and only by — the three pilot surfaces:

| Future contract | Pilot 1 call sites | Re-click on active |
|---|---|---|
| `RecenterableSelection` | `MyCatalogQuickFilters`, `UsersSidebar.handleFilterByUser` | maintain selection, re-emit focus/fit with fresh `opId` |
| `ToggleableSelection`   | `FilterBar` Health chips | clear axis to `null`/default, emit trace with fresh `opId`, no focus/fit re-emit |

Replacement helpers (NOT yet implemented):

- `runRecenterableSelection`
- `runToggleableSelection`

These will land in **Pilot 2** along with a migration of one non-pilot
surface from each family. Until Pilot 2 ships, `runSelectable` stays
frozen as-is and no new consumer is added.

## Surface (Pilot 1)

- `buildOpId(prefix)` — canonical opId generator (`prefix#nonce`).
- `resolveSelectableState({ active, count? })` — `'idle' | 'active' | 'disabled'`.
- `runSelectable({ source, wasActive, onAlways, onChange?, onReplay? })`
  — transitional decision point. Exposes both `onChange` and `onReplay`
  to absorb the divergence between the two contracts. Omitting
  `onReplay` silently collapses recenter intent into a no-op — exactly
  why the contract is being split.

## Hard rules

- Pure functions. No React. No hooks. No global state beyond the
  pre-existing `traceCameraFit` ring buffer.
- No camera, no subset-fit, no listener mutations.
- If a primitive does not generalise, document it in the diff doc and
  leave the call site bespoke. Do **not** force uniformity.

## Risk: trace channel coupling

`runSelectable` writes its trace entries (`selectable-kernel.run`) into
`window.__cameraFitTrace` via `traceCameraFit`. This is **pilot
pragmatism**, not the definitive channel: the buffer name conflates
camera intent with selection intent and will need to migrate to a
dedicated `ObservableAction` log before the kernel grows beyond the
pilot. See `docs/interaction-pilot-1-diff.md` §10.

## Pilot consumers (exhaustive, do NOT add more)

1. `src/components/toolbar/MyCatalogQuickFilters.tsx`
2. `src/components/FilterBar.tsx` (Health chips block only)
3. `src/components/UsersSidebar.tsx` (`handleFilterByUser` only)

Any other call site is **out of pilot scope** and must wait for Pilot 2.
