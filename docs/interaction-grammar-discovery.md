# Interaction Grammar Discovery — Vandits

> Status: **DISCOVERY ONLY**. No fixes, no refactors, no behavior changes.
> Goal: extract the implicit semantic system already present in the app and
> surface it as an architectural map. All proposals in §5 are non-binding
> sketches awaiting a separate design pass.

---

## 0. Method

The inventory below was assembled from:

- Source tree under `src/components/**`, `src/domains/**`.
- Memory index (`mem://index.md`) — canonical rules already promoted to "Core".
- Existing contracts under `docs/contracts/*` and ADRs under `docs/adr/*`.
- Camera QA harness (`src/components/debug/*`, `e2e/camera-qa.spec.ts`).

Every entry references real files. Where behavior is implicit (no contract
written down), it is marked `[implicit]`.

---

## 1. Inventory of interactive surfaces

### 1.1 Markers (map POIs)

- **Component**: `src/components/map/map-v2-renderer.ts` (`createCustomIcon`),
  `useMarkerStateRules.ts`, `map-icons.ts`, `owner-stroke.ts`.
- **Semantic purpose**: render a single POI with origin (own / followed /
  app / source), health rings, collection tint, zoom canon shape.
- **Emits**: marker click → opens popup (`map-popup-handlers.ts`) → may
  trigger `requestSubsetFit(ids, { mode, reason: 'marker-click' })`
  via `subset-fit.ts` listener `[implicit]`.
- **Consumes**: `getPointVisualState`, `getPointHealthRings`,
  `getOwnerIdentityColor`, `MarkerGrammar` from `resolveMarkerGrammar`.
- **Side effects**: opens Leaflet popup, may dispatch
  `lovable:owner-identity-updated`, may queue popup recovery mount.
- **Visual states**: `enriched | imported | empty` × shape (circle own /
  inverted triangle followed) × 4 health rings × 4 zoom canons
  (`micro/compact/standard/rich`).
- **Interactive states**: idle, hover (tooltip), active (popup open),
  focused (subset-fit target), culled (viewport-out).

### 1.2 Popups (POI detail bubble)

- **Component**: `src/components/map/map-popups.ts`,
  `popup-recovery-mount.ts`, `UnenrichedRecoveryBlock.tsx`,
  `NearbyPanel` inline variant.
- **Purpose**: show structured detail of a single POI; if empty, render
  inline "Contexto cercano" recovery block.
- **Emits**: action clicks (enrich, repair, view doc), close, internal
  CTAs that may dispatch `requestSubsetFit` `[implicit]`.
- **Consumes**: location object, enriched_data, health flags, nearby
  context query.
- **Side effects**: mounts a React subtree inside Leaflet popup DOM;
  persists across rebuilds (memory: `popup-persist-on-rebuild`).
- **Visual states**: collapsed, expanded sections, loading skeletons,
  recovery block present/absent.
- **Interactive states**: open / closed / persisting through rebuild.

### 1.3 Pills / chips (filter axes, collection chips, source hashtags)

- **Components**: `FilterBar.tsx`, `LocationCollectionChips.tsx`,
  `SourceHashtag.tsx`, `PlaceTypeFilter.tsx`, `discovery/PanelModeTabs.tsx`,
  `HealthFilterActionCTA.tsx`.
- **Purpose**: scoped multi-axis filter selection (Geo / Type / Tags /
  Health / Source / Owner).
- **Emits**: filter mutation → `setFilters` → recomputes
  `filteredLocations`; certain axes (Health, user-filter) trigger
  `requestSubsetFit` per `subset-fit-contract.md`.
- **Consumes**: filter store, available facets.
- **Side effects**: marker subset recomputed; some axes move camera,
  others do not (canonical: only Health and user-filter move it).
- **Visual states**: idle / active / disabled / loading facet count.
- **Interactive states**: toggle, multi-select, clear-all.

### 1.4 Filters popover ("Mis POI")

- **Component**: `MyCatalogQuickFilters.tsx` +
  `use-my-catalog-popover-fit.ts` (Radix Popover from `ui/popover.tsx`).
- **Purpose**: visual subset selector (all / enriched / imported / empty)
  with replay-on-active semantics (recently formalized — memory:
  `selector-interaction-contract`).
- **Emits**: `lovable:my-catalog-popover-applied` with unique `opId` →
  `requestSubsetFit({ reason: 'my-catalog-*' })`.
- **Consumes**: `getBucketStats` counts, current active row.
- **Side effects**: closes popover, replays fit, generates QA trace.
- **Visual states**: row idle / active / hover / disabled (count=0).
- **Interactive states**: first-click select, re-click replay (now
  guaranteed observable).

