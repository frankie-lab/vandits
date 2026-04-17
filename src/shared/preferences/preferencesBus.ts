/**
 * preferencesBus — TEMPORARY BRIDGE for preference change notifications.
 *
 * ⚠️  This module is intentionally a bridge, not the long-term destination.
 *     See `docs/adr/002-preferences-bus-bridge.md`.
 *
 * Current implementation: CustomEvent on `window` (`vandits:pref-changed`).
 * Future implementation: a dedicated reactive store (Zustand slice with
 *   `useSyncExternalStore`) or a module-scoped `Set<Listener>` emitter —
 *   chosen so the public surface (`emitPrefChanged` / `onPrefChanged`)
 *   stays unchanged for all consumers.
 *
 * Rules for callers:
 *   - Always import from `@/shared/preferences` (re-exported), never
 *     dispatch `vandits:pref-changed` events by hand.
 *   - Do not piggyback unrelated app events on this channel.
 *   - Level-B admin config channels (e.g. `useMarkerSizeConfig`) have
 *     their own listener bus and MUST NOT be merged here.
 */
import type { PreferenceScope, ScopeOverrides } from './types';

export interface PrefChangedDetail {
  unitId: string;
  scope: PreferenceScope;
  overrides: ScopeOverrides;
}

export type PrefListener = (detail: PrefChangedDetail) => void;

const EVENT_NAME = 'vandits:pref-changed';

/**
 * Emit a preference change notification.
 */
export function emitPrefChanged(detail: PrefChangedDetail): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

/**
 * Subscribe to preference changes. Returns an unsubscribe function.
 */
export function onPrefChanged(listener: PrefListener): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<PrefChangedDetail>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
