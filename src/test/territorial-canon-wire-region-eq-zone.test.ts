/**
 * T2A-wire — Contract test: whitelist region==zone parametrizado por canon.
 * Cubre todas las entradas del canon §4 + casos negativos.
 */
import { describe, it, expect } from 'vitest';
import { TERRITORIAL_CANON, allowsRegionEqualsZone } from '@/shared/geography/territorial-canon';

describe('T2A-wire — allowsRegionEqualsZone', () => {
  for (const canon of Object.values(TERRITORIAL_CANON)) {
    for (const entry of canon.regionEqZoneWhitelist) {
      it(`${canon.iso2}/${entry} permitido`, () => {
        expect(allowsRegionEqualsZone(canon.iso2, entry)).toBe(true);
      });
    }
  }

  it('FR/Île-de-France NO permitido (sin whitelist)', () => {
    expect(allowsRegionEqualsZone('FR', 'Île-de-France')).toBe(false);
  });

  it('ES/Cataluña NO permitido (no uniprovincial)', () => {
    expect(allowsRegionEqualsZone('ES', 'Cataluña')).toBe(false);
  });

  it('ES/Madrid permitido (uniprovincial)', () => {
    expect(allowsRegionEqualsZone('ES', 'Madrid')).toBe(true);
  });

  it('tolera diacríticos: RU/Moscu == Moscú', () => {
    expect(allowsRegionEqualsZone('RU', 'Moscu')).toBe(true);
    expect(allowsRegionEqualsZone('RU', 'Moscú')).toBe(true);
  });

  it('ISO2 desconocido = false', () => {
    expect(allowsRegionEqualsZone('XX', 'Madrid')).toBe(false);
  });

  it('region vacía = false', () => {
    expect(allowsRegionEqualsZone('ES', '')).toBe(false);
  });
});
