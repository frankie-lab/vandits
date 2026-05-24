/**
 * P-POPUP-17 — Operational broadcast for enrichment.
 *
 * Contract:
 *  - `location:enrichment-phase` events with `phase ∈ start|update|end` drive
 *    the popup operational overlay (P-POPUP-16) for the open POI ONLY.
 *  - If the popup of the event's `id` is not in the DOM, the event is a no-op.
 *  - `triggerEnrichLocation` emits start/end automatically unless `silent:true`.
 *  - The single listener is mounted via `subscribePopupEnrichmentPhase`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  emitEnrichmentPhase,
  subscribePopupEnrichmentPhase,
  ENRICHMENT_PHASE_EVENT,
} from '@/components/map/popup-enrichment-phase-bus';
import {
  getPopupIdForLocation,
  POPUP_OPERATIONAL_STATE_ATTR,
  POPUP_SCROLL_BODY_ATTR,
  POPUP_OPERATIONAL_OVERLAY_CLASS,
} from '@/components/map/popup-operational-state';

const OPEN_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_ID = '99999999-8888-7777-6666-555555555555';

function mountPopup(locationId: string): string {
  const id = getPopupIdForLocation(locationId);
  const root = document.createElement('div');
  root.id = id;
  root.setAttribute(POPUP_OPERATIONAL_STATE_ATTR, 'idle');
  const body = document.createElement('div');
  body.setAttribute(POPUP_SCROLL_BODY_ATTR, 'v1');
  root.appendChild(body);
  document.body.appendChild(root);
  return id;
}

let unsub: () => void;

beforeEach(() => {
  document.body.innerHTML = '';
  unsub = subscribePopupEnrichmentPhase();
});

afterEach(() => {
  unsub?.();
  document.body.innerHTML = '';
});

describe('P-POPUP-17 — popup operational broadcast', () => {
  it('start event over the open POI mounts the overlay with the given label', () => {
    const popupId = mountPopup(OPEN_ID);

    emitEnrichmentPhase({ id: OPEN_ID, phase: 'start', label: 'Enriqueciendo POI…' });

    const root = document.getElementById(popupId)!;
    expect(root.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('loading');
    const label = root.querySelector('.popup-operational-label')?.textContent ?? '';
    expect(label).toBe('Enriqueciendo POI…');
  });

  it('end event releases the overlay back to idle', () => {
    const popupId = mountPopup(OPEN_ID);
    emitEnrichmentPhase({ id: OPEN_ID, phase: 'start', label: 'X' });
    emitEnrichmentPhase({ id: OPEN_ID, phase: 'end' });

    const root = document.getElementById(popupId)!;
    expect(root.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('idle');
    expect(root.querySelector(`.${POPUP_OPERATIONAL_OVERLAY_CLASS}`)).toBeNull();
  });

  it('update event replaces label in-place without remount', () => {
    const popupId = mountPopup(OPEN_ID);
    emitEnrichmentPhase({ id: OPEN_ID, phase: 'start', label: 'A' });
    const rootBefore = document.getElementById(popupId);
    emitEnrichmentPhase({ id: OPEN_ID, phase: 'update', label: 'B' });
    const rootAfter = document.getElementById(popupId);

    // Same DOM node — no remount of root or scroll-body (G2).
    expect(rootAfter).toBe(rootBefore);
    expect(rootAfter!.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('loading');
    const label = rootAfter!.querySelector('.popup-operational-label')?.textContent ?? '';
    expect(label).toBe('B');
  });

  it('event for a POI whose popup is NOT in the DOM is a no-op (I1)', () => {
    const popupId = mountPopup(OPEN_ID);
    // Sanity: target popup starts idle.
    expect(document.getElementById(popupId)!.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('idle');

    // Phase event for a DIFFERENT POI must NOT alter the open popup.
    emitEnrichmentPhase({ id: OTHER_ID, phase: 'start', label: 'noise' });

    expect(document.getElementById(popupId)!.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('idle');
    // And it must NOT have created any phantom popup for OTHER_ID.
    expect(document.getElementById(getPopupIdForLocation(OTHER_ID))).toBeNull();
  });

  it('listener can be unsubscribed (no leaks)', () => {
    const popupId = mountPopup(OPEN_ID);
    unsub();
    emitEnrichmentPhase({ id: OPEN_ID, phase: 'start', label: 'should-not-apply' });
    expect(document.getElementById(popupId)!.getAttribute(POPUP_OPERATIONAL_STATE_ATTR)).toBe('idle');
  });
});

describe('P-POPUP-17 — producer contract', () => {
  it('triggerEnrichLocation accepts `silent` opt so orchestrators can own the overlay', () => {
    // Static contract test — guards the option signature against accidental
    // removal. Runtime behavior is exercised by the orchestrator tests
    // (popup-curation-validate-geo.test.ts) which assert no flicker.
    const src = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../domains/content/lib/enrich-location.ts'),
      'utf8',
    );
    expect(src).toMatch(/silent\?:\s*boolean/);
    expect(src).toMatch(/emitEnrichmentPhase\(\s*\{[\s\S]*?phase:\s*'start'/);
    expect(src).toMatch(/emitEnrichmentPhase\(\s*\{[\s\S]*?phase:\s*'end'/);
  });

  it('advance-poi-curation passes silent:true so its own labels survive the inner enrich', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../domains/content/lib/advance-poi-curation.ts'),
      'utf8',
    );
    expect(src).toMatch(/triggerEnrichLocation\([\s\S]{0,80}silent:\s*true/);
  });

  it('event name is the canonical one (anti-rename guard)', () => {
    expect(ENRICHMENT_PHASE_EVENT).toBe('location:enrichment-phase');
  });
});
