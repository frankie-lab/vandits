import { describe, it, expect } from 'vitest';
import { getCollectionChipColors } from '@/shared/lib/collection-chip-color';

function lFromHsl(css: string): number {
  const m = css.match(/hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/);
  return m ? parseInt(m[1], 10) : NaN;
}
function sFromHsl(css: string): number {
  const m = css.match(/hsla?\(\s*\d+\s*,\s*(\d+)%/);
  return m ? parseInt(m[1], 10) : NaN;
}

describe('getCollectionChipColors', () => {
  it('darkens pure white into a legible color', () => {
    const t = getCollectionChipColors('#ffffff');
    expect(lFromHsl(t.text)).toBeLessThanOrEqual(50);
  });

  it('maps pure black to the neutral fallback', () => {
    const t = getCollectionChipColors('#000000');
    // Black has 0 saturation → fallback gray.
    expect(sFromHsl(t.text)).toBeLessThan(20);
  });

  it('keeps a mid color roughly untouched', () => {
    const t = getCollectionChipColors('#06b6d4');
    // L of #06b6d4 ~ 43% — should not be remapped.
    const l = lFromHsl(t.text);
    expect(l).toBeGreaterThan(30);
    expect(l).toBeLessThan(55);
  });

  it('returns fallback for null / invalid', () => {
    const a = getCollectionChipColors(null);
    const b = getCollectionChipColors('not-a-color');
    expect(sFromHsl(a.text)).toBeLessThan(20);
    expect(sFromHsl(b.text)).toBeLessThan(20);
  });

  it('derives border and background from the final color (with opacity)', () => {
    const t = getCollectionChipColors('#ffffff');
    expect(t.border).toMatch(/^hsla\(/);
    expect(t.background).toMatch(/^hsla\(/);
    expect(lFromHsl(t.border)).toBe(lFromHsl(t.text));
    expect(lFromHsl(t.background)).toBe(lFromHsl(t.text));
  });
});
