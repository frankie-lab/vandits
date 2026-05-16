# Pilot 1 — Extraction diff & contract validation

> Pilot of `Selectable + Replayable + FocusEmitter` on three call sites.
> No global migration. Camera, subset-fit, listeners, popups, overlays
> and other sidebars remain untouched, per approval constraints.

---

## 1. Extraction diff summary

### 1.1 New files

| File | LOC | Purpose |
|---|---|---|
| `src/shared/interaction/selectable-kernel.ts` | ~110 | Stateless helpers: `buildOpId`, `resolveSelectableState`, `runSelectable`. No React, no hooks, no state, no providers. |
| `src/shared/interaction/README.md` | ~30 | Pilot scope + hard rules. |

### 1.2 Modified files

| File | Change | Net |
|---|---|---|
| `src/components/toolbar/MyCatalogQuickFilters.tsx` | `Row` consumes `resolveSelectableState` (real `aria-disabled` for count=0). `applyRow` body collapsed into a single `runSelectable({ onAlways, onChange })` call. Local `buildUniqueMyCatalogPopoverOpId` import removed; opId now produced inside the kernel and threaded through `onAlways`. | −18 LOC, +12 LOC |
| `src/components/FilterBar.tsx` | Health chips block (lines ~403–470) wrapped in `runSelectable` with `onChange` (activate) + `onReplay` (toggle-off, see Friction §3). Added `disabled` + `aria-disabled` for count=0 chips. | +20 LOC |
| `src/components/UsersSidebar.tsx` | `handleFilterByUser` body restructured behind `runSelectable`. `onChange` activates filter + emits subset-fit + toast. `onReplay` re-emits subset-fit with a fresh opId — closes the documented silent-noop gap on this surface. | +14 LOC |

### 1.3 Untouched (in pilot scope but kept verbatim by design)

- `src/components/toolbar/use-my-catalog-popover-fit.ts` — listener,
  event names, opId resolution. `buildUniqueMyCatalogPopoverOpId` is no
  longer called from the popover button but the export stays for
  back-compat (no consumer change required).
- `src/components/map/subset-fit.ts` — not opened, not referenced.
- `useMyCatalogPopoverFit`, `useHealthFilterFit`, `useSelectionFitOnStart`
  — untouched.
- `heavy-operations-store` — still receives `blockReentry: false` from
  the same call site, same `safetyTimeoutMs`.

---

## 2. Contracts validated

### 2.1 `Selectable`

| Invariant | Site validation |
|---|---|
| Visible row is interactive XOR disabled | `resolveSelectableState` returns `'disabled'` for count=0; rows render `aria-disabled` + `disabled` + `cursor-not-allowed`. Validated on MyCatalog rows and FilterBar health chips. |
| Click always emits an observable event | `runSelectable` writes a `selectable-kernel.run` trace entry before any side-effect. Three pilot sites covered. |
| `active` is upstream projection | All three sites read `active` from the filter store (`useLocationsStore` / `filters.healthFilter` / `filters.filterByUserId`) — no shadow booleans introduced. |

### 2.2 `Replayable`

| Invariant | Site validation |
|---|---|
| Re-invocation re-executes the side effect | MyCatalog: re-emits popover event with fresh opId → camera listener re-fits. UsersSidebar: re-calls `requestSubsetFit` with `reason: 'user-filter'` and fresh opId. |
| Each invocation carries a fresh `opId` | `buildOpId(prefix)` produces `prefix#nonce` per call. Verified by existing Camera QA `Active re-click replays` test. |
| Replay never mutates state that wasn't going to change | `onChange` only runs when `wasActive === false`. Verified by reading store filters before vs after re-click in MyCatalog. |

### 2.3 `FocusEmitter`

| Invariant | Site validation |
|---|---|
| Emits a typed request (`reason` from canonical enum) | All emissions go through the existing `requestSubsetFit` (camera) with reasons already registered (`my-catalog-popover:*`, `user-filter`). No new reasons introduced. |
| Never calls camera or view code directly | Confirmed: kernel does not import `subset-fit.ts`. The `runFocusEmit` helper proposed in the plan was **not** created (see §5: Premature primitives) — call sites continue to import `requestSubsetFit` themselves. |

---

## 3. Friction discovered

Per approval clause: *"Si una primitive no generaliza bien, documentarlo
en vez de forzar uniformidad."*

### 3.1 Toggle-off vs replay collision (FilterBar Health chips)

Pre-existing semantics: re-click on the active health chip **clears**
the filter (toggle-off). MyCatalog re-click **replays** the fit.

Two opposing behaviors live behind the same primitive label
(`Selectable + Replayable`). The kernel did **not** force unification:
`runSelectable` exposes both `onChange` and `onReplay` and lets the call
site route deselection through either. FilterBar uses `onReplay` for
toggle-off; MyCatalog leaves `onReplay` undefined and lets the listener
replay the fit from the re-emitted event.

**Implication for the contract**: `Replayable` as defined in
`docs/interaction-primitives.md` §1.2 is **not** universally applicable.
Recommendation: split it into two named contracts before the next pilot:

