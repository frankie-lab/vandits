/**
 * T2A-wire (§1.b) — Excepciones regionales del canon territorial.
 * Caso inicial obligatorio: PT-20 Açores, PT-30 Madeira (sin provincia).
 */
import { describe, it, expect } from 'vitest';
import {
  regionHasNoProvincia,
  TERRITORIAL_CANON,
} from '@/shared/geography/territorial-canon';

describe('territorial-canon — regionHasNoProvincia (PT insular)', () => {
  it('PT-20 Açores ⇒ true', () => {
    expect(regionHasNoProvincia('PT', 'PT-20')).toBe(true);
  });
  it('PT-30 Madeira ⇒ true', () => {
    expect(regionHasNoProvincia('PT', 'PT-30')).toBe(true);
  });
  it('Portugal continental (PT-01..PT-18) ⇒ false', () => {
    for (const code of ['PT-01', 'PT-02', 'PT-03', 'PT-11', 'PT-17']) {
      expect(regionHasNoProvincia('PT', code), code).toBe(false);
    }
  });
  it('iso2 desconocido ⇒ false', () => {
    expect(regionHasNoProvincia('ZZ', 'PT-20')).toBe(false);
    expect(regionHasNoProvincia(null, 'PT-20')).toBe(false);
    expect(regionHasNoProvincia(undefined, 'PT-20')).toBe(false);
  });
  it('regionIsoCode vacío/null ⇒ false', () => {
    expect(regionHasNoProvincia('PT', null)).toBe(false);
    expect(regionHasNoProvincia('PT', undefined)).toBe(false);
    expect(regionHasNoProvincia('PT', '')).toBe(false);
    expect(regionHasNoProvincia('PT', '   ')).toBe(false);
  });
  it('país sin regionsWithoutProvincia ⇒ false', () => {
    // ES no tiene la propiedad declarada en Fase 1.
    expect(regionHasNoProvincia('ES', 'ES-CN')).toBe(false);
  });
  it('PT.regionsWithoutProvincia contiene exactamente PT-20 y PT-30', () => {
    expect([...(TERRITORIAL_CANON.PT.regionsWithoutProvincia ?? [])].sort())
      .toEqual(['PT-20', 'PT-30']);
  });
  it('lookup case-sensitive sobre iso_code completo', () => {
    expect(regionHasNoProvincia('PT', 'pt-20')).toBe(false);
    expect(regionHasNoProvincia('PT', 'PT20')).toBe(false);
  });
});