### 1.5 Sidebar rows (Users sidebar, Documents panel, Collections list)

- **Components**: `UsersSidebar.tsx`, `DocumentsPanel.tsx`,
  `CollectionsListPanel.tsx`, `RoutesListPanel.tsx`,
  `IncompleteLocationsPanel.tsx`, `OrphanFocusView.tsx`.
- **Purpose**: list-based selection of an entity (user / document /
  collection / route / orphan).
- **Emits**: per-row click → entity focus event; user-row click →
  `filterByUserId` toggle + `requestSubsetFit({ reason: 'user-filter' })`.
- **Consumes**: entity store, follow status, identity color.
- **Side effects**: changes filter axis, mounts focus view, triggers
  cover viewport behavior.
- **Visual states**: idle, selected, expanded, loading skeleton, badge
  counts, owner identity triangle (UsersSidebar only).
- **Interactive states**: select, deselect (toggle), re-click `[implicit
  — no formal contract beyond UsersSidebar]`.

### 1.6 Route focus / Document focus / Collection focus

- **Components**: `DocumentFocusView.tsx`, `CollectionFocusView.tsx`,
  `OrphanFocusView.tsx`, `DocumentWaypointsTabs.tsx`, `RouteBuilder.tsx`.
- **Purpose**: scoped, full-context view of a single document /
  collection / route.
- **Emits**: focus enter/exit, waypoint edit zoom, route segment select,
  may dispatch `requestSubsetFit({ reason: 'collection-auto-fit' | ... })`.
- **Consumes**: document tracks, waypoints, collection tint, route
  geometry.
- **Side effects**: switches map render mode (route visibility rule),
  applies sidebar-aware centering, may load nearby context.
- **Visual states**: focused / idle / loading / empty.
- **Interactive states**: enter / exit / waypoint hover / segment edit.

### 1.7 Nearby context (proximity recovery)

- **Component**: `UnenrichedRecoveryBlock.tsx` + `<NearbyPanel
  variant="inline" />`.
- **Purpose**: in-popup quick actions for empty POIs (search nearby,
  attach existing place, enrich).
- **Emits**: search trigger, attach action, enrich trigger.
- **Consumes**: nearby query result, POI coordinates.
- **Side effects**: never opens a sidebar/Sheet (Core rule), all inline.
- **Visual states**: idle / loading / results / empty / error.
- **Interactive states**: search submit, result click, attach confirm.

### 1.8 Overlays (dialogs, sheets, drawers)

- **Components**: `ui/dialog.tsx`, `ui/sheet.tsx`, `ui/drawer.tsx`,
  `ui/alert-dialog.tsx`, `ImportSummaryDialog.tsx`,
  `UploadPreviewDialog.tsx`, `HealthRepairPreviewDialog.tsx`,
  `CollectionAppearanceDialog.tsx`, `MarkerStateRulesPanel.tsx`,
  `LayersPanel.tsx`.
- **Purpose**: blocking or semi-blocking task surfaces (import preview,
  repair confirmation, settings).
- **Emits**: confirm / cancel / dismiss; some confirm flows trigger
  long-running ops via `heavy-operations-store`.
- **Consumes**: open state (controlled or uncontrolled), payload.
- **Side effects**: focus trap, scroll lock, ESC handling (Radix default).
- **Visual states**: closed / opening / open / closing.
- **Interactive states**: blocking (modal) vs non-blocking (popover).
- **Inconsistency surface**: see §3.3.

### 1.9 Contextual panels (toolbar, floating, bottom progress)

- **Components**: `FloatingToolbar.tsx`, `FloatingPanel.tsx`,
  `BottomProgressBar.tsx`, `LayersPanel.tsx`, `ImportedContentPanel.tsx`,
  `discovery/PanelModeTabs.tsx`.
- **Purpose**: persistent contextual surfaces overlaid on map.
- **Emits**: panel mode change, toolbar button click, progress lane
  cancel `[implicit]`.
- **Consumes**: counts, current mode, heavy-operations lanes.
- **Side effects**: visible/hidden transitions, no scroll lock.
- **Visual states**: collapsed / expanded / pinned / hidden.

### 1.10 Health / selection / loading states

- **Health**: 4 concentric rings (`getPointHealthRings`) — `partial`,
  `chain`, `review`, `hardError`. Indicator only, not directly clickable;
  surfaced via Health filter axis + `HealthRepairPreviewDialog`.
