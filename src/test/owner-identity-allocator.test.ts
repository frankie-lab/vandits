import { describe, it, expect } from 'vitest';
import {
  SEED_PALETTE,
  FORBIDDEN_ANCHORS,
  ANCHOR_MIN_DELTA_E,
  pickNextIdentityColor,
  getCandidateSpace,
  isValidCandidate,
  OWNER_PALETTE_VERSION,
} from '@/lib/color/identity-allocator';
import { deltaEOklab, contrastRatio } from '@/lib/color/oklch';

describe('identity-allocator — version', () => {
  it('palette version is owner-v2-oklch', () => {
    expect(OWNER_PALETTE_VERSION).toBe('owner-v2-oklch');
  });
});

describe('identity-allocator — seed phase', () => {
  it('first N picks consume seed in order', () => {
    let assigned: any[] = [];
    for (const seed of SEED_PALETTE) {
      const r = pickNextIdentityColor(assigned);
      expect(r.color).toEqual(seed);
      expect(r.degraded).toBe(false);
      assigned = [...assigned, r.color];
    }
  });

  it('all seed colors clear forbidden anchors', () => {
    for (const s of SEED_PALETTE) {
      for (const a of FORBIDDEN_ANCHORS) {
        expect(deltaEOklab(s, a)).toBeGreaterThanOrEqual(ANCHOR_MIN_DELTA_E);
      }
    }
  });
});

describe('identity-allocator — determinism + immutability', () => {
  it('same assigned input produces same next color', () => {
    const assigned = SEED_PALETTE.slice(0, 3);
    const a = pickNextIdentityColor(assigned);
    const b = pickNextIdentityColor(assigned);
    expect(a.color).toEqual(b.color);
  });

  it('does not mutate the assigned array', () => {
    const assigned = SEED_PALETTE.slice(0, 4);
    const before = [...assigned];
    pickNextIdentityColor(assigned);
    expect(assigned).toEqual(before);
  });

  it('adding the N+1 color does not change the previous N', () => {
    const seq = [];
    let assigned: any[] = [];
    for (let i = 0; i < SEED_PALETTE.length + 3; i++) {
      const r = pickNextIdentityColor(assigned);
      seq.push(r.color);
      assigned = [...assigned, r.color];
    }
    // Colors at index <i> are stable: nothing in the assignment loop
    // recomputes earlier choices.
    for (let i = 0; i < seq.length - 1; i++) {
      const partial = seq.slice(0, i);
      const next = pickNextIdentityColor(partial).color;
      expect(next).toEqual(seq[i]);
    }
  });
});

describe('identity-allocator — maximin (post-seed)', () => {
  it('beyond seed, picks color that maximizes min ΔE to assigned', () => {
    // Saturate seed.
    let assigned: any[] = [...SEED_PALETTE];
    const r = pickNextIdentityColor(assigned);
    // The chosen color's min-distance to assigned must be >= every
    // other valid candidate's min-distance.
    const V = getCandidateSpace();
    const myMin = Math.min(...assigned.map((a) => deltaEOklab(r.color, a)));
    for (const c of V) {
      const m = Math.min(...assigned.map((a) => deltaEOklab(c, a)));
      expect(myMin).toBeGreaterThanOrEqual(m - 1e-6);
    }
  });
});

describe('identity-allocator — forbidden anchors', () => {
  it('no candidate in V is within ΔE < ANCHOR_MIN_DELTA_E of any anchor', () => {
    const V = getCandidateSpace();
    expect(V.length).toBeGreaterThan(20);
    for (const c of V) {
      for (const a of FORBIDDEN_ANCHORS) {
        expect(deltaEOklab(c, a)).toBeGreaterThanOrEqual(ANCHOR_MIN_DELTA_E);
      }
    }
  });

  it('isValidCandidate rejects a yellow-ish candidate near anchors', () => {
    expect(isValidCandidate({ L: 0.87, C: 0.18, h: 95 })).toBe(false);
  });
});

describe('identity-allocator — WCAG contrast', () => {
  it('seed colors meet 2.6:1 against light and dark backgrounds', () => {
    for (const s of SEED_PALETTE) {
      expect(contrastRatio(s, '#f8fafc')).toBeGreaterThanOrEqual(2.6);
      expect(contrastRatio(s, '#0b1220')).toBeGreaterThanOrEqual(2.4);
    }
  });
});
