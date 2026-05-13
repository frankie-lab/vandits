import { describe, it, expect } from 'vitest';
import {
  pickNextIdentityColor,
  getCandidateSpace,
  getRawCandidateSpace,
  isInForbiddenZone,
  isValidCandidate,
  OWNER_PALETTE_VERSION,
  ENRICHED_ANCHOR_OKLCH,
  EXCLUSION_DELTA_E,
  deltaEOklab,
} from '@/lib/color/identity-allocator';

describe('identity-allocator v2.5 — versión', () => {
  it('palette version es owner-v2.5-maximin-perceptual', () => {
    expect(OWNER_PALETTE_VERSION).toBe('owner-v2.5-maximin-perceptual');
  });
});

describe('identity-allocator v2.5 — única exclusión = vecindad del verde', () => {
  it('el ancla verde está en la zona prohibida', () => {
    expect(isInForbiddenZone(ENRICHED_ANCHOR_OKLCH)).toBe(true);
    expect(isValidCandidate(ENRICHED_ANCHOR_OKLCH)).toBe(false);
  });

  it('rojo/naranja/amber/magenta/azul/violeta son candidatos VÁLIDOS', () => {
    const samples: Array<[number, string]> = [
      [25, 'rojo'],
      [50, 'naranja'],
      [70, 'amber'],
      [195, 'cyan'],
      [250, 'azul'],
      [290, 'violeta'],
      [325, 'magenta'],
    ];
    for (const [h, label] of samples) {
      const c = { L: 0.58, C: 0.18, h };
      expect(isValidCandidate(c), `${label} h=${h} debe ser válido`).toBe(true);
    }
  });

  it('todo candidato del espacio útil queda fuera de la zona prohibida', () => {
    const V = getCandidateSpace();
    expect(V.length).toBeGreaterThan(40);
    for (const c of V) {
      expect(deltaEOklab(c, ENRICHED_ANCHOR_OKLCH))
        .toBeGreaterThanOrEqual(EXCLUSION_DELTA_E);
    }
  });

  it('el espacio útil cubre tanto cálidos como fríos', () => {
    const V = getCandidateSpace();
    const warm = V.some((c) => (c.h <= 90 || c.h >= 300));
    const cool = V.some((c) => c.h >= 180 && c.h <= 280);
    expect(warm).toBe(true);
    expect(cool).toBe(true);
  });
});

describe('identity-allocator v2.5 — primer follow', () => {
  it('argmax ΔE(x, verde) sobre V — sin hue hardcoded', () => {
    const r = pickNextIdentityColor([]);
    const myScore = deltaEOklab(r.color, ENRICHED_ANCHOR_OKLCH);
    const V = getCandidateSpace();
    for (const c of V) {
      const s = deltaEOklab(c, ENRICHED_ANCHOR_OKLCH);
      expect(myScore).toBeGreaterThanOrEqual(s - 1e-9);
    }
  });

  it('determinista: dos llamadas con [] devuelven el mismo color', () => {
    const a = pickNextIdentityColor([]);
    const b = pickNextIdentityColor([]);
    expect(a.color).toEqual(b.color);
  });
});

describe('identity-allocator v2.5 — maximin incremental', () => {
  it('cada pick maximiza el min ΔE contra el conjunto ya asignado', () => {
    let assigned: any[] = [];
    for (let step = 0; step < 6; step++) {
      const r = pickNextIdentityColor(assigned);
      if (assigned.length > 0) {
        const myMin = Math.min(...assigned.map((a) => deltaEOklab(r.color, a)));
        const V = getCandidateSpace();
        for (const c of V) {
          if (assigned.some((a) =>
            Math.abs(a.h - c.h) < 1e-6 &&
            Math.abs(a.L - c.L) < 1e-6 &&
            Math.abs(a.C - c.C) < 1e-6
          )) continue;
          const m = Math.min(...assigned.map((a) => deltaEOklab(c, a)));
          expect(myMin).toBeGreaterThanOrEqual(m - 1e-9);
        }
      }
      assigned = [...assigned, r.color];
    }
  });

  it('los primeros 6 picks cubren al menos un cálido y un frío', () => {
    let assigned: any[] = [];
    const picks: any[] = [];
    for (let i = 0; i < 6; i++) {
      const r = pickNextIdentityColor(assigned);
      picks.push(r.color);
      assigned = [...assigned, r.color];
    }
    const warm = picks.some((c) => c.h <= 90 || c.h >= 300);
    const cool = picks.some((c) => c.h >= 180 && c.h <= 280);
    expect(warm, `picks: ${picks.map((c) => c.h.toFixed(0)).join(',')}`).toBe(true);
    expect(cool, `picks: ${picks.map((c) => c.h.toFixed(0)).join(',')}`).toBe(true);
  });

  it('los primeros 5 mantienen separación perceptual mínima ΔE ≥ 20', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 5; i++) {
      const r = pickNextIdentityColor(assigned);
      assigned = [...assigned, r.color];
    }
    for (let i = 0; i < assigned.length; i++) {
      for (let j = i + 1; j < assigned.length; j++) {
        expect(deltaEOklab(assigned[i], assigned[j])).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('ningún pick cae en la zona prohibida del verde (N=1..20)', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 20; i++) {
      const r = pickNextIdentityColor(assigned);
      expect(isInForbiddenZone(r.color)).toBe(false);
      assigned = [...assigned, r.color];
    }
  });
});

describe('identity-allocator v2.5 — determinismo e inmutabilidad', () => {
  it('mismo conjunto asignado → mismo siguiente color', () => {
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

  it('no muta el input', () => {
    const assigned = [pickNextIdentityColor([]).color];
    const before = JSON.stringify(assigned);
    pickNextIdentityColor(assigned);
    expect(JSON.stringify(assigned)).toBe(before);
  });

  it('nunca reutiliza un color ya asignado (N=1..10)', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 10; i++) {
      const r = pickNextIdentityColor(assigned);
      for (const a of assigned) {
        expect(r.color).not.toEqual(a);
      }
      assigned = [...assigned, r.color];
    }
  });
});

describe('identity-allocator v2.5 — sampling de la rueda', () => {
  it('el espacio crudo cubre 360° con paso fino', () => {
    const raw = getRawCandidateSpace();
    const hues = new Set(raw.map((c) => Math.round(c.h)));
    expect(hues.size).toBeGreaterThanOrEqual(60);
  });
});
