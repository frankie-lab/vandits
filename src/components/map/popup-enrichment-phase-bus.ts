/**
 * P-POPUP-17 — Enrichment phase event bus.
 *
 * Single source of truth for the broadcast that drives the popup's
 * operational overlay (P-POPUP-16) when ANY enrichment mutation happens
 * over the currently-open POI, regardless of which entry point fired it.
 *
 * Contract:
 *   - Event name: `location:enrichment-phase`
 *   - Detail: { id: locationId, phase: 'start' | 'update' | 'end', label? }
 *
 * Producers (must emit):
 *   - `triggerEnrichLocation` (start/end), unless invoked with `silent:true`
 *     by an orchestrator that owns the popup state across multiple stages.
 *   - `advancePoiCurationUntilBlocked` (start/update/end), so the overlay
 *     is held across `validate-geo → enrich → recompute` without flicker.
 *
 * Consumer (single global listener):
 *   - `subscribePopupEnrichmentPhase` mounts ONE window listener that maps
 *     the event onto `setPopupOperationalState`. If the popup of `id` is
 *     not in the DOM, the event is ignored (I1 from popup-contract.md).
 *
 * See:
 *   - mem://style/popup/operational-loading-state
 *   - docs/contracts/popup-contract.md § P-POPUP-17
 */

import {
  setPopupOperationalState,
  clearPopupOperationalState,
  getPopupIdForLocation,
} from '@/components/map/popup-operational-state';

export const ENRICHMENT_PHASE_EVENT = 'location:enrichment-phase';

export type EnrichmentPhase = 'start' | 'update' | 'end';

export interface EnrichmentPhaseDetail {
  id: string;
  phase: EnrichmentPhase;
  label?: string;
}

/** Emit a phase event. Safe in non-DOM environments (no-op). */
export function emitEnrichmentPhase(detail: EnrichmentPhaseDetail): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(ENRICHMENT_PHASE_EVENT, { detail }));
  } catch {
    /* noop */
  }
}

/**
 * Mount the single global listener that drives popup operational state.
 * Returns an unsubscribe function.
 *
 * Idempotent: each call adds its own listener. The intended use is one
 * mount inside `usePopupActions` for the lifetime of the app shell.
 */
export function subscribePopupEnrichmentPhase(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<EnrichmentPhaseDetail>).detail;
    if (!detail || !detail.id) return;
    const popupId = getPopupIdForLocation(detail.id);
    // I1 — never mount overlay if the popup is not in the DOM.
    if (!document.getElementById(popupId)) return;
    if (detail.phase === 'end') {
      clearPopupOperationalState(popupId);
      return;
    }
    setPopupOperationalState(popupId, 'loading', { label: detail.label });
  };
  window.addEventListener(ENRICHMENT_PHASE_EVENT, handler);
  return () => window.removeEventListener(ENRICHMENT_PHASE_EVENT, handler);
}