- **Selection**: visual highlight + sidebar count + `selection-fit-on-start`
  hook (debounced 250ms when 0→N).
- **Loading**: `AppSkeleton`, `AppSpinner`, panel-loading-pattern,
  `BottomProgressBar` lanes (geocoding, recovery, enrichment),
  per-marker enrichment tracker.

---

## 2. Interactive taxonomy (behavior groups)

| Group | Members | Behavior signature |
|---|---|---|
| **Selectable** | filter chips, sidebar rows, popover rows, panel mode tabs, place-type pills | toggle on click; visible feedback; idempotent state |
| **Replayable** | active filter row (Mis POI), Health axis chip, user-row when already selected | re-click on active = re-emit + side-effect (fit) — only formalized for Mis POI |
| **Focus emitters** | markers, sidebar rows, doc/collection/route focus entries, Health repair preview | dispatch `requestSubsetFit` (canonical) or open focus view |
| **Overlays (modal)** | Dialog, AlertDialog, Sheet, Drawer | scroll-lock, focus-trap, ESC closes |
| **Overlays (non-modal)** | Popover, HoverCard, Tooltip, ContextMenu, DropdownMenu | outside-click closes, no scroll-lock |
| **Contextual actions** | popup CTAs, `PointContextActions`, `UnenrichedRecoveryBlock`, `SelectionActions` | act on a single entity in context; inline only |
| **State indicators** | health rings, owner identity color, collection tint, marker shape, badge counts | non-interactive; pure projection of model state |
| **Navigation surfaces** | `NavLink`, `Header`, route changes, focus-view enter/exit | URL or major view change |
| **Transient UI** | toasts (`sonner`), `BottomProgressBar`, tooltips, loading skeletons | self-dismissing; no required user action |
| **Blocking UI** | heavy-operations w/ `blockReentry: true`, modal dialogs, focus-trap sheets | suppresses other input until resolved |

---

## 3. Systemic inconsistencies

The following patterns repeat across components and are **observed, not
hypothetical**.

### 3.1 Silent noop on re-click

- **Symptom**: visible row reacts to first click, ignores second.
- **Confirmed sites**: Mis POI popover (recently fixed via
  `selector-interaction-contract`); suspected but unverified in
  `UsersSidebar` user re-click, `PanelModeTabs` re-click on active tab,
  `LocationCollectionChips` re-click.
- **Root cause class**: handlers early-return on "already active"
  without emitting close + re-trigger.

### 3.2 False affordance

- **Symptom**: row looks clickable (cursor, hover bg) but is effectively
  inert (count=0 chip, disabled-but-not-styled item).
- **Confirmed sites**: filter chips with zero facet count `[implicit]`,
  some `Documents` rows during pending state.
- **Missing primitive**: there is no shared `aria-disabled + visual
  disabled` token applied uniformly.

### 3.3 Overlays that do not close consistently

- **Symptom**: outside-click vs ESC vs in-overlay action don't all close
  the surface.
- **Confirmed sites**: `LayersPanel` and `FloatingPanel` `[implicit —
  needs audit]`. Radix primitives behave correctly; custom panels do not
  always wire up the same.

### 3.4 Re-click inconsistency across selectables

- Different selectable surfaces interpret re-click differently:
  - filter chips → toggle off,
  - Mis POI rows → replay fit (post-fix),
  - sidebar user row → toggle off (closes filter),
  - panel mode tabs → noop.
- No global rule; each component decides.

### 3.5 Ambiguous active states

- **Symptom**: "active" is sometimes `bg-accent`, sometimes a left bar,
  sometimes only a checkmark, sometimes nothing.
- **Affected**: `FilterBar`, `MyCatalogQuickFilters`, `UsersSidebar`,
  `PanelModeTabs`, sidebar rows in `DocumentsPanel`.

### 3.6 Ambiguous disabled

- Some surfaces use Tailwind opacity, some use `aria-disabled`, some
  use `pointer-events-none`, some skip the attribute and rely on
  conditional handler. No shared token.

### 3.7 Actions without feedback

- **Confirmed**: heavy operations triggered with `blockReentry: true`
  silently swallow further clicks (memory: heavy-operations-feedback
  partially addresses this with `BottomProgressBar`, but per-source
  toast/inline ack is missing on some triggers).

### 3.8 Silent blocking

- `heavy-operations-store` may suppress an action when another lane is
  busy, with no UI signal at the originating control.

### 3.9 Invisible side effects

- `requestSubsetFit` is dispatched from many sites; user sees camera
  move without a visible link to the trigger. Trace exists only via
  Camera QA panel.

