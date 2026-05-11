/**
 * Apply token overrides to the live document.
 *
 * Writes a single <style id="ds-token-overrides"> element with two rule blocks:
 *   :root  { ... }   — light-mode + non-color tokens (effective != base)
 *   .dark  { ... }   — dark-mode color tokens (effective != base)
 *
 * The override map can target:
 *   - A primitive path (e.g. "color.primitives.light.neutral.0"): cascades to
 *     every alias that $refs it.
 *   - A semantic alias path (e.g. "color.light.card"): overrides only that
 *     CSS var.
 *
 * Idempotent: call with the latest overrides map on every change.
 */
import { getAllLeaves, getLeaf, type TokenLeaf } from './token-registry';

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

/**
 * Resolve the effective value for `path` taking overrides + $ref chain into
 * account. Override on `path` itself wins; otherwise follow $ref to a leaf
 * whose value (or override) terminates the chain.
 */
export function resolveEffective(
  path: string,
  overrides: OverrideMap,
  seen: Set<string> = new Set(),
): string | number | undefined {
  if (overrides[path] !== undefined) return overrides[path];
  if (seen.has(path)) return undefined;
  seen.add(path);
  const leaf = getLeaf(path);
  if (!leaf) return undefined;
  if (leaf.refPath) return resolveEffective(leaf.refPath, overrides, seen);
  return leaf.baseValue;
}

function emitLeaf(leaf: TokenLeaf, overrides: OverrideMap): string | null {
  if (!leaf.cssVar) return null;
  const effective = resolveEffective(leaf.path, overrides);
  if (effective === undefined) return null;
  if (String(effective) === String(leaf.baseValue)) return null;
  return `${leaf.cssVar}: ${effective};`;
}

export function applyOverrides(overrides: OverrideMap): void {
  if (typeof document === 'undefined') return;
  const lightRules: string[] = [];
  const darkRules: string[] = [];

  for (const leaf of getAllLeaves()) {
    const rule = emitLeaf(leaf, overrides);
    if (!rule) continue;
    if (leaf.mode === 'dark') darkRules.push(rule);
    else lightRules.push(rule);
  }

  const css =
    `:root{${lightRules.join('')}}` +
    (darkRules.length ? `.dark{${darkRules.join('')}}` : '');
  ensureStyleEl().textContent = css;
}

export function cacheApplied(overrides: OverrideMap): void {
  (window as unknown as { __dsOverrides?: OverrideMap }).__dsOverrides = { ...overrides };
}

export function clearOverrides(): void {
  applyOverrides({});
  cacheApplied({});
}
