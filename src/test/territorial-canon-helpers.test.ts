/**
 * Tests de comportamiento de los helpers del mirror TS:
 * defaults, case-insensitive, tolerancia diacrítica, inmutabilidad.
 */
import { describe, it, expect } from 'vitest';
import {
  getCountryCanon,
  hasProvincia,
  getMunicipioField,
  getLocalityField,
  allowsRegionEqualsZone,
} from '@/shared/geography/territorial-canon';

describe('territorial-canon — helpers behavior', () => {
  describe('defaults para ISO2 desconocido / inválido (§3)', () => {
    it.each([null, undefined, '', '   ', 'ZZ', 'XX', 'Z', 'XYZ', 'es-419'])(
      'getCountryCanon(%j) === null',
      (iso) => {
        expect(getCountryCanon(iso as string | null | undefined)).toBeNull();
      },
    );

    it('hasProvincia(unknown) === false (conservador)', () => {
      expect(hasProvincia('ZZ')).toBe(false);
      expect(hasProvincia(null)).toBe(false);
      expect(hasProvincia(undefined)).toBe(false);
    });

    it("getMunicipioField(unknown) === 'locality'", () => {
      expect(getMunicipioField('ZZ')).toBe('locality');
      expect(getMunicipioField(null)).toBe('locality');
    });

    it("getLocalityField(unknown) === 'sublocality'", () => {
      expect(getLocalityField('ZZ')).toBe('sublocality');
      expect(getLocalityField(null)).toBe('sublocality');
    });

    it('allowsRegionEqualsZone con país desconocido → false', () => {
      expect(allowsRegionEqualsZone('ZZ', 'anything')).toBe(false);
      expect(allowsRegionEqualsZone(null, 'Asturias')).toBe(false);
    });
  });

  describe('case-insensitive ISO2', () => {
    it('hasProvincia respeta lowercase/mixed', () => {
      expect(hasProvincia('pt')).toBe(hasProvincia('PT'));
      expect(hasProvincia('Pt')).toBe(true);
      expect(hasProvincia('pT')).toBe(true);
    });

    it('helpers aceptan whitespace', () => {
      expect(hasProvincia('  pt  ')).toBe(true);
      expect(getMunicipioField(' es ')).toBe('admin3');
    });
  });

  describe('tolerancia diacrítica en whitelist', () => {
    it('Moscú === Moscu en RU', () => {
      expect(allowsRegionEqualsZone('RU', 'Moscú')).toBe(true);
      expect(allowsRegionEqualsZone('RU', 'Moscu')).toBe(true);
      expect(allowsRegionEqualsZone('RU', 'MOSCU')).toBe(true);
    });

    it('Genève === Geneve en CH', () => {
      expect(allowsRegionEqualsZone('CH', 'Genève')).toBe(true);
      expect(allowsRegionEqualsZone('CH', 'Geneve')).toBe(true);
      expect(allowsRegionEqualsZone('CH', 'geneve')).toBe(true);
    });

    it('CABA admite alias largo y corto', () => {
      expect(allowsRegionEqualsZone('AR', 'CABA')).toBe(true);
      expect(allowsRegionEqualsZone('AR', 'caba')).toBe(true);
      expect(allowsRegionEqualsZone('AR', 'Ciudad Autonoma de Buenos Aires')).toBe(true);
      expect(allowsRegionEqualsZone('AR', 'Ciudad Autónoma de Buenos Aires')).toBe(true);
    });

    it('regionName vacío → false', () => {
      expect(allowsRegionEqualsZone('ES', '')).toBe(false);
      expect(allowsRegionEqualsZone('ES', '   ')).toBe(false);
      expect(allowsRegionEqualsZone('ES', null)).toBe(false);
    });
  });

  describe('inmutabilidad', () => {
    it('TERRITORIAL_CANON record raíz está congelado', async () => {
      const mod = await import('@/shared/geography/territorial-canon');
      expect(Object.isFrozen(mod.TERRITORIAL_CANON)).toBe(true);
    });
  });
});

