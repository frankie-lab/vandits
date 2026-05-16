# Pilot 1 — Post-pilot validation report

> Read-only audit. Zero code changes, zero behaviour changes, zero new
> call sites, kernel untouched. Companion to
> `docs/interaction-primitives.md`, `docs/interaction-pilot-1-diff.md`
> and `mem://architecture/interaction-kernel-pilot-1`.

---

## 1. E2E execution

> **Update (Phase A — QA infra)**: la deuda de infraestructura QA
> descrita en §1.1 ha sido cerrada. Ver
> [`docs/qa/e2e-camera-qa.md`](./qa/e2e-camera-qa.md) para el manual de
> ejecución local/CI. Cambios introducidos en Phase A:
>
> - `e2e/global-setup.ts` autentica una vez (vía `E2E_USER_EMAIL` /
>   `E2E_USER_PASSWORD`) y persiste `storageState` en `e2e/.auth/user.json`.
> - `playwright.config.ts` separa dos projects: `chromium-auth` (sin
>   storageState, solo `auth.spec.ts`) y `chromium-app` (con storageState,
>   resto de specs).
> - `.gitignore` excluye `e2e/.auth/`, `playwright-report/`,
>   `test-results/`.
> - `.github/workflows/e2e.yml` mapea los secrets `E2E_USER_EMAIL` /
>   `E2E_USER_PASSWORD` al step de tests.
> - Sin credenciales, `global-setup` aborta con error claro (no skip
>   silencioso).
>
> El gate para Pilot 2 es: la primera ejecución verde de
> `camera-qa.spec.ts` contra el storageState. Esa ejecución se realiza
> fuera del sandbox (local o CI con secrets configurados). Cuando esté
> verde, registrar resultado bajo §1.1 sobrescribiendo la nota de skip
> histórica de abajo.

### 1.1 `e2e/camera-qa.spec.ts` (Playwright) — histórico Pilot 1

**Status: SKIPPED in this environment (infrastructure, not pilot
regression).**

- Playwright is **not installed** in the sandbox. `npx playwright test
  --list` fails with `ERR_MODULE_NOT_FOUND: @playwright/test`. The
  project relies on the GitHub Actions workflow (`.github/workflows/e2e.yml`)
  to run this suite; there is no `package.json` script wired for local
  runs and no Playwright dependency in `devDependencies`.
- Even with Playwright installed, the suite's own header documents the
  precondition: *"the page loads authenticated (otherwise
  `[data-testid=my-poi-trigger]` is absent and the suite skips with a
  clear reason). Authentication is not handled here; reuse storageState
  from another harness if needed."* The sandbox has no storageState.
- No parametrized tests have been added for FilterBar Health chips or
  UsersSidebar in this pilot — this matches the explicit scope honored
  in `docs/interaction-pilot-1-diff.md` §5 risk 3.

**Action required: none in this report.** Verification of the pilot's
camera-qa invariants (`Active re-click replays the same fit`, etc.)
must be performed in CI / against an authenticated preview. No
regression signal is available here.

### 1.2 Vitest unit suite (full run, sanity check)

```
Test Files  2 failed | 31 passed (33)
Tests       5 failed | 338 passed (343)
Duration    12.55s
```

The 5 failures are **pre-existing and unrelated to the pilot**:

| Test file | Failing assertions | Pilot-related? |
|---|---|---|
| `src/test/index-composition.test.tsx` | Index.tsx line count > 500, `useEffect` count > 9, `useState` count > 10 | **No.** Touches `src/pages/Index.tsx`; no kernel import. |
| `src/test/enrichment-helpers.test.ts` | `getLocationEnrichmentStatus` "current"/"previous" branches | **No.** Touches `src/domains/content/lib/*` enrichment helpers; no kernel import. |

None of the failures load `FilterBar`, `UsersSidebar`,
`MyCatalogQuickFilters`, `selectable-kernel.ts`, or anything under
`src/shared/interaction/`. Pilot integrity is **not** signalled as
regressing by the unit suite.

---

## 2. Usage audit of the kernel

