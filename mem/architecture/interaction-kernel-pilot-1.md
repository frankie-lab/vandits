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
