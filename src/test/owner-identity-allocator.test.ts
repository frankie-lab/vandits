import { describe, it, expect } from 'vitest';
import {
  SEED_PALETTE,
  FORBIDDEN_ANCHORS,
  pickNextIdentityColor,
  getCandidateSpace,
  isValidCandidate,
  OWNER_PALETTE_VERSION,
  MIN_HUE_GAP_DEG,
} from '@/lib/color/identity-allocator';

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('identity-allocator — versión', () => {
  it('palette version es owner-v2.4-cool-hue-band', () => {
    expect(OWNER_PALETTE_VERSION).toBe('owner-v2.4-cool-hue-band');
  });
});

describe('identity-allocator — banda fría', () => {
  it('todo candidato vive en hue [180, 320]', () => {
    const V = getCandidateSpace();
    expect(V.length).toBeGreaterThan(20);
    for (const c of V) {
      expect(c.h).toBeGreaterThanOrEqual(180);
      expect(c.h).toBeLessThanOrEqual(320);
    }
  });

  it('isValidCandidate rechaza hues reservados', () => {
    expect(isValidCandidate({ L: 0.5, C: 0.18, h: 25 })).toBe(false);   // rojo
    expect(isValidCandidate({ L: 0.5, C: 0.18, h: 50 })).toBe(false);   // naranja
    expect(isValidCandidate({ L: 0.5, C: 0.18, h: 95 })).toBe(false);   // amarillo
    expect(isValidCandidate({ L: 0.5, C: 0.18, h: 145 })).toBe(false);  // verde
    expect(isValidCandidate({ L: 0.5, C: 0.18, h: 355 })).toBe(false);  // magenta
    expect(isValidCandidate({ L: 0.5, C: 0.18, h: 250 })).toBe(true);   // azul
  });

  it('ningún anchor reservado cae dentro de la banda', () => {
    for (const a of FORBIDDEN_ANCHORS) {
      expect(isValidCandidate(a)).toBe(false);
    }
  });
});

describe('identity-allocator — orden incremental e inmutable', () => {
  it('primer pick es determinista (h=250)', () => {
    const a = pickNextIdentityColor([]);
    const b = pickNextIdentityColor([]);
    expect(a.color).toEqual(b.color);
    expect(a.color.h).toBe(250);
  });

  it('cada pick es el más distante (en hue) del conjunto ya asignado', () => {
    let assigned: any[] = [];
    for (let step = 0; step < 6; step++) {
      const r = pickNextIdentityColor(assigned);
      // Verificar que es máximo: ningún otro candidato del espacio mejora
      // el min-hue-gap contra el conjunto ya asignado.
      if (assigned.length > 0) {
        const myMin = Math.min(...assigned.map((a) => hueDist(r.color.h, a.h)));
        const V = getCandidateSpace();
        for (const c of V) {
          if (assigned.some((a) => Math.abs(a.h - c.h) < 1e-3 && Math.abs(a.L - c.L) < 1e-3 && Math.abs(a.C - c.C) < 1e-3)) continue;
          const m = Math.min(...assigned.map((a) => hueDist(c.h, a.h)));
          expect(myMin).toBeGreaterThanOrEqual(m - 1e-6);
        }
      }
      assigned = [...assigned, r.color];
    }
  });

  it('no muta el input', () => {
    const assigned = [pickNextIdentityColor([]).color];
    const before = JSON.stringify(assigned);
    pickNextIdentityColor(assigned);
    expect(JSON.stringify(assigned)).toBe(before);
  });

  it('nunca reutiliza un color ya asignado', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 8; i++) {
      const r = pickNextIdentityColor(assigned);
      for (const a of assigned) {
        expect(r.color).not.toEqual(a);
      }
      assigned = [...assigned, r.color];
    }
  });

  it('mismo conjunto asignado → mismo siguiente color (determinismo)', () => {
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
});

describe('identity-allocator — separación visual real', () => {
  it('los primeros 4 seguidos respetan MIN_HUE_GAP_DEG entre sí', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 4; i++) {
      const r = pickNextIdentityColor(assigned);
      assigned = [...assigned, r.color];
    }
    for (let i = 0; i < assigned.length; i++) {
      for (let j = i + 1; j < assigned.length; j++) {
        expect(hueDist(assigned[i].h, assigned[j].h))
          .toBeGreaterThanOrEqual(MIN_HUE_GAP_DEG);
      }
    }
  });

  it('los primeros 4 seguidos NO degradan', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 4; i++) {
      const r = pickNextIdentityColor(assigned);
      expect(r.degraded).toBe(false);
      assigned = [...assigned, r.color];
    }
  });

  it('ningún seguido cae cerca (≤25°) de un anchor reservado', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 8; i++) {
      const r = pickNextIdentityColor(assigned);
      for (const a of FORBIDDEN_ANCHORS) {
        expect(hueDist(r.color.h, a.h)).toBeGreaterThan(25);
      }
      assigned = [...assigned, r.color];
    }
  });
});

describe('identity-allocator — SEED_PALETTE solo es fallback', () => {
  it('todos los SEED viven en la banda fría', () => {
    for (const s of SEED_PALETTE) {
      expect(isValidCandidate(s)).toBe(true);
    }
  });
});