Grep target: `runSelectable | buildOpId | resolveSelectableState |
traceSelectable | selectable-kernel` across `src/`, `docs/`, `e2e/`.

### 2.1 Production imports (only place that matters)

| File | Symbols imported | Allowed? |
|---|---|---|
| `src/components/toolbar/MyCatalogQuickFilters.tsx` (L40–42, L59, L202) | `runSelectable`, `resolveSelectableState` | YES — pilot site #1 |
| `src/components/FilterBar.tsx` (L49, L412, L425) | `runSelectable`, `resolveSelectableState` | YES — pilot site #2 |
| `src/components/UsersSidebar.tsx` (L37, L398) | `runSelectable` | YES — pilot site #3 |
| `src/shared/interaction/selectable-kernel.ts` | self (exports) | YES — kernel home |

### 2.2 Documentation / narrative references (not imports)

- `src/shared/interaction/README.md` — kernel doc.
- `docs/interaction-primitives.md`, `docs/interaction-pilot-1-diff.md`
  — pilot docs.
- `src/components/toolbar/use-my-catalog-popover-fit.ts` (L226–227)
  — `@deprecated` JSDoc on `buildUniqueMyCatalogPopoverOpId` pointing to
  `buildOpId('mycatalog-popover')`. Comment only, no runtime import.

### 2.3 Scope leaks

**None detected.** No production file outside the three pilot consumers
and the kernel folder imports any kernel symbol. The audit surface
exactly matches the pilot scope ratified in
`mem://architecture/interaction-kernel-pilot-1`.

### 2.4 Test references

`traceSelectable` is referenced narratively in docs (as a future-channel
name) but is **not** an exported symbol from the kernel — there is
nothing to import. The kernel writes its trace entries via
`traceCameraFit('selectable-kernel.run', ...)`, intentionally piggy-backed
on the existing camera trace (documented risk; see §3 below).

---

## 3. Freeze check

| Invariant | Status | Evidence |
|---|---|---|
| No new hooks | PASS | `src/shared/interaction/` contains only `selectable-kernel.ts` (pure functions) + `README.md`. No `use*.ts(x)`. |
| No new providers | PASS | No `Context`, `Provider`, or `createContext` introduced under `src/shared/interaction/` or pilot consumers (only kernel-call diff). |
| No new stores | PASS | No `create()` / Zustand / Redux store added. Pilot consumers continue reading from `useLocationsStore` only. |
| No new global traces | PASS | Kernel reuses `traceCameraFit` ring buffer. No `window.__*` global, no new buffer. Risk documented in `docs/interaction-pilot-1-diff.md` §10. |
| Camera / subset-fit untouched | PASS | `src/components/map/subset-fit.ts` not imported by `selectable-kernel.ts`. Pilot consumers call `requestSubsetFit` with the same `reason` values as before (`my-catalog-popover:*`, `user-filter`). |
| `runSelectable` not extended to new sites | PASS | See §2.1 — only 3 production importers, all pre-existing pilot consumers. |
| `buildUniqueMyCatalogPopoverOpId` deprecation honored | PASS | `@deprecated` JSDoc present; no runtime caller remains (only the export survives for the `subset-fit-contract.md` narrative). |

**Verdict: the pilot is frozen as ratified.** Nothing has crept in
since `docs/interaction-pilot-1-diff.md` was written.

---

## 4. Candidate scan for Pilot 2 (analysis only)

Four components inspected as-is. **No code touched. No migration
proposed in this report — only contract classification.**

### 4.1 `src/components/filters/PlaceTypeFilter.tsx`

```tsx
const selectType = (type: PlaceType) => {
  if (filters.placeType === type) {
    setFilters({ ...filters, placeType: undefined });   // re-click → clear
  } else {
    setFilters({ ...filters, placeType: type });        // first click → select
  }
};
```

- Single-value axis (`filters.placeType`), mutually exclusive.
- Re-click on active **clears** the axis. No focus/fit re-emit. No
  popover; pure chip strip.