- `Replayable.recenter` — re-click re-emits the side-effect.
- `Replayable.toggle` — re-click clears the selection.

### 3.2 `runFocusEmit` was not extracted

The plan proposed a passthrough wrapper around `requestSubsetFit`. It
was dropped because:

- It would be a one-line indirection with zero behavior.
- Adding it now risks importing `subset-fit.ts` from the kernel folder,
  breaking the "kernel does not touch camera" hard rule.
- Each call site already imports `requestSubsetFit` directly with the
  correct `reason` from a canonical enum.

**Decision**: keep direct imports. Revisit only if a future pilot finds
a real abstraction need.

### 3.3 `onAlways` is sometimes empty

In FilterBar Health chips, `onAlways` is `() => {}` (no popover to
close, no event to emit beyond the kernel's own trace). The signature
remained mandatory to keep the contract uniform across sites.

**Implication**: future iterations may make `onAlways` optional.
Today's choice (mandatory) is intentional — it forces the call site to
think about "what runs unconditionally" before the change/replay split.

### 3.4 `UsersSidebar` row is not inside an `OverlaySurface` we own

The sidebar close (`onClose()`) was placed in `onAlways`. This is
correct for the Selectable contract ("close-on-action") but conflates
sidebar lifecycle with selection lifecycle. Pre-existing behavior is
preserved; refactoring sidebar visibility is out of pilot scope.

---

## 4. Remaining duplication (NOT migrated)

These are intentional non-migrations. Each is a future-pilot candidate.

| Site | Why not migrated |
|---|---|
| Map markers (`map-popup-handlers.ts` click → fit) | Out of scope. Marker click semantics involve popup mount + recovery block, far beyond Selectable. |
| `selection-fit-on-start` hook | Out of scope. Triggered by selection 0→N transition, not by a click; doesn't fit the Selectable shape. |
| `useHealthFilterFit` | Out of scope. Fires on filter change from any source; would require coupling kernel to fit hook. |
| `collection-auto-fit` | Out of scope. Document/collection focus is `ContextualSurface` territory. |
| `HealthRepairPreviewDialog` (open/preview/repair) | Explicitly excluded by approval. Combines Dialog + BlockingOperation. |
| Other sidebar panels (`DocumentsPanel`, `CollectionsListPanel`, `RoutesListPanel`, `IncompleteLocationsPanel`, `OrphanFocusView`) | Each row is a Selectable + FocusEmitter candidate. Deferred to a future pilot wave. |
| `SourceFilterBridge`, `LocationCollectionChips`, `PlaceTypeFilter`, `PanelModeTabs` | Selectable candidates with diverse re-click semantics — would expand the friction surface before the kernel is settled. |
| Active-chip dismissable badges in `FilterBar` (`activeChips.map`) | Pure dismiss action, not Selectable; would belong to `DismissibleSurface`. |

---

## 5. Risks discovered

1. **`Replayable` contract is too broad** — see §3.1. The kernel exposes
   both `onChange` and `onReplay` to absorb the divergence, but the
   primitive description in `docs/interaction-primitives.md` should be
   split before more sites consume the kernel.
2. **Trace coupling to `traceCameraFit`** — the kernel reuses the camera
   trace ring buffer as a pragmatic, no-new-globals choice. If the
   kernel grows beyond the pilot, the trace name will be misleading
   (entries say `selectable-kernel.run` but live in
   `window.__cameraFitTrace`). Documented; no rename now.
3. **No new e2e tests added for FilterBar/UsersSidebar surfaces** — the
   existing `e2e/camera-qa.spec.ts` suite already exercises MyCatalog
   replay (`Active re-click replays the same fit`). Health chips and
   user-row tests would require authenticated storageState beyond what
   the harness currently sets up. Deferred to a follow-up to keep the
   pilot scope honest. Existing tests must keep passing unchanged.
4. **`buildUniqueMyCatalogPopoverOpId` is now dead code** at the
   popover, but kept exported for callers we may not have indexed.
   Cleanup belongs to the post-pilot tidy pass, not here.

---

## 6. Primitives still premature (do NOT extract yet)

Per §5 evidence and approval clause:

- **`OverlaySurface`** — touching popovers/dialogs was excluded; pilot
  produced no evidence one way or the other. Defer.
- **`BlockingOperation` (feedback contract)** — heavy-ops integration
  works as-is at the pilot sites; no new gap surfaced.
- **`ObservableAction` (global trace)** — the kernel piggybacked on the
  Camera QA trace successfully; introducing a new global trace would
  duplicate infrastructure for zero new signal.
- **`StatefulSelection` (reducer skeleton)** — three pilot sites read
  from three different stores (`useLocationsStore.filters` for two
  axes, `filters.filterByUserId` for the third). Unifying would be a
  much larger refactor and is not justified by pilot evidence.
- **`StatusSurface`, `ContextualSurface`, `DismissibleSurface`,
  `FocusEmitter` (formal extraction)** — no consumer added pressure to
  extract these during the pilot. Keep as documented contracts only.

Net: of the ten primitive candidates in
`docs/interaction-primitives.md`, **only `Selectable` and a degraded
form of `Replayable` proved extractable** in this pilot.

---

## 7. Success criterion (per approval)

> *"El éxito del piloto se mide por reducción de semántica duplicada,
> no por 'completar' arquitectura."*

- Three call sites now share **one** decision point for change vs
  replay vs always (`runSelectable`).
- Three call sites now share **one** opId generator (`buildOpId`).
- Three call sites now share **one** `disabled` resolution
  (`resolveSelectableState`).
- Zero call sites gained false affordance; one call site (MyCatalog)
  lost it (count=0 rows now truly disabled).
- Pre-existing event names, reasons, listeners and camera contract
  unchanged.

The pilot ships as a small, reversible kernel. Reverting is one folder
delete + three call-site reverts.

---

## 8. Conclusión arquitectónica: `Replayable` no generaliza

Pilot 1 produjo evidencia concreta de que el contrato `Replayable`
descrito en `docs/interaction-primitives.md` §1.2 (versión original)
no puede describir las tres superficies a la vez sin convertirse en
un foot-gun:

| Superficie | Gesto físico | Intento de producto en re-click |
|---|---|---|
| `MyCatalogQuickFilters` | re-click sobre fila activa | mantener selección + recentrar (subset-fit con opId fresco) |
| `UsersSidebar` (`handleFilterByUser`) | re-click sobre fila activa | mantener selección + recentrar el subset del usuario (subset-fit `user-filter`) |
| `FilterBar` Health chips | re-click sobre chip activo | **deseleccionar** (eje vuelve a `'all'`); NO hay nada que recentrar |

Mismo gesto, dos intenciones opuestas. El kernel del piloto absorbió
la divergencia exponiendo `onChange` y `onReplay` como slots
opcionales, pero **omitir `onReplay` por accidente colapsa silenciosamente
"recenter" en "no-op"**, exactamente la clase de fallo que el contrato
pretendía eliminar. La uniformidad teórica de `Replayable` es, en la
práctica, una uniformidad sintáctica que oculta dos contratos
distintos.

## 9. Decisión: split en dos contratos

Ratificado en `docs/interaction-primitives.md` §1.2a / §1.2b:

- **`RecenterableSelection`** — re-click MANTIENE la selección y
  REEMITE intención/focus/fit con `opId` fresco. Call sites pilot:
  `MyCatalogQuickFilters`, `UsersSidebar`.
- **`ToggleableSelection`** — re-click LIMPIA la selección
  (axis → `null`/default), emite trace con `opId` fresco, NO reemite
  focus/fit. Call site pilot: `FilterBar` Health chips.

`runSelectable` (`src/shared/interaction/selectable-kernel.ts`)
**queda como helper transitorio del piloto** (`pilot-frozen`):

- Permanece en uso por las tres superficies migradas.
- **NO debe extenderse a nuevos call sites.**
- Será reemplazado por `runRecenterableSelection` /
  `runToggleableSelection` en Pilot 2, una vez ratificado el split.
- Hasta entonces, cualquier superficie nueva que se quiera
  estandarizar debe esperar al Pilot 2; no se debe replicar el
  patrón `onChange` + `onReplay` opcional.

## 10. Riesgo de instrumentación: `traceSelectable` sobre `cameraFitTrace`

El kernel escribe sus entradas (`selectable-kernel.run`) en
`window.__cameraFitTrace` vía `traceCameraFit`. Esto fue **pragmatismo
deliberado del piloto**: existe un ring buffer probado, un harness QA
ya conectado (`e2e/camera-qa.spec.ts`), y la restricción de
"cero nuevos traces/stores/providers" prohibía abrir un canal nuevo.

**Por qué es un riesgo a futuro**:

- El nombre del canal (`cameraFitTrace`) miente: contiene entradas
  que no son de cámara.
- Mezcla dos semánticas (intent de cámara vs intent de selección),
  lo que dificultará particionar el log cuando aparezca `ObservableAction`.
- Cualquier cambio en el ring buffer de cámara afectará al trace de
  selectable y viceversa.

**No es el canal definitivo.** Acción pendiente (no en este alcance):
cuando se ratifique `ObservableAction`, migrar las entradas
`selectable-kernel.*` a su propio buffer (`window.__appActionTrace` o
equivalente) y dejar `cameraFitTrace` limpio. Mientras tanto, el
acoplamiento queda documentado aquí y en `mem://architecture/interaction-kernel-pilot-1`.

## 11. Dead code legacy: `buildUniqueMyCatalogPopoverOpId`

Ya no se invoca desde código de producción (sustituido por
`buildOpId('mycatalog-popover')` del kernel). Sigue:

- Exportado en `src/components/toolbar/use-my-catalog-popover-fit.ts`.
- Referenciado narrativamente en `docs/contracts/subset-fit-contract.md`
  como descripción del comportamiento (el doc no ejecuta código).

Acción aplicada en este alcance: marcado `@deprecated` con JSDoc
apuntando a `buildOpId`. **No se elimina el export** porque actualizar
`subset-fit-contract.md` queda fuera del alcance "solo docs +
deprecation mark"; la retirada física pertenece a una pasada de
limpieza posterior, junto con la actualización del contrato.
