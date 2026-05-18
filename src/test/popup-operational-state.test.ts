/**
 * P-POPUP-16 — Operational loading state contract.
 *
 * Guards:
 *  G1 — overlay must NEVER alter popup layout (no width/height/reflow).
 *  G2 — loading state NEVER destroys or rebuilds the popup root nor the
 *       scroll body. Identity of both nodes is stable across cycles.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setPopupOperationalState,
  clearPopupOperationalState,
  isPopupOperational,
  getPopupIdForLocation,
  POPUP_OPERATIONAL_STATE_ATTR,
  POPUP_OPERATIONAL_OVERLAY_CLASS,
} from '@/components/map/popup-operational-state';

const POPUP_ID = 'popup-12345678';

function mountPopup(): { root: HTMLElement; body: HTMLElement } {
  document.body.innerHTML = `
    <div id="${POPUP_ID}" data-popup-version="geo-canonical-v1" data-popup-operational-state="idle"
         style="width: 380px; height: 400px;">
      <div data-popup-hero="v1">hero</div>
      <div class="popup-scroll-body" data-popup-scroll-body="v1" style="position: relative;">
        <div data-slot="body">body content</div>
      </div>
      <div data-popup-footer="v1"><button>action</button></div>
    </div>
  `;
  const root = document.getElementById(POPUP_ID) as HTMLElement;
  const body = root.querySelector<HTMLElement>('[data-popup-scroll-body="v1"]')!;
  return { root, body };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('popup-operational-state', () => {
  it('getPopupIdForLocation matches the renderer convention', () => {
    expect(getPopupIdForLocation('abcdef1234567890')).toBe('popup-abcdef12');
  });

  it('setPopupOperationalState("loading") sets attribute + injects overlay once', () => {
    const { root, body } = mountPopup();
    setPopupOperationalState(POPUP_ID, 'loading', { label: 'Validando geografía…' });
    expect(root.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('loading');
    expect(isPopupOperational(POPUP_ID)).toBe(true);
    expect(body.querySelectorAll(`.${POPUP_OPERATIONAL_OVERLAY_CLASS}`)).toHaveLength(1);
    expect(body.querySelector('.popup-operational-label')?.textContent).toBe('Validando geografía…');
  });

  it('is idempotent: repeated calls do not duplicate the overlay; label updates', () => {
    const { body } = mountPopup();
    setPopupOperationalState(POPUP_ID, 'loading', { label: 'A' });
    setPopupOperationalState(POPUP_ID, 'loading', { label: 'B' });
    setPopupOperationalState(POPUP_ID, 'loading', { label: 'C' });
    expect(body.querySelectorAll(`.${POPUP_OPERATIONAL_OVERLAY_CLASS}`)).toHaveLength(1);
    expect(body.querySelector('.popup-operational-label')?.textContent).toBe('C');
  });

  it('clearPopupOperationalState removes overlay + resets attribute', () => {
    const { root, body } = mountPopup();
    setPopupOperationalState(POPUP_ID, 'loading');
    clearPopupOperationalState(POPUP_ID);
    expect(root.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('idle');
    expect(body.querySelector(`.${POPUP_OPERATIONAL_OVERLAY_CLASS}`)).toBeNull();
    expect(isPopupOperational(POPUP_ID)).toBe(false);
  });

  it('does not mutate canonical popup attributes (version, footer)', () => {
    const { root } = mountPopup();
    setPopupOperationalState(POPUP_ID, 'loading');
    expect(root.getAttribute('data-popup-version')).toBe('geo-canonical-v1');
    expect(root.querySelectorAll('[data-popup-footer="v1"]')).toHaveLength(1);
  });

  it('does not mutate hero, footer, or body slot innerHTML (excluding overlay)', () => {
    const { root, body } = mountPopup();
    const heroBefore = root.querySelector('[data-popup-hero="v1"]')!.outerHTML;
    const footerBefore = root.querySelector('[data-popup-footer="v1"]')!.outerHTML;
    const slotBefore = body.querySelector('[data-slot="body"]')!.outerHTML;
    setPopupOperationalState(POPUP_ID, 'loading');
    expect(root.querySelector('[data-popup-hero="v1"]')!.outerHTML).toBe(heroBefore);
    expect(root.querySelector('[data-popup-footer="v1"]')!.outerHTML).toBe(footerBefore);
    expect(body.querySelector('[data-slot="body"]')!.outerHTML).toBe(slotBefore);
  });

  // G1 — overlay must not alter popup layout
  it('G1: popup root width/height (inline) are unchanged before/during/after loading', () => {
    const { root } = mountPopup();
    const widthBefore = root.style.width;
    const heightBefore = root.style.height;
    setPopupOperationalState(POPUP_ID, 'loading');
    expect(root.style.width).toBe(widthBefore);
    expect(root.style.height).toBe(heightBefore);
    clearPopupOperationalState(POPUP_ID);
    expect(root.style.width).toBe(widthBefore);
    expect(root.style.height).toBe(heightBefore);
  });

  it('G1: overlay is positioned absolutely inside scroll body (out of flow)', () => {
    const { body } = mountPopup();
    setPopupOperationalState(POPUP_ID, 'loading');
    const overlay = body.querySelector<HTMLElement>(`.${POPUP_OPERATIONAL_OVERLAY_CLASS}`)!;
    expect(overlay.style.position).toBe('absolute');
    expect(overlay.style.inset).toBe('0px');
    // scroll body must be the positioning context
    expect(body.style.position).toBe('relative');
  });

  it('G1: no new wrapper element is introduced around the popup root', () => {
    const { root } = mountPopup();
    const parentBefore = root.parentElement;
    setPopupOperationalState(POPUP_ID, 'loading');
    clearPopupOperationalState(POPUP_ID);
    expect(root.parentElement).toBe(parentBefore);
  });

  // G2 — root + scroll body identity stable across cycles
  it('G2: popup root node identity is stable across set/clear cycles', () => {
    const { root, body } = mountPopup();
    setPopupOperationalState(POPUP_ID, 'loading');
    expect(document.getElementById(POPUP_ID)).toBe(root);
    expect(root.querySelector('[data-popup-scroll-body="v1"]')).toBe(body);
    clearPopupOperationalState(POPUP_ID);
    expect(document.getElementById(POPUP_ID)).toBe(root);
    expect(root.querySelector('[data-popup-scroll-body="v1"]')).toBe(body);
  });

  it('G2: childList mutations are limited to overlay add/remove on scroll body', async () => {
    const { root, body } = mountPopup();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver(muts => records.push(...muts));
    observer.observe(root, { childList: true, subtree: true });

    setPopupOperationalState(POPUP_ID, 'loading');
    clearPopupOperationalState(POPUP_ID);

    // flush microtasks for MutationObserver
    await Promise.resolve();
    observer.disconnect();

    // Every childList mutation should occur on the scroll body and concern
    // only the overlay node — no hero/footer/body slot mutations.
    for (const rec of records) {
      expect(rec.target).toBe(body);
      const touched = [...rec.addedNodes, ...rec.removedNodes] as Element[];
      for (const node of touched) {
        expect(
          node.nodeType === 1 && (node as Element).classList?.contains(POPUP_OPERATIONAL_OVERLAY_CLASS)
        ).toBe(true);
      }
    }
  });

  it('error state behaves like idle (no overlay) but exposes the attribute hook', () => {
    const { root, body } = mountPopup();
    setPopupOperationalState(POPUP_ID, 'loading');
    setPopupOperationalState(POPUP_ID, 'error');
    expect(root.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('error');
    expect(body.querySelector(`.${POPUP_OPERATIONAL_OVERLAY_CLASS}`)).toBeNull();
    expect(isPopupOperational(POPUP_ID)).toBe(false);
  });

  it('no-op when popup root is missing', () => {
    expect(() => setPopupOperationalState('does-not-exist', 'loading')).not.toThrow();
    expect(isPopupOperational('does-not-exist')).toBe(false);
  });
});