- Count source exists (`placeTypeCounts.get(type)`) but currently
  count=0 types are filtered out at render (`sortedTypes`) so the
  disabled-vs-hidden choice is already made implicitly.

**Classification: `ToggleableSelection` (canonical).** Strongest
candidate of the four; semantics are byte-identical to FilterBar Health
chips, which is the Pilot 1 reference for the toggle family. Pilot 2
should treat this as the migration target for
`runToggleableSelection`.

### 4.2 `src/components/poi/SourceFilterBridge.tsx`

```ts
const isActive =
  current.filterBySource?.type === type && current.filterBySource?.id === id;
// toggle off if active; otherwise set + requestSubsetFit({ reason: 'source-filter' })
```

- Single-value axis (`filters.filterBySource`), mutually exclusive
  across `{type, id}` pairs.
- Re-click on active **clears** the axis AND skips `requestSubsetFit`
  (explicit `if (!isActive)` guard). Activation **does** subset-fit.
- This is a global bridge (listener), not a chip surface — the
  Selectable surface that triggers it is `SourceHashtag` (React) and
  the `.source-filter-chip` HTML in Leaflet popups.

**Classification: hybrid — `ToggleableSelection` semantically, but the
*trigger* lives behind a bridge.** The toggle-off vs activate
asymmetry matches `ToggleableSelection`. The wrinkle: activation
re-emits subset-fit (a `FocusEmitter` side effect), which makes the
*activate* path look like `RecenterableSelection` even though re-click
is toggle-off. This is **not** the same shape as Pilot 1's FilterBar
Health (which never re-emits fit). Pilot 2 should NOT take this on
until `runToggleableSelection` is settled — it needs a third lane
("activation emits fit, re-click clears without re-emit") that the
current contracts do not name.

**Recommendation: defer to Pilot 3 or later.** Document as
`ToggleableSelection + FocusEmitter on activate-only`. Forcing it into
the Pilot 2 cohort would re-introduce exactly the kind of slot
ambiguity that killed `Replayable`.

### 4.3 `src/domains/content/components/LocationCollectionChips.tsx`

```tsx
{collections.map((c) => (
  <span key={c.id} title={c.name} className="...">#{slug}</span>
))}
```

- Render-only. `<span>` elements, no `onClick`, no handlers.
- The component does not own a selection state; it projects a list of
  collections for a given `locationId`.

**Classification: not a Selectable.** It is a `StatusSurface`
(read-only projection of the model, no events emitted). Does NOT belong
to the Pilot 2 cohort. If chip click-to-filter is added later, that
*new* surface would be the Selectable candidate, not this component.

### 4.4 `src/components/discovery/PanelModeTabs.tsx`

```tsx
<Tabs value={value} onValueChange={(v) => onChange(v as PanelMode)}>
  <TabsList>
    <TabsTrigger value="explore">…</TabsTrigger>
    <TabsTrigger value="maintain">…</TabsTrigger>
    <TabsTrigger value="select">…</TabsTrigger>
  </TabsList>
</Tabs>
```

- Radix `Tabs`. Selection is single-value, mutually exclusive.
- Re-click on active tab is a **no-op** by Radix design: `Tabs` does
  not call `onValueChange` when the active trigger is re-clicked. The
  current contract is therefore neither `Toggleable` (no clear) nor
  `Recenterable` (no re-emit).
- No "clear to default" semantics exist — there is always exactly one
  mode active.

**Classification: does not fit either candidate.** Pilot contracts
assume re-click produces an observable event; Radix tabs do not. This
is a third primitive ("ExclusiveModeSelector") that the Pilot 1 split
did not name. Migrating it now would force one of two undesirable
choices: (a) bypass Radix to emit on re-click (changing user-visible
behaviour), or (b) accept silent no-op (violating the Selector
interaction contract in `mem://ui/selector-interaction-contract`).