---

## 4. Repeated patterns (duplication candidates)

| Pattern | Where it appears | Notes |
|---|---|---|
| **Replay semantics** | `MyCatalogQuickFilters.applyRow`, Health filter chip handler, marker click → fit, user-row → fit | Each implements its own opId / event / close logic |
| **Close-on-select** | Popover handlers (`setOpen(false)`), Dialog confirm flows, Sheet action rows | No shared primitive — each calls `setOpen(false)` ad hoc |
| **Fit / recenter** | `requestSubsetFit` callers across markers, popovers, sidebars, health, selection hooks | Centralized listener exists (`subset-fit.ts`) but caller side is duplicated boilerplate |
| **Active selection** | Filter store axes, popover active row, sidebar selected row, panel mode | At least 4 distinct active-state encodings |
| **Heavy operation blocking** | `startOperation({ blockReentry })` callers in import, enrichment, geocoding, repair | Block semantics identical, feedback wiring differs |
| **Contextual focus** | Document focus, Collection focus, Orphan focus, Route focus | Same enter/exit shape; each view re-implements layout & fit logic |
| **Selection persistence** | Filter preservation memory, route manual-selection lock, focus view restoration | Three independent persistence layers |

---

## 5. Proposed global contracts (non-binding)

> **No implementation in this phase.** These sketches exist to seed a
> future design discussion. Names are provisional.

### 5.1 Selectable contract

- A visible row is **either** fully interactive **or** explicitly
  `aria-disabled` with shared disabled token.
- Click always produces an observable event with a unique `opId`.
- Re-click on active = caller decides between `toggle` (deselect) or
  `replay` (re-emit + re-trigger side-effects), but never silent noop.

### 5.2 Replay contract

- Any surface whose primary action has a side-effect (fit, focus,
  recenter, refresh) must support **explicit replay** when re-clicked
  while active.
- Replay = same event payload + new `opId` + same downstream side-effect.

### 5.3 Overlay contract

- Three uniform close vectors: ESC, outside-click, in-overlay confirm /
  dismiss.
- All three emit the same `onClose(reason)` with `reason ∈ {esc,
  outside, action, programmatic}`.
- Modal vs non-modal declared once at the primitive level.

### 5.4 Focus contract

- Only one primitive (`requestSubsetFit` already exists for camera) —
  extend the same pattern to entity focus: `requestEntityFocus({
  kind, id, reason })` with canonical reasons enum.
- Side-effects subscribe; emitters never call view code directly.

### 5.5 Blocking feedback contract

- Any `startOperation({ blockReentry: true })` must wire a visible
  feedback at the originating control: spinner, lane in
  `BottomProgressBar`, or inline disabled state.
- `block` events must surface a toast or inline warning when
  reentry is suppressed.

### 5.6 Contextual state contract

- Three state buckets per interactive surface: `idle | active |
  disabled` rendered with shared design tokens.
- "Loading" and "busy" are orthogonal overlays on top of the three
  buckets, not extra buckets.

---

## 6. Architectural map

```text
                    ┌──────────────────────────────┐
                    │   Interactive Surface Layer  │
                    │  (markers, rows, chips, …)   │
                    └──────────────┬───────────────┘
                                   │ click / hover / focus
                                   ▼
                    ┌──────────────────────────────┐
                    │   Local component handler    │
                    │ (currently: bespoke per file)│
                    └──────────────┬───────────────┘
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
   ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │ Filter store /  │   │ Heavy-operations │   │  Event bus       │
   │ selection state │   │ store (block)    │   │  (window events) │
   └────────┬────────┘   └────────┬─────────┘   └────────┬─────────┘
            │                     │                      │
            ▼                     ▼                      ▼
   ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │ filteredLocs +  │   │ BottomProgressBar│   │ subset-fit       │
   │ markerLocs      │   │ lanes            │   │ listener (camera)│
   └─────────────────┘   └──────────────────┘   └──────────────────┘
```

Today, **the local handler layer is the duplication hotspot**. Every
selectable component re-implements: deciding active vs new, emitting
an event, closing its overlay, calling the side-effect, tagging an
opId, and choosing whether to swallow re-clicks.

The proposed contracts (§5) collapse that layer into shared primitives
without touching the stores, listeners, or camera logic.

---

## 7. What this document is NOT

- Not a refactor plan.
- Not a fix.
- Not a UX redesign.
- Not a binding ADR.

Next phase (separate request) should pick **one** contract from §5,
formalize it as an ADR, and pilot it on **one** surface before
generalizing.
