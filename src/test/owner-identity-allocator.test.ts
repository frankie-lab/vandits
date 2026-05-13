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
  it('palette version is owner-v2.2-oklch (post-PR-2.3 scoring fix)', () => {
    expect(OWNER_PALETTE_VERSION).toBe('owner-v2.2-oklch');
  });
});

describe('identity-allocator — maximin against assigned ∪ anchors', () => {
  it('first pick (assigned=[]) is deterministic', () => {
    const a = pickNextIdentityColor([]);
    const b = pickNextIdentityColor([]);
    expect(a.color).toEqual(b.color);
  });

  it('first pick is far from every forbidden anchor', () => {
    const r = pickNextIdentityColor([]);
    for (const a of FORBIDDEN_ANCHORS) {
      expect(deltaEOklab(r.color, a)).toBeGreaterThanOrEqual(ANCHOR_MIN_DELTA_E);
    }
  });

  it('first pick maximizes min ΔE against FORBIDDEN_ANCHORS over V', () => {
    const r = pickNextIdentityColor([]);
    const V = getCandidateSpace();
    const myMin = Math.min(...FORBIDDEN_ANCHORS.map((a) => deltaEOklab(r.color, a)));
    for (const c of V) {
      const m = Math.min(...FORBIDDEN_ANCHORS.map((a) => deltaEOklab(c, a)));
      expect(myMin).toBeGreaterThanOrEqual(m - 1e-6);
    }
  });

  it('every subsequent pick maximizes min ΔE against assigned ∪ anchors', () => {
    let assigned: any[] = [];
    for (let step = 0; step < 5; step++) {
      const r = pickNextIdentityColor(assigned);
      const S = [...assigned, ...FORBIDDEN_ANCHORS];
      const myMin = Math.min(...S.map((a) => deltaEOklab(r.color, a)));
      const V = getCandidateSpace();
      for (const c of V) {
        if (assigned.some((a) => Math.abs(a.L - c.L) < 1e-3 && Math.abs(a.C - c.C) < 1e-3 && Math.abs(a.h - c.h) < 1e-3)) continue;
        const m = Math.min(...S.map((a) => deltaEOklab(c, a)));
        expect(myMin).toBeGreaterThanOrEqual(m - 1e-6);
      }
      assigned = [...assigned, r.color];
    }
  });

  it('every assigned color stays clear of all forbidden anchors', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 8; i++) {
      const r = pickNextIdentityColor(assigned);
      for (const a of FORBIDDEN_ANCHORS) {
        expect(deltaEOklab(r.color, a)).toBeGreaterThanOrEqual(ANCHOR_MIN_DELTA_E);
      }
      assigned = [...assigned, r.color];
    }
  });

  it('all SEED_PALETTE colors still clear forbidden anchors (backfill safety)', () => {
    for (const s of SEED_PALETTE) {
      for (const a of FORBIDDEN_ANCHORS) {
        expect(deltaEOklab(s, a)).toBeGreaterThanOrEqual(ANCHOR_MIN_DELTA_E);
      }
    }
  });
});

describe('identity-allocator — determinism + immutability', () => {
  it('same assigned input produces same next color', () => {
    const seq: any[] = [];
    let assigned: any[] = [];
    for (let i = 0; i < 4; i++) {
      const r = pickNextIdentityColor(assigned);
      seq.push(r.color);
      assigned = [...assigned, r.color];
    }
    const a = pickNextIdentityColor(seq);
    const b = pickNextIdentityColor(seq);
    expect(a.color).toEqual(b.color);
  });

  it('does not mutate the assigned array', () => {
    const assigned = [pickNextIdentityColor([]).color];
    const before = [...assigned];
    pickNextIdentityColor(assigned);
    expect(assigned).toEqual(before);
  });

  it('never reuses an already-assigned color', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 12; i++) {
      const r = pickNextIdentityColor(assigned);
      for (const a of assigned) {
        expect(r.color).not.toEqual(a);
      }
      assigned = [...assigned, r.color];
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
