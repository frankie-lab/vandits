# P-POPUP-16 — Operational loading state for popup actions

Introduce a transient `operational loading` state on the canonical POI popup so async curation/context actions (validate-geo, resolve-conflict, nearby-context, heal, re-enrich, name) communicate progress in-place, block double-clicks, and refresh content without destroying the popup shell.

## Canon

- Single canonical popup root keeps `data-popup-version="geo-canonical-v1"`.
- New orthogonal attribute on that same root: `data-popup-operational-state="idle" | "loading" | "error"`.
- Default `idle`. Renderer, composer, ratings block, footer, hero, shell, marker grammar — UNTOUCHED.
- Loading is a layered overlay inside the popup; never a new shell, never a modal, never a layout fork.

## Hard guards (canonical)

**G1 — Overlay must never alter popup layout.**
Loading state appears/disappears as an absolutely-positioned overlay over the existing scroll body. It must NOT change popup width, height, scroll offset, nor cause reflow of hero/breadcrumb/body/footer. Implementation rules:
- Overlay node is `position: absolute; inset: 0;` inside the scroll body wrapper, which is `position: relative;`.
- Overlay is OUTSIDE the normal flow — does not push/replace children.
- Dimming is applied via CSS variable + `opacity` on the existing body (no `display`, no DOM removal of body children, no re-render of slots).
- Footer remains in flow at its fixed position; only its buttons get `pointer-events: none` + reduced opacity.
- No min-height bump, no spinner growing the popup, no scroll reset.

**G2 — Loading state never destroys or rebuilds the popup root.**
Forbidden during state transitions:
- destroying or recreating the popup root element;
- calling `rebindPopup` / `popup.setContent(...)` with regenerated HTML;
- remounting hero, breadcrumb, body slots or footer;
- losing scroll position of the body;
- losing visual context (selected text, focus, hover state).

All mutation is in-place: only `data-popup-operational-state` attribute toggles and the overlay child is added/removed. The popup root element identity (`===`) MUST remain stable across `setPopupOperationalState` / `clearPopupOperationalState` cycles.

## Files

### New — `src/components/map/popup-operational-state.ts`
Pure DOM helper, no React, no business logic.

API:
```ts
type PopupOperationalState = 'idle' | 'loading' | 'error';
setPopupOperationalState(popupId: string, state: PopupOperationalState, opts?: { label?: string }): void
clearPopupOperationalState(popupId: string): void  // alias of set(..., 'idle')
isPopupOperational(popupId: string): boolean
```

Behavior:
- Finds `#${popupId}` (popup root). No-op if missing. Never creates/replaces the root.
- Toggles `data-popup-operational-state` on the root via `setAttribute` only.
- On `loading`: finds scroll-body wrapper (`[data-popup-scroll-body="v1"]`); ensures `position: relative` is set (one-time, idempotent); injects a single child `<div class="popup-operational-overlay" data-popup-operational-overlay="v1">` (absolute, inset 0) with centered spinner + optional `<span>` label. Idempotent: re-calling updates label, never duplicates the overlay node and never rebuilds siblings.
- On `idle`/`error`: removes the overlay node only. Leaves root, body, footer, hero, breadcrumb untouched.
- `error` is a state hook only (no chrome in v1).
- Scroll body gets `aria-busy="true"` while loading; cleared on `idle`.

### Edit — `src/components/map/map-popups.ts`
- Add `data-popup-operational-state="idle"` to the root `<div id="${popupId}" data-popup-version=...>` (single attribute, no layout change).
- Mark the scroll-body wrapper with `data-popup-scroll-body="v1"` if not already.
- Extend the inline popup `<style>` with `.popup-operational-overlay` rules (absolute, centered flex, semi-transparent backdrop `hsl(var(--background) / 0.55)`, z-index above body / below shell chrome). Body dim rule:
```css
[data-popup-operational-state="loading"] [data-popup-scroll-body="v1"] > *:not(.popup-operational-overlay) {
  opacity: var(--popup-loading-opacity, 0.5);
  pointer-events: none;
  user-select: none;
  transition: opacity 120ms ease;
}
[data-popup-operational-state="loading"] [data-popup-footer="v1"] button {
  pointer-events: none;
  opacity: 0.6;
}
```
The selector targets siblings of the overlay so the overlay itself stays fully opaque and interactive only for the spinner.

### Edit — `src/domains/content/hooks/use-popup-actions.ts`
Wrap the async branches for canonical operational actions with `setPopupOperationalState(popupId, 'loading', { label })` → `try/finally → clearPopupOperationalState(popupId)`. `popupId` is derived from `location.id` using the existing popup-id convention exported from `map-popups.ts` (add a small `getPopupId(locationId)` helper if not present).

Initial integration set:
| action | label |
|---|---|
| `enrich` / `regenerate` / `quick-classify` | "Re-enriqueciendo POI…" |
| `view-nearby` / `merge-nearby` | "Buscando contexto cercano…" |
| `heal-poi` | "Sanando POI…" |
| `resolve-conflict` | "Validando geografía…" |

Double-click guard at the top of those branches: `if (isPopupOperational(popupId)) return;`.

### New tests — `src/test/popup-operational-state.test.ts`
- `setPopupOperationalState('id', 'loading')` sets `data-popup-operational-state="loading"` on root.
- Overlay node `.popup-operational-overlay` exists exactly once (idempotent on repeated calls; label updates without duplication).
- `clearPopupOperationalState` removes overlay and resets attribute to `idle`.
- Loading state does NOT mutate `data-popup-version`, `data-popup-footer`, hero, breadcrumb, or scroll body innerHTML (snapshot before/after excluding the overlay node).
- **G1 guard**: popup root `getBoundingClientRect()` width/height identical before/during/after loading state (jsdom-friendly variant: inline styles + computed `width`/`height` unchanged; no new wrapper elements around root).
- **G2 guard**: root node reference captured before `setPopupOperationalState` is `===` to the node after `setPopupOperationalState` and after `clearPopupOperationalState`. Scroll body node identity also stable. No `MutationObserver` records of `childList` removal on root or body slots (only addition/removal of the overlay child).

### Edit — `src/test/popup-curation-primary-action.test.ts` + `popup-golden-poi-contract.test.ts`
Add guards:
- Root keeps `data-popup-operational-state="idle"` at initial render.
- No level/state introduces `data-popup-footer="v2"` or any alternative shell wrapper.

## Out of scope (explicit non-goals)
- No new renderer, composer, ratings block, footer, marker grammar, PopupShell.
- No error UI chrome (state hook only; toast remains current feedback channel).
- No global popup registry refactor.
- No changes to hero, breadcrumb, taxonomia.

## Verification
- `vitest run popup-operational-state popup-curation-primary-action popup-golden-poi-contract popup-footer-persistent popup-unified-renderer popup-no-diag-badges`.
- Manual: click "Re-enriquecer" on a POI → body dims, spinner appears centered, popup width/height/scroll unchanged, footer buttons disabled; on resolve → overlay fades out, popup root is the same DOM element, content refreshes in place.
