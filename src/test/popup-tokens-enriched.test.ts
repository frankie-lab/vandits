/**
 * P-POPUP-1 contract test — guards the tokenized branch of
 * `createPopupContent()` (the `if (isEnriched && enriched)` block) against
 * regression of hardcoded hex / rgba literals outside the controlled
 * legacy-fallback half of the `tk(token, legacy)` helper.
 *
 * Strategy: static scan of `src/components/map/map-popups.ts`.
 * - Locate the `if (isEnriched && enriched) {` line.
 * - Walk forward counting braces until the matching `}` of the `if`-block
 *   (the closing brace of the enriched branch).
 * - For every line in that range, strip out string literals passed to `tk(
 *   'token', 'legacy')` (the legacy arg is the documented fallback for
 *   instant rollback and is NOT considered a new hardcode).
 * - Assert: no `#xxxxxx` and no `rgba?(...)` survive the strip pass.
 *
 * If this test fails, either:
 *  (a) someone added a fresh hex literal to the enriched branch (revert it
 *      and wrap with `tk()`), OR
 *  (b) someone bypassed the helper (route the new color through `tk()`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = resolve(__dirname, '../components/map/map-popups.ts');

function extractEnrichedBranch(src: string): string {
  const lines = src.split('\n');
  // P-POPUP-13 — Rama legacy eliminada. El shell canónico es el único
  // bloque tras `P-POPUP-13 — Renderer único`. Anclamos el extractor a
  // ese marker para mantener la guard sobre el shell único.
  const startIdx = lines.findIndex(l => l.includes('P-POPUP-13 — Renderer único'));
  if (startIdx < 0) throw new Error('canonical unified shell start not found');
  // Brace counting begins at the `{` on the same line.
  let depth = 0;
  let started = false;
  const collected: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    collected.push(line);
    for (const ch of line) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; }
    }
    if (started && depth === 0) return collected.join('\n');
  }
  throw new Error('enriched branch end not found');
}

/** Remove the legacy-fallback half of every `tk('token', 'legacy')` call. */
function stripLegacyFallbacks(branch: string): string {
  // Match tk('...','...') OR tk("...","...") with optional whitespace.
  // Conservative: only single-line calls (which is how we use it).
  return branch.replace(
    /tk\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3\s*\)/g,
    (_m, _q1, tokenArg) => `tk('${tokenArg}')`,
  );
}

describe('P-POPUP-1 — enriched branch contract', () => {
  const src = readFileSync(SRC, 'utf8');
  const branch = extractEnrichedBranch(src);
  const stripped = stripLegacyFallbacks(branch);

  it('extracts a non-trivial enriched branch', () => {
    expect(branch.length).toBeGreaterThan(2000);
    expect(branch).toContain('if (isEnriched && enriched) {');
  });

  it('strips the legacy half of tk() calls before scanning', () => {
    // Sanity: at least one tk() call was rewritten.
    expect(stripped).not.toBe(branch);
    expect(stripped).toMatch(/tk\(['"]hsl\(var\(--/);
  });

  it('contains zero hardcoded 6-digit hex literals (outside tk legacy)', () => {
    const hexes = stripped.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(
      hexes,
      `Unexpected hex literals in the tokenized enriched branch.\n` +
        `If you need a new color, wrap it with tk('hsl(var(--token))', '#legacy').`,
    ).toEqual([]);
  });

  it('contains zero hardcoded 3-digit hex literals (outside tk legacy)', () => {
    // Allow inside SVG path data attributes? Conservative: none expected
    // in the enriched branch's style attributes.
    const hexes = stripped.match(/#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g) ?? [];
    expect(hexes).toEqual([]);
  });

  it('contains zero rgba()/rgb() literals (outside tk legacy)', () => {
    const rgbas = stripped.match(/\brgba?\(/g) ?? [];
    expect(rgbas).toEqual([]);
  });

  it('exposes the feature flag default explicitly', () => {
    expect(src).toContain('POPUP_TOKENS_ENRICHED_V1_DEFAULT');
    expect(src).toMatch(/POPUP_TOKENS_ENRICHED_V1_DEFAULT\s*=\s*true/);
  });

  it('honors window override for runtime rollback', () => {
    expect(src).toContain('__POPUP_TOKENS_ENRICHED_V1__');
  });
});
