/**
 * Contract test: el mirror Deno (`supabase/functions/_shared/territorial-canon.ts`)
 * está sincronizado con el mirror TS (`src/shared/geography/territorial-canon.ts`).
 */
import { describe, it, expect } from 'vitest';
import * as tsCanon from '@/shared/geography/territorial-canon';
import * as denoCanon from '../../supabase/functions/_shared/territorial-canon';

describe('territorial-canon — TS ↔ Deno parity', () => {
  it('mismo conjunto de claves ISO2', () => {
    const tsKeys = Object.keys(tsCanon.TERRITORIAL_CANON).sort();
    const denoKeys = Object.keys(denoCanon.TERRITORIAL_CANON).sort();
    expect(denoKeys).toEqual(tsKeys);
  });

  it('TERRITORIAL_CANON_SIZE coincide', () => {
    expect(denoCanon.TERRITORIAL_CANON_SIZE).toBe(tsCanon.TERRITORIAL_CANON_SIZE);
  });

  it('cada entrada CountryCanon es estructuralmente idéntica', () => {
    for (const key of Object.keys(tsCanon.TERRITORIAL_CANON)) {
      const ts = tsCanon.TERRITORIAL_CANON[key];
      const deno = denoCanon.TERRITORIAL_CANON[key];
      expect(deno, `Deno missing ${key}`).toBeDefined();
      expect(deno.iso2, `iso2 mismatch ${key}`).toBe(ts.iso2);
      expect(deno.hasProvincia, `hasProvincia mismatch ${key}`).toBe(ts.hasProvincia);
      expect(deno.municipioField, `municipioField mismatch ${key}`).toBe(ts.municipioField);
      expect(deno.localityField, `localityField mismatch ${key}`).toBe(ts.localityField);
      expect([...deno.regionEqZoneWhitelist], `whitelist mismatch ${key}`).toEqual([...ts.regionEqZoneWhitelist]);
    }
  });

  it('COUNTRIES_WITHOUT_PROVINCIA coincide', () => {
    expect([...denoCanon.COUNTRIES_WITHOUT_PROVINCIA].sort()).toEqual(
      [...tsCanon.COUNTRIES_WITHOUT_PROVINCIA].sort(),
    );
  });

  it('helpers se comportan idénticamente en una muestra cruzada', () => {
    const samples: Array<[string, string]> = [
      ['ES', 'Asturias'], ['ES', 'Cataluña'],
      ['DE', 'Berlin'], ['DE', 'Bayern'],
      ['FR', 'Île-de-France'],
      ['CH', 'Genève'], ['CH', 'Geneve'],
      ['RU', 'Moscú'], ['RU', 'Moscow'],
      ['US', 'District of Columbia'], ['US', 'California'],
      ['NL', 'Noord-Holland'],
      ['ZZ', 'whatever'],
    ];
    for (const [iso, region] of samples) {
      expect(denoCanon.hasProvincia(iso)).toBe(tsCanon.hasProvincia(iso));
      expect(denoCanon.getMunicipioField(iso)).toBe(tsCanon.getMunicipioField(iso));
      expect(denoCanon.getLocalityField(iso)).toBe(tsCanon.getLocalityField(iso));
      expect(denoCanon.allowsRegionEqualsZone(iso, region)).toBe(tsCanon.allowsRegionEqualsZone(iso, region));
    }
  });
});
