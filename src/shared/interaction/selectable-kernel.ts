/**
 * selectable-kernel.ts — Pilot kernel for the Selectable + Replayable +
 * FocusEmitter primitives. Pure helpers, no React, no state, no providers.
 *
 * Scope (pilot 1, exhaustive):
 *   - MyCatalogQuickFilters rows   (replay-on-active)
 *   - FilterBar health chips       (toggle-off-on-active — see friction)
 *   - UsersSidebar row             (replay-on-active, focus emit)
 *
 * Hard constraints:
 *   - Stateless. Deterministic output for the same input.
 *   - No new global traces, stores or providers. Reuses `traceCameraFit`
 *     ring buffer that already powers Camera QA.
 *   - No mutation of camera, subset-fit, or any listener.
 *   - No new hooks. If a call site needs React state it stays at the call
 *     site; the kernel is invoked imperatively from existing handlers.
 *
 * Documented friction (do NOT remove without re-running the pilot):
 *   - `runSelectable` exposes BOTH `onChange` (selection diff) and
 *     `onReplay` (re-click on active). Surfaces with toggle-off
 *     semantics (FilterBar health) leave `onReplay` undefined and route
 *     the toggle-off through `onChange` instead. The kernel does NOT
 *     impose replay; it merely makes it observable.
 *
 * Ver docs/interaction-primitives.md, mem://ui/selector-interaction-contract.
 */

import { traceCameraFit } from '@/components/debug/camera-fit-trace';

// ─── opId ─────────────────────────────────────────────────────────────

/**
 * Single canonical opId generator. Produces `<prefix>#<nonce>` so two
 * consecutive clicks on the same row never collide in heavy-ops or in
 * the Camera QA trace.
 *
 * Deterministic shape, non-deterministic body (intentional: each call
 * MUST yield a fresh id).
 */
export function buildOpId(prefix: string): string {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}#${nonce}`;
}

// ─── Selectable visual state ──────────────────────────────────────────

export type SelectableState = 'idle' | 'active' | 'disabled';

/**
 * Maps `{ active, count }` to one of three buckets. Removes the false
 * affordance of count=0 rows that look clickable but produce no result.
 *
 * Rules:
 *   - `active` → 'active' (always, regardless of count).
 *   - `count === 0` → 'disabled'.
 *   - otherwise   → 'idle'.
 *
 * `count === undefined` is treated as "unknown count, assume non-zero"
 * so callers without a count source remain interactive.
 */
export function resolveSelectableState(args: {
  active: boolean;
  count?: number;
}): SelectableState {
  if (args.active) return 'active';
  if (typeof args.count === 'number' && args.count <= 0) return 'disabled';
  return 'idle';
}

// ─── Selectable run-time contract ─────────────────────────────────────

export interface RunSelectableArgs {
  /** Identifier for trace entries; not an opId, just a label. */
  source: string;
  /** True when the row clicked is already the active selection. */
  wasActive: boolean;
  /** Runs ALWAYS, before change/replay. Use for popover close + emit. */
  onAlways: (ctx: { opId: string; wasActive: boolean }) => void;
  /** Runs ONLY when the selection actually changes (wasActive === false). */
  onChange?: (ctx: { opId: string }) => void;
  /**
   * Runs ONLY when the same active row is re-clicked. Optional on
   * purpose: surfaces with toggle-off semantics omit this and let
   * `onChange` handle the deselection.
   */
  onReplay?: (ctx: { opId: string }) => void;
}

/**
 * Single decision point for "change vs replay vs always". The contract:
 *
 *   1. `onAlways` runs unconditionally (popover close, event emit, trace).
 *   2. `onChange` runs only on a true selection change.
 *   3. `onReplay` runs only on re-click of the active row, AND only if
 *      provided. Surfaces that toggle-off on re-click leave it undefined.
 *
 * The function is intentionally synchronous and returns void: side
 * effects belong to the caller, the kernel only orchestrates ordering.
 */
export function runSelectable(args: RunSelectableArgs): void {
  const opId = buildOpId(args.source);
  traceCameraFit('selectable-kernel.run', {
    source: args.source,
    wasActive: args.wasActive,
    opId,
    hasReplay: typeof args.onReplay === 'function',
  });
  args.onAlways({ opId, wasActive: args.wasActive });
  if (args.wasActive) {
    args.onReplay?.({ opId });
  } else {
    args.onChange?.({ opId });
  }
}
