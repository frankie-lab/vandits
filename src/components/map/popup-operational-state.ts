/**
 * P-POPUP-16 — Operational loading state for popup actions
 *
 * Pure DOM helper. No React. No business logic.
 *
 * Canon:
 *  - Single canonical popup root keeps `data-popup-version="geo-canonical-v1"`.
 *  - Orthogonal attribute on that same root:
 *      `data-popup-operational-state="idle" | "loading" | "error"`.
 *  - Renderer / composer / ratings / footer / hero / shell / marker grammar
 *    are UNTOUCHED.
 *
 * Hard guards:
 *  G1 — Overlay must NEVER alter popup layout (absolute, inset:0, outside
 *       normal flow, opacity-only dim on existing siblings).
 *  G2 — Loading state NEVER destroys or rebuilds the popup root nor the
 *       scroll body. Identity of those nodes is stable across state cycles.
 */

export type PopupOperationalState = 'idle' | 'loading' | 'error';

export const POPUP_OPERATIONAL_STATE_ATTR = 'data-popup-operational-state';
export const POPUP_OPERATIONAL_OVERLAY_CLASS = 'popup-operational-overlay';
export const POPUP_OPERATIONAL_OVERLAY_ATTR = 'data-popup-operational-overlay';
export const POPUP_SCROLL_BODY_ATTR = 'data-popup-scroll-body';

/** Returns the canonical popup id for a given POI location id. */
export function getPopupIdForLocation(locationId: string): string {
  return `popup-${locationId.slice(0, 8)}`;
}

function findRoot(popupId: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(popupId);
}

function findScrollBody(root: HTMLElement): HTMLElement | null {
  // Prefer the canonical hook; fall back to the legacy class so existing
  // popups keep working even if `data-popup-scroll-body` has not been
  // re-rendered yet.
  return (
    root.querySelector<HTMLElement>(`[${POPUP_SCROLL_BODY_ATTR}="v1"]`) ??
    root.querySelector<HTMLElement>('.popup-scroll-body')
  );
}

function ensureOverlay(body: HTMLElement, label?: string): HTMLElement {
  let overlay = body.querySelector<HTMLElement>(`.${POPUP_OPERATIONAL_OVERLAY_CLASS}`);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = POPUP_OPERATIONAL_OVERLAY_CLASS;
    overlay.setAttribute(POPUP_OPERATIONAL_OVERLAY_ATTR, 'v1');
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    // G1: absolute overlay, outside normal flow, never reflows siblings.
    overlay.style.cssText = [
      'position: absolute',
      'inset: 0',
      'display: flex',
      'flex-direction: column',
      'align-items: center',
      'justify-content: center',
      'gap: 8px',
      'background: hsl(var(--background) / 0.55)',
      'backdrop-filter: blur(1px)',
      'z-index: 20',
      'pointer-events: auto',
      'transition: opacity 120ms ease',
    ].join('; ') + ';';
    overlay.innerHTML = `
      <div class="popup-operational-spinner" aria-hidden="true" style="width:22px;height:22px;border-radius:50%;border:2px solid hsl(var(--muted-foreground) / 0.25);border-top-color:hsl(var(--primary));animation:popup-op-spin 0.8s linear infinite;"></div>
      <span class="popup-operational-label" style="font-size:11px;color:hsl(var(--foreground));font-weight:500;text-align:center;max-width:80%;"></span>
    `;
    body.appendChild(overlay);
  }
  const labelEl = overlay.querySelector<HTMLElement>('.popup-operational-label');
  if (labelEl) labelEl.textContent = label ?? '';
  return overlay;
}

function removeOverlay(body: HTMLElement): void {
  const overlay = body.querySelector(`.${POPUP_OPERATIONAL_OVERLAY_CLASS}`);
  if (overlay) overlay.remove();
}

/**
 * Set the popup operational state in-place.
 *
 * G2: never destroys or rebuilds root / scroll body. Only toggles the
 * attribute and adds/removes the single overlay child.
 */
export function setPopupOperationalState(
  popupId: string,
  state: PopupOperationalState,
  opts?: { label?: string }
): void {
  const root = findRoot(popupId);
  if (!root) return;

  root.setAttribute(POPUP_OPERATIONAL_STATE_ATTR, state);

  const body = findScrollBody(root);
  if (!body) return;

  if (state === 'loading') {
    // G1: scroll body must be the positioning context for the overlay.
    const cs = body.style.position;
    if (!cs || cs === 'static') body.style.position = 'relative';
    body.setAttribute('aria-busy', 'true');
    ensureOverlay(body, opts?.label);
  } else {
    body.removeAttribute('aria-busy');
    removeOverlay(body);
  }
}

export function clearPopupOperationalState(popupId: string): void {
  setPopupOperationalState(popupId, 'idle');
}

export function isPopupOperational(popupId: string): boolean {
  const root = findRoot(popupId);
  if (!root) return false;
  return root.getAttribute(POPUP_OPERATIONAL_STATE_ATTR) === 'loading';
}
