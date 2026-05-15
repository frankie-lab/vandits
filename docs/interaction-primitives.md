# Interaction Primitives — Architectural Consolidation

> Status: **CONSOLIDATION ONLY**. No implementation, no file moves, no new
> hooks, no camera/subset-fit changes. Companion document to
> `docs/interaction-grammar-discovery.md`. Names below are provisional and
> serve as architectural anchors, not API contracts.

---

## 1. Primitive candidates

Each primitive is described as a **behavioral contract**, not an
implementation. The same primitive may be implemented as a hook, a
component, a higher-order wrapper, or a convention enforced by lint —
that decision belongs to the extraction phase.

### 1.1 `Selectable`

- **Purpose**: a surface whose semantic role is to be picked out of a
  set (filter row, sidebar entry, chip, tab, popover row).
- **Invariants**:
  - Exactly one of: `interactive` or `disabled`. No third state.
  - Click always emits an observable event with a unique `opId`.
  - `active` is a projection of upstream state, never local state.
- **Lifecycle**: `idle → (click) → emit(opId) → upstream resolves →
  re-render with new active`.
- **Permitted side effects**: emit selection event, request close of
  enclosing `OverlaySurface`, request `FocusEmitter` replay.
- **Prohibited**: silent early-return on "already active", local
  optimistic active that diverges from store, swallowing event when
  count is zero (must be `disabled` instead).
- **Observability**: every click traceable via `opId` + `axis` +
  `value` + `wasActive`.
- **QA contracts**:
  - re-click on `active` produces a new `opId` and a new event.
  - `disabled` produces zero events.
  - first click on `idle` flips `active` exactly once.
- **Ownership**: shared/core (UI primitive layer).

### 1.2 `Replayable`

- **Purpose**: an action whose side effect is idempotent in state but
  meaningful in time (recenter, refit, refresh, reopen).
- **Invariants**:
  - Re-invocation must re-execute the side effect, not skip it.
  - Each invocation carries a fresh `opId`.
  - Replay never mutates state that wasn't going to change anyway.
- **Lifecycle**: `invoke(opId₁) → side-effect → invoke(opId₂) →
  side-effect`.
- **Permitted**: dispatch identical downstream event with new id;
  trigger camera/focus subscribers.
- **Prohibited**: dedupe by payload equality; silent coalescing without
  surfacing it; reuse of last `opId`.
- **Observability**: `totalRequests` monotonically increases per click.
- **QA contracts**:
  - N clicks → N events → N side-effect dispatches.
  - Trace contains N entries with distinct `opId`s.
- **Ownership**: shared/core.

### 1.3 `FocusEmitter`

- **Purpose**: a surface that requests a viewport / entity focus
  change without owning the camera.
- **Invariants**:
  - Emits a typed request (`{ kind, ids|id, mode, reason }`); never
    calls camera or view code directly.
  - `reason` belongs to a canonical enum.
  - Idempotent at the emitter level; subscriber decides cooldown /
    bounds / clamp.
- **Permitted**: dispatch via existing `requestSubsetFit` (camera) or
  an analogous entity-focus channel `[future, not in scope]`.
- **Prohibited**: imperative `map.fitBounds`, direct `flyTo`, route
  manipulation, sidebar scroll-into-view bypassing the channel.
- **Observability**: every emit captured in the camera trace
  (`window.__cameraFitTrace` already exists).
- **QA contracts**: every documented trigger in
  `subset-fit-contract.md` produces a trace entry with the canonical
  reason.
- **Ownership**: shared/core (emit side); domain (subscriber side
  stays where it lives — camera listener untouched).

### 1.4 `OverlaySurface`

- **Purpose**: any UI region that floats above the base layout and has
  an explicit lifecycle (popover, dialog, sheet, drawer, dropdown,
  tooltip, hovercard, context-menu).
- **Invariants**:
  - Three uniform close vectors: `esc`, `outside`, `action`.
  - One `onClose(reason)` event regardless of vector.
  - `modal` vs `non-modal` declared at primitive level, not at use
    site.
- **Permitted**: focus trap (modal only), scroll lock (modal only),
  ESC handler.
- **Prohibited**: per-call ad-hoc `setOpen(false)` chains spread
  across handlers; closing only on some vectors; relying on Radix
  defaults silently.
- **Observability**: `onClose` always fires with `reason ∈ {esc,
  outside, action, programmatic}`.
- **QA contracts**: parametrized close test per vector for each
  consuming surface.
