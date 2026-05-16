---
name: Interaction kernel pilot 1
description: Pilot kernel under src/shared/interaction/ — Selectable + degraded Replayable on MyCatalog popover, FilterBar health chips, UsersSidebar row. Camera/subset-fit untouched.
type: feature
---

**Status**: shipped pilot, NOT a global primitive. Do not extend to new
surfaces without a fresh pilot review.

**Kernel** (`src/shared/interaction/selectable-kernel.ts`):
- `buildOpId(prefix)` — canonical opId generator (`prefix#nonce`).
- `resolveSelectableState({ active, count? })` → `'idle' | 'active' | 'disabled'`.
- `runSelectable({ source, wasActive, onAlways, onChange?, onReplay? })`
  — single decision point for change vs replay vs always.

**Pilot consumers (exhaustive)**:
1. `MyCatalogQuickFilters.applyRow` — `onChange` mutates filters,
   `onReplay` omitted (recenter happens via re-emitted event).
2. `FilterBar` Health chips — `onReplay` toggles off (pre-existing
   semantics; documented friction).
3. `UsersSidebar.handleFilterByUser` — `onReplay` re-emits subset-fit
   for `user-filter` (closes silent-noop gap).

**Hard rules**:
- Stateless. No React. No hooks. No new globals/providers/stores.
- Reuses `traceCameraFit` ring buffer; no new trace channel.
- Does NOT import `subset-fit.ts`. Camera contract untouched.

**Friction documented** (`docs/interaction-pilot-1-diff.md` §3):
- `Replayable` is NOT universal: split into `Replayable.recenter` vs
  `Replayable.toggle` before next pilot.
- `runFocusEmit` was dropped (would have been a no-op wrapper).
- Trace coupling to camera buffer is intentional pilot pragmatism.

**Premature primitives**: `OverlaySurface`, `BlockingOperation` feedback,
`ObservableAction`, `StatefulSelection`, `ContextualSurface`,
`StatusSurface`, `DismissibleSurface`, formal `FocusEmitter` — none
extracted. See pilot diff §6.

**Out of scope (do NOT migrate without new pilot)**: markers,
selection-fit-on-start, useHealthFilterFit, collection-auto-fit,
HealthRepairPreviewDialog, all other sidebar panels, FilterBar
dismissable chips, SourceFilterBridge, LocationCollectionChips,
PlaceTypeFilter, PanelModeTabs.

---

## Update — Replayable split ratified (docs only)

`Replayable` (original §1.2) is **deprecated**. Split into two
candidate contracts validated by — and only by — the three Pilot 1
surfaces:

- **`RecenterableSelection`** (§1.2a): re-click on active MAINTAINS
  selection and RE-EMITS focus/fit with fresh `opId`.
  Pilot sites: `MyCatalogQuickFilters`, `UsersSidebar.handleFilterByUser`.
- **`ToggleableSelection`** (§1.2b): re-click on active CLEARS the
  axis (`null`/default), emits trace with fresh `opId`, NO focus/fit
  re-emit. Pilot site: `FilterBar` Health chips.

**`runSelectable` status**: `pilot-frozen` / transitional. **MUST NOT**
be extended to new call sites. Replaced in Pilot 2 by
`runRecenterableSelection` + `runToggleableSelection`.

**Deprecations**: `buildUniqueMyCatalogPopoverOpId` marked `@deprecated`
(JSDoc only). Use `buildOpId('mycatalog-popover')` from the kernel.

**Risk recorded**: `traceSelectable` entries live in
`window.__cameraFitTrace` as a pragmatic pilot decision; must migrate to
a dedicated `ObservableAction` channel before the kernel grows.

**Zero behavior change in this update.** Docs + one `@deprecated`
JSDoc tag. No call sites touched, no camera/subset-fit changes.