**Recommendation: out of Pilot 2 cohort.** Either keep as-is and accept
that the Core "no silent noop" rule applies to *popover-row selectors*
specifically (the Core memory's literal wording), not to mutually-
exclusive tab groups; or open a separate discovery to define an
`ExclusiveModeSelector` contract.

### 4.5 Cohort summary

| Component | Pilot 2 fit | Contract |
|---|---|---|
| `PlaceTypeFilter` | **YES** — canonical | `ToggleableSelection` |
| `SourceFilterBridge` | **NO** — defer | `ToggleableSelection + FocusEmitter (activate-only)` — new shape |
| `LocationCollectionChips` | **NO** | `StatusSurface` (read-only) |
| `PanelModeTabs` | **NO** | Doesn't fit; needs separate primitive |

**Net Pilot 2 cohort recommendation: one surface (`PlaceTypeFilter`) on
the `ToggleableSelection` family.** For `RecenterableSelection` the
recommended Pilot 2 sibling lives outside this scan (candidates listed
in `docs/interaction-primitives.md` §1.2a: marker / document /
collection / orphan / route focus rows).

---

## 5. Risks surfaced by this audit

1. **No CI signal accessible in sandbox.** Camera QA invariants are
   only verifiable via the GitHub Actions workflow against an
   authenticated preview. Until Pilot 2 ships, the only local signal
   for kernel correctness is `vitest run` (no kernel coverage today)
   plus manual exploration. No new tests added — that would expand
   scope.
2. **`SourceFilterBridge` reveals a third re-click shape** the Pilot 1
   split did not anticipate. If Pilot 2 forces it into
   `ToggleableSelection`, the resulting helper either silently swallows
   the fit re-emit or grows an optional `onActivateFit` slot — the
   exact foot-gun pattern that killed `Replayable`. Documented above;
   do not migrate without first extending the contract.
3. **`PanelModeTabs` exposes a tension** between the Core "no silent
   noop" rule and Radix `Tabs` semantics. The rule's canonical scope
   is popover rows (`applyRow` in `MyCatalogQuickFilters`); extending
   it to all selectors needs an explicit decision before Pilot 2
   touches any tab-shaped surface.

---

## 6. Recommendation

**Advance to Pilot 2, with a single-surface cohort.**

- Implement `runToggleableSelection` (kernel-level addition) and
  migrate **only** `PlaceTypeFilter`. Validate that the toggle-off
  semantics match FilterBar Health exactly. Once green, retire the
  `onReplay` slot from `runSelectable` (FilterBar Health path).
- In parallel, implement `runRecenterableSelection` and migrate **one**
  non-pilot surface from the recenter family — recommended:
  `DocumentsPanel` row open (existing `RecenterableSelection`
  candidate in the mapping table). Once green, retire the implicit
  recenter path from `runSelectable` (MyCatalog + UsersSidebar).
- Defer `SourceFilterBridge` and `PanelModeTabs` until their respective
  open questions (new contract shape, Radix interaction) are resolved.
- Do **not** touch `LocationCollectionChips` — wrong primitive family.

**Pre-conditions for advancing:**

- Re-run `camera-qa.spec.ts` in CI against the pilot baseline and
  confirm the `Active re-click replays the same fit` invariant still
  holds. (Cannot be done in sandbox.)
- Add e2e coverage for `FilterBar` Health toggle-off and `UsersSidebar`
  user-filter recenter **before** introducing the new helpers, so the
  split is measured against a green baseline. This was deferred in
  Pilot 1 (`docs/interaction-pilot-1-diff.md` §5 risk 3); Pilot 2 is
  the natural moment to pay it down.

**Do not advance if:**

- CI cannot exercise `camera-qa.spec.ts` against the current pilot
  build.
- The `ExclusiveModeSelector` question (re §4.4) is not parked
  explicitly — leaving it open will pull `PanelModeTabs` into Pilot 2
  by accident.

---

## 7. Constraints honoured by this report

- Read-only audit. No production file touched.
- Kernel untouched (`src/shared/interaction/selectable-kernel.ts`
  unchanged).
- No call sites added, removed, or rewired.
- No camera, subset-fit, listener, or store mutation.
- No new tests added.
- No Pilot 2 initiated.
