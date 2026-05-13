import { describe, it, expect } from 'vitest';
import {
  getOwnerStrokeColor,
  OWNER_PALETTE_SIZE,
  _OWNER_PALETTE_FOR_TEST,
  FORBIDDEN_HUE_RANGES,
  parseHslHue,
} from '@/components/map/owner-stroke';

// Sandbox uid (canónico) + uids de prueba.
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
          `Estos hues colisionan con health rings (amber/yellow/magenta/red) ` +
          `o estados POI (verde/naranja).`,
        ).toBe(false);
      }
    }
  });

  it('mismo uid → mismo color (estable entre llamadas)', () => {
    const a = getOwnerStrokeColor(SANDBOX_UID);
    const b = getOwnerStrokeColor(SANDBOX_UID);
    expect(a).toBe(b);
  });

  it('uids distintos pueden compartir color (paleta cerrada) pero hash es deterministico', () => {
    // No exigimos colores distintos para cualquier 2 uids — la paleta es de
    // 8 elementos y hay millones de uids. Sí exigimos que el resultado sea
    // estable y siempre del set permitido.
    const colors = [SANDBOX_UID, ALPHA_UID, BETA_UID].map(getOwnerStrokeColor);
    for (const c of colors) {
      expect(_OWNER_PALETTE_FOR_TEST).toContain(c);
    }
  });

  it('null/undefined/empty → fallback determinista al primer color', () => {
    const fallback = _OWNER_PALETTE_FOR_TEST[0];
    expect(getOwnerStrokeColor(null)).toBe(fallback);
    expect(getOwnerStrokeColor(undefined)).toBe(fallback);
    expect(getOwnerStrokeColor('')).toBe(fallback);
  });

  it('paleta no esta vacia y OWNER_PALETTE_SIZE coincide', () => {
    expect(OWNER_PALETTE_SIZE).toBeGreaterThan(0);
    expect(_OWNER_PALETTE_FOR_TEST.length).toBe(OWNER_PALETTE_SIZE);
  });
});
