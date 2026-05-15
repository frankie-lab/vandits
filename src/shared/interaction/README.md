# `src/shared/interaction/` — Pilot kernel

Stateless helpers extracted during **Pilot 1** of the interaction
primitives consolidation (see `docs/interaction-primitives.md` and
`docs/interaction-pilot-1-diff.md`).

## Surface

- `buildOpId(prefix)` — canonical opId generator (`prefix#nonce`).
- `resolveSelectableState({ active, count? })` — `'idle' | 'active' | 'disabled'`.
- `runSelectable({ source, wasActive, onAlways, onChange?, onReplay? })`
  — orchestrates the change/replay/always decision.

## Hard rules

- Pure functions. No React. No hooks. No global state beyond the
  pre-existing `traceCameraFit` ring buffer.
- No camera, no subset-fit, no listener mutations.
- If a primitive does not generalise, document it in the diff doc and
  leave the call site bespoke. Do **not** force uniformity.

## Pilot consumers

1. `src/components/toolbar/MyCatalogQuickFilters.tsx`
2. `src/components/FilterBar.tsx` (Health chips block only)
3. `src/components/UsersSidebar.tsx` (`handleFilterByUser` only)

Any other call site is **out of pilot scope**.
