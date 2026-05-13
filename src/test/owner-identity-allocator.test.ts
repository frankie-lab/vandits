import { describe, it, expect } from 'vitest';
import {
  pickNextIdentityColor,
  getCandidateSpace,
  getRawCandidateSpace,
  isInForbiddenZone,
  isInForbiddenHueBand,
  isNearEnrichedAnchor,
  isGrayish,
  isValidCandidate,
  OWNER_PALETTE_VERSION,
  ENRICHED_ANCHOR_OKLCH,
  EXCLUSION_DELTA_E,
  FORBIDDEN_HUE_MIN,
  FORBIDDEN_HUE_MAX,
  MIN_IDENTITY_CHROMA,
  deltaEOklab,
} from '@/lib/color/identity-allocator';

describe('identity-allocator v2.6 — versión', () => {
  it('palette version es owner-v2.6-no-green-no-gray', () => {
    expect(OWNER_PALETTE_VERSION).toBe('owner-v2.6-no-green-no-gray');
  });
});

describe('identity-allocator v2.6 — exclusiones duras: verde y gris', () => {
  it('el ancla verde está prohibida (banda y vecindad perceptual)', () => {
    expect(isInForbiddenHueBand(ENRICHED_ANCHOR_OKLCH)).toBe(true);
    expect(isNearEnrichedAnchor(ENRICHED_ANCHOR_OKLCH)).toBe(true);
    expect(isInForbiddenZone(ENRICHED_ANCHOR_OKLCH)).toBe(true);
    expect(isValidCandidate(ENRICHED_ANCHOR_OKLCH)).toBe(false);
  });

  it('toda la banda de hue verde está prohibida', () => {
    for (let h = FORBIDDEN_HUE_MIN; h <= FORBIDDEN_HUE_MAX; h += 5) {
      const c = { L: 0.58, C: 0.18, h };
      expect(isValidCandidate(c), `hue ${h} (verde) debe ser inválido`).toBe(false);
    }
  });

  it('los grises/desaturados están prohibidos', () => {
    expect(isGrayish({ L: 0.58, C: 0.10, h: 250 })).toBe(true);
    expect(isGrayish({ L: 0.58, C: 0.14, h: 30 })).toBe(true);
    expect(isGrayish({ L: 0.58, C: 0.18, h: 30 })).toBe(false);
    for (let C = 0; C < MIN_IDENTITY_CHROMA; C += 0.02) {
      const c = { L: 0.58, C, h: 250 };
      expect(isValidCandidate(c), `C=${C} debe ser inválido`).toBe(false);
    }
  });

  it('rojo/naranja/ámbar/magenta/azul/cyan no-verdoso/violeta son VÁLIDOS', () => {
    const samples: Array<[number, string]> = [
      [25, 'rojo'],
      [50, 'naranja'],
      [80, 'ámbar borde'],
      [180, 'cyan limpio borde'],
      [195, 'cyan'],
      [250, 'azul'],
      [290, 'violeta'],
      [325, 'magenta'],
      [350, 'rosa'],
    ];
    for (const [h, label] of samples) {
      const c = { L: 0.58, C: 0.18, h };
      // 80 cae en banda prohibida (>=85? no, 80<85), debería ser válido
      // 180 cae en banda prohibida (180<=175? no, 180>175), debería ser válido
      expect(isValidCandidate(c), `${label} h=${h} debe ser válido`).toBe(true);
    }
  });

  it('todo el espacio útil queda fuera de las zonas prohibidas', () => {
    const V = getCandidateSpace();
    expect(V.length).toBeGreaterThan(20);
    for (const c of V) {
      expect(isInForbiddenHueBand(c), `hue ${c.h} no debe ser verde`).toBe(false);
      expect(isGrayish(c), `C ${c.C} no debe ser gris`).toBe(false);
      expect(deltaEOklab(c, ENRICHED_ANCHOR_OKLCH))
        .toBeGreaterThanOrEqual(EXCLUSION_DELTA_E);
    }
  });

  it('el espacio útil cubre cálidos y fríos no-verdes', () => {
    const V = getCandidateSpace();
    const warm = V.some((c) => c.h <= 80 || c.h >= 300);
    const cool = V.some((c) => c.h >= 180 && c.h <= 280);
    expect(warm).toBe(true);
    expect(cool).toBe(true);
  });
});

describe('identity-allocator v2.6 — primer follow', () => {
  it('argmax ΔE(x, verde) sobre V — sin hue hardcoded', () => {
    const r = pickNextIdentityColor([]);
    expect(isValidCandidate(r.color)).toBe(true);
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

describe('identity-allocator v2.6 — maximin incremental', () => {
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

  it('ningún pick cae en zona prohibida — ni verde ni gris (N=1..20)', () => {
    let assigned: any[] = [];
    for (let i = 0; i < 20; i++) {
      const r = pickNextIdentityColor(assigned);
      expect(isInForbiddenHueBand(r.color), `pick ${i} es verde h=${r.color.h}`).toBe(false);
      expect(isGrayish(r.color), `pick ${i} es gris C=${r.color.C}`).toBe(false);
      expect(isValidCandidate(r.color)).toBe(true);
      assigned = [...assigned, r.color];
    }
  });
});

describe('identity-allocator v2.6 — determinismo e inmutabilidad', () => {
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

describe('identity-allocator v2.6 — sampling de la rueda', () => {
  it('el espacio crudo cubre 360° con paso fino', () => {
    const raw = getRawCandidateSpace();
    const hues = new Set(raw.map((c) => Math.round(c.h)));
    expect(hues.size).toBeGreaterThanOrEqual(60);
  });
});