- **Ownership**: shared/core (wraps Radix primitives in `ui/*`).

### 1.5 `ContextualSurface`

- **Purpose**: a panel that targets one entity in the current context
  (popup, inline recovery block, focus view, point context actions).
- **Invariants**:
  - Bound to an entity reference (`{ kind, id }`) for its full
    lifecycle.
  - Re-renders in place when the entity mutates (no remount unless id
    changes).
  - Never owns global state; reads it.
- **Permitted**: emit `ContextualAction`s scoped to the entity; mount
  inline (no Sheet/Dialog conversion — see Core rule "Contexto cercano
  = INLINE").
- **Prohibited**: mutate sibling entities; open as a side panel when
  the spec says inline; cache entity data beyond its lifecycle.
- **Observability**: action events tagged with `entity.kind` +
  `entity.id`.
- **Ownership**: domain (Content, Routes, Discovery), built on shared
  `ContextualSurface` shell.

### 1.6 `StatusSurface`

- **Purpose**: pure visual projection of model state (health rings,
  marker color, collection tint, badge counts, owner identity
  triangle).
- **Invariants**:
  - Read-only. Zero handlers. Zero local state.
  - Output is a deterministic function of input model.
  - Never blocks pointer events (siblings remain clickable).
- **Permitted**: SVG/DOM rendering; CSS transitions tied to model
  changes.
- **Prohibited**: click handlers, hover side effects beyond pure CSS,
  emitting events.
- **Observability**: snapshot-testable; no event surface.
- **QA contracts**: visual regression only.
- **Ownership**: shared/core (renderer helpers); inputs from domain.

### 1.7 `BlockingOperation`

- **Purpose**: a long-running action that suppresses re-entry and
  publishes progress (heavy-operations lanes: import, enrichment,
  geocoding, repair).
- **Invariants**:
  - Every operation has `{ id, kind, source, lane }`.
  - `blockReentry: true` MUST wire visible feedback at the originating
    control (spinner, lane row, disabled state).
  - When reentry is suppressed, an explicit feedback event fires
    (toast, inline warning, or lane highlight). Never silent.
- **Permitted**: scroll-lock-free progress, multi-lane parallelism,
  cancellation when supported.
- **Prohibited**: `blockReentry: true` without bound feedback;
  invisible queueing; swallowing the second click without ack.
- **Observability**: every block / unblock / suppress emits an event
  consumable by `BottomProgressBar` and QA harness.
- **Ownership**: shared/core (store + feedback contract); domain
  (lane definitions).

### 1.8 `ObservableAction`

- **Purpose**: meta-primitive — any user-triggered action in the app
  must produce an observable trace entry.
- **Invariants**:
  - Single shape: `{ opId, kind, source, payload, ts }`.
  - `opId` is unique per invocation, even on replay.
  - Trace is bounded in length (ring buffer) and cheap to read.
- **Permitted**: instrumentation hooks in dev/QA builds.
- **Prohibited**: actions that bypass the trace (especially camera /
  focus / selection mutations).
- **Observability**: `window.__appActionTrace` `[name provisional]`,
  parallel to existing `window.__cameraFitTrace`.
- **Ownership**: shared/core.

### 1.9 `DismissibleSurface`

- **Purpose**: subset of `OverlaySurface` plus transient panels
  (toast, bottom progress, banner) that the user can dismiss
  independently of an action.
- **Invariants**:
  - Has explicit dismiss affordance OR auto-dismiss timer; never
    both ambiguous.
  - Dismiss is reversible only via re-trigger, never via "undo".
- **Permitted**: timer-based dismiss; click-to-dismiss; swipe.
- **Prohibited**: dismiss that also commits a side effect (must be
  `OverlaySurface` with `action` close instead).
- **Ownership**: shared/core.

### 1.10 `StatefulSelection`

- **Purpose**: the upstream store layer that backs every `Selectable`
  surface (filter axes, focused entity, panel mode, user filter).
- **Invariants**:
  - Single source of truth per axis.
  - Mutations go through a typed reducer with canonical action names.
  - Every mutation is replayable from the action log.
- **Permitted**: persistence (filter preservation memory), URL
  sync, realtime cross-tab.
- **Prohibited**: local component state shadowing a store axis;
  derived `active` flags computed differently in two places.
- **Observability**: action log, current snapshot, axis-level
  diffing.
- **Ownership**: shared/core for shape + reducer skeleton; domain
  for axis registration.

---

## 2. Current → primitive mapping

| Current surface | Primitive(s) | Notes |
|---|---|---|
| `MyCatalogQuickFilters` rows | `Selectable` + `Replayable` + `FocusEmitter` (via popover-applied event) hosted in `OverlaySurface` (Radix Popover) | Canonical reference implementation post-fix. |
| Map markers (`createCustomIcon` + click handler) | `Selectable` + `FocusEmitter` + `StatusSurface` (visual rings/colors are read-only projection) | Status layer must stay pointer-transparent. |
| Map popups (`map-popups.ts`) | `OverlaySurface` (non-modal, anchored) + `ContextualSurface` (entity-bound) | Persist-on-rebuild rule lives at the `ContextualSurface` lifecycle. |
| `UnenrichedRecoveryBlock` + `<NearbyPanel inline>` | `ContextualSurface` (inline only) | Inline-only constraint already in Core. |
| Document / Collection / Orphan / Route focus views | `ContextualSurface` (entity-scoped) + `FocusEmitter` (camera + sidebar) | Each view re-implements the entry/exit shell — duplication candidate. |
| `FilterBar` chips, `LocationCollectionChips`, `SourceHashtag`, `PlaceTypeFilter`, `PanelModeTabs` | `Selectable` backed by `StatefulSelection` | Re-click semantics differ per chip — needs unification. |
| `UsersSidebar` rows | `Selectable` (toggle filterByUserId) + `FocusEmitter` (subset-fit user-filter) + `StatusSurface` (identity triangle, badges) | Re-click contract not formalized. |
| `DocumentsPanel`, `CollectionsListPanel`, `RoutesListPanel`, `IncompleteLocationsPanel` rows | `Selectable` + `FocusEmitter` | Each panel duplicates row shell, hover, active styling. |
| Health rings, owner identity triangle, collection tint, marker color | `StatusSurface` only | Already pure; must not gain handlers. |
| `HealthFilterActionCTA`, `HealthRepairPreviewDialog` | `Selectable` (chip) + `OverlaySurface` (modal dialog) + `BlockingOperation` (repair lane) | Three primitives composed; today wired ad hoc. |
| `BottomProgressBar` lanes | `DismissibleSurface` (lane row) + `BlockingOperation` (lane source) | Display owns no state — pure projection of store. |
| `ImportSummaryDialog`, `UploadPreviewDialog`, `CollectionAppearanceDialog` | `OverlaySurface` (modal) + `BlockingOperation` (when confirm starts long ops) | Confirm path must register feedback. |
| `LayersPanel`, `FloatingPanel`, `MarkerStateRulesPanel` | `OverlaySurface` (non-modal panel) + `StatefulSelection` (toggles) | Close-vector parity unaudited. |
| `FloatingToolbar` counter | `StatusSurface` (myCatalog/catalogTotal) — non-interactive | Stays read-only. |
| Toasts (`sonner`) | `DismissibleSurface` | OK as-is. |
| Tooltips, HoverCards, ContextMenus, DropdownMenus | `OverlaySurface` (non-modal) | Need uniform `onClose(reason)`. |

---

## 3. Architectural duplication

### 3.1 Replay semantics reimplemented

- `MyCatalogQuickFilters.applyRow` (canonical, opId-tagged).
- Health filter axis chip handler — replays fit independently.
- Marker click → fit — independent path.
- User-row click → fit — independent path.
- `selection-fit-on-start` hook — fourth replay path.

→ Five distinct implementations of the same `Replayable` +
`FocusEmitter` composition.

### 3.2 Overlays managed manually

- Each `OverlaySurface` consumer wires its own `setOpen(false)` from
  inside row handlers, instead of declaring close on the primitive.
- `LayersPanel`, `FloatingPanel`, `ImportedContentPanel` likely have
  divergent close-vector wiring `[needs audit]`.
- Sheet / Dialog / Drawer / Popover wrappers in `ui/*` do not yet
  expose a unified `onClose(reason)`.

### 3.3 Close semantics duplicated

- `setOpen(false)` after action: ad hoc in MyCatalog popover, sidebar
  rows, dialog confirms.
- ESC handling: relies on Radix defaults silently in some, custom in
  others.
- Outside-click: depends on which Radix primitive is used; not
  audited per panel.

### 3.4 Selection semantics duplicated

- "Active" state encoded as: store axis (filters), local
  `selectedId` (sidebars), URL-derived (focus views), Radix
  `data-state` (tabs). At least four encodings of the same concept.
- `Selectable.active` should be a single read pattern delegated to
  `StatefulSelection`.

### 3.5 Loading / blocking semantics duplicated

- `AppSpinner`, `AppSkeleton`, `panel-loading-pattern`,
  `BottomProgressBar` lanes, per-marker enrichment tracker,
  Radix `data-loading` — six distinct loading affordances.
- `BlockingOperation` feedback wired in import path but partially
  missing in some sidebar triggers.
- "Busy" and "loading" distinction not enforced.

### 3.6 Visual state vs semantic state mixed

- Marker renderer: visual state and pointer interactivity both routed
  through the same icon — pure projection in spirit, but the click
  handler is bound on the same DOM, blurring the `StatusSurface`
  boundary.
- Sidebar rows: `active` styling driven by local prop in some lists,
  by store-derived selector in others.
- Filter chips: count-zero rendered as low opacity but still
  clickable in some — false affordance (`Selectable` invariant
  violation).

---

## 4. Extraction plan (proposal, not action)

> Goal: each primitive lives in **one** place, every consumer reads
> the same contract. Camera and `subset-fit` listener stay untouched.

### 4.1 Lives in `shared/core` (UI primitive layer)

- `Selectable` shell (interactive + disabled invariants, opId
  tagging).
- `Replayable` wrapper (forces fresh opId, no payload-dedupe).
- `OverlaySurface` family unifying Radix Popover/Dialog/Sheet/Drawer
  with `onClose(reason)` and modal flag.
- `DismissibleSurface` (toast, banner, lane row shell).
- `StatusSurface` conventions (pointer-transparent, no handlers,
  pure projection).
- `ObservableAction` trace utility (parallel to existing camera
  trace; never mutates state).
- `BlockingOperation` feedback contract (binding originating
  control to lane).

### 4.2 Stays in domains

- `ContextualSurface` instances (popup, recovery block, focus views)
  — domain owns the entity model and the inline layout; reuses the
  shared shell.
- `FocusEmitter` subscribers (camera listener in `LocationMap`,
  sidebar centering, route reconstruction) — already domain code.
- `StatefulSelection` axis registrations (filter axes, focused
  entity, panel mode) — domain registers axes against shared
  reducer.
- All `BlockingOperation` lane definitions (import, enrichment,
  geocoding, repair).

### 4.3 Becomes hooks / helpers

- `useSelectable({ axis, value })` → returns `{ active, disabled,
  onActivate(opId) }`. Backs every chip / row / popover row.
- `useReplayable(action)` → returns wrapped invoker that always
  produces a fresh opId.
- `useOverlay({ modal })` → returns `{ open, setOpen, onClose }`
  with unified close-reason semantics.
- `useObservableAction(kind)` → returns `emit(payload)` that writes
  trace entry and dispatches the typed event.
- `useBlockingOperation({ lane })` → returns `{ start, isBlocked,
  feedbackProps }` so any control can render its feedback locally.

### 4.4 Should disappear

- Per-component `setOpen(false)` chains inside row handlers (replaced
  by `OverlaySurface` declaring close-on-action).
- Local `active` booleans in sidebar / chip components when an axis
  exists in `StatefulSelection`.
- `if (value === X)` branches inside selectables (replaced by the
  shared `applyRow`-style handler).
- Ad-hoc opId generation per call site (centralized in
  `ObservableAction`).
- Silent early-returns on "already active" everywhere they exist
  (forbidden by `Selectable` invariants).
- Handlers attached to `StatusSurface` DOM (rings, tints, identity
  triangle) — must move to a sibling `Selectable` layer.

---

## 5. Constraints honored

- No camera changes.
- No `subset-fit` changes (emit + listener + cooldown + reasons stay).
- No file moves.
- No new hooks introduced in this phase.
- No behavior changes.

---

## 6. Sequencing recommendation (non-binding)

1. Pilot one primitive end-to-end on **one** surface group (proposal:
   `Selectable` on `MyCatalogQuickFilters` is already the reference;
   next pilot = `FilterBar` chips).
2. Ratify primitive contracts as ADR-0005 once the pilot is stable.
3. Extract `OverlaySurface` second — highest duplication / lowest
   semantic risk.
4. `BlockingOperation` feedback contract third — closes the
   silent-block gap.
5. `ObservableAction` last — once the action surface has
   stabilized.

Camera, `subset-fit`, and the `MyCatalog` selector remain
out-of-scope throughout.
