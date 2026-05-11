/**
 * Apply token overrides to the live document.
 *
 * Writes a single <style id="ds-overrides"> element with two rule blocks:
 *   :root  { ... }   — light-mode + non-color tokens
 *   .dark  { ... }   — dark-mode color tokens
 *
 * Idempotent: call with the latest overrides map on every change.
 */
import { getLeaf, type TokenLeaf } from './token-registry';

export type OverrideMap = Record<string, string | number>;

const STYLE_ID = 'ds-token-overrides';

function ensureStyleEl(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

export function applyOverrides(overrides: OverrideMap): void {
  if (typeof document === 'undefined') return;
  const lightRules: string[] = [];
  const darkRules: string[] = [];

  for (const [path, value] of Object.entries(overrides)) {
    const leaf = getLeaf(path);
    if (!leaf || !leaf.cssVar) continue;
    const rule = `${leaf.cssVar}: ${value};`;
    if (leaf.mode === 'dark') darkRules.push(rule);
    else lightRules.push(rule);
  }

  const css =
    `:root{${lightRules.join('')}}` +
    (darkRules.length ? `.dark{${darkRules.join('')}}` : '');
  ensureStyleEl().textContent = css;
}

/** Convenience: apply a single override on top of the current sheet (used in edit mode). */
export function applyOne(leaf: TokenLeaf, value: string | number): void {
  if (!leaf.cssVar) return;
  const map = readApplied();
  map[leaf.path] = value;
  applyOverrides(map);
}

/** Best-effort read of currently applied overrides (parses the style sheet). */
function readApplied(): OverrideMap {
  // Stored separately on the window for cheap round-tripping.
  const cache = (window as unknown as { __dsOverrides?: OverrideMap }).__dsOverrides;
  return cache ? { ...cache } : {};
}

export function cacheApplied(overrides: OverrideMap): void {
  (window as unknown as { __dsOverrides?: OverrideMap }).__dsOverrides = { ...overrides };
}

export function clearOverrides(): void {
  applyOverrides({});
  cacheApplied({});
}
