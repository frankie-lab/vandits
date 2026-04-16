/**
 * preferencesBus — Encapsulated notification mechanism for preference changes.
 *
 * Today: uses CustomEvent on window.
 * Tomorrow: can be swapped to Zustand, useSyncExternalStore, or a Set<Function>
 * emitter without touching any consumer.
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
