import { describe, it, expect } from 'vitest';
import {
  getOwnerStrokeColor,
  getOwnerIdentityColor,
  OWNER_PALETTE_SIZE,
  OWNER_PALETTE_VERSION,
  _OWNER_PALETTE_FOR_TEST,
  FORBIDDEN_HUE_RANGES,
  parseHslHue,
} from '@/components/map/owner-stroke';

const SANDBOX_UID = 'f04b3b95-7308-4b74-b3c7-7e819767c5fb';
const ALPHA_UID = 'alpha-test-uid-0000-0000-0000-000000000001';
const BETA_UID  = 'beta-test-uid--0000-0000-0000-000000000002';

describe('owner-stroke palette guard', () => {
  it('paleta solo contiene colores frios (hue fuera de rangos prohibidos)', () => {
    for (const color of _OWNER_PALETTE_FOR_TEST) {
      const hue = parseHslHue(color);
      expect(hue, `hue parseable en ${color}`).not.toBeNull();
      for (const [lo, hi] of FORBIDDEN_HUE_RANGES) {
        const inRange = hue! >= lo && hue! < hi;
        expect(
          inRange,
          `Color ${color} (hue=${hue}) cae en rango prohibido [${lo}, ${hi}). ` +
          `Bloqueado: red/amber/yellow/verde/teal verdoso/magenta.`,
        ).toBe(false);
      }
    }
  });

  it('todos los colores tienen hue >= 190 (lejos del verde fill)', () => {
    for (const color of _OWNER_PALETTE_FOR_TEST) {
      const hue = parseHslHue(color)!;
      expect(hue, `hue mínimo en ${color}`).toBeGreaterThanOrEqual(190);
      expect(hue, `hue máximo en ${color}`).toBeLessThanOrEqual(290);
    }
  });

  it('mismo uid -> mismo color (estable entre llamadas, fallback hash)', () => {
    expect(getOwnerStrokeColor(SANDBOX_UID)).toBe(getOwnerStrokeColor(SANDBOX_UID));
  });

  it('uids distintos pueden compartir color en fallback hash, todos del set permitido', () => {
    const colors = [SANDBOX_UID, ALPHA_UID, BETA_UID].map(getOwnerStrokeColor);
    for (const c of colors) expect(_OWNER_PALETTE_FOR_TEST).toContain(c);
  });

  it('null/undefined/empty -> fallback determinista al primer color', () => {
    const fallback = _OWNER_PALETTE_FOR_TEST[0];
    expect(getOwnerStrokeColor(null)).toBe(fallback);
    expect(getOwnerStrokeColor(undefined)).toBe(fallback);
    expect(getOwnerStrokeColor('')).toBe(fallback);
  });

  it('paleta no esta vacia y OWNER_PALETTE_SIZE coincide', () => {
    expect(OWNER_PALETTE_SIZE).toBeGreaterThan(0);
    expect(_OWNER_PALETTE_FOR_TEST.length).toBe(OWNER_PALETTE_SIZE);
  });

  it('OWNER_PALETTE_VERSION es owner-v1', () => {
    expect(OWNER_PALETTE_VERSION).toBe('owner-v1');
  });
});

describe('getOwnerIdentityColor', () => {
  it('usa colorIndex persistido cuando existe', () => {
    expect(getOwnerIdentityColor(SANDBOX_UID, 0)).toBe(_OWNER_PALETTE_FOR_TEST[0]);
    expect(getOwnerIdentityColor(SANDBOX_UID, 3)).toBe(_OWNER_PALETTE_FOR_TEST[3]);
  });

  it('normaliza con módulo si index >= paleta (tolerancia a cambios de paleta)', () => {
    const expected = _OWNER_PALETTE_FOR_TEST[5 % OWNER_PALETTE_SIZE];
    expect(getOwnerIdentityColor(SANDBOX_UID, OWNER_PALETTE_SIZE + 5)).toBe(expected);
  });

  it('cae al fallback hash si no hay colorIndex', () => {
    expect(getOwnerIdentityColor(SANDBOX_UID, undefined)).toBe(getOwnerStrokeColor(SANDBOX_UID));
    expect(getOwnerIdentityColor(SANDBOX_UID, null)).toBe(getOwnerStrokeColor(SANDBOX_UID));
  });

  it('rechaza colorIndex negativo y cae al fallback', () => {
    expect(getOwnerIdentityColor(SANDBOX_UID, -1)).toBe(getOwnerStrokeColor(SANDBOX_UID));
  });
});
