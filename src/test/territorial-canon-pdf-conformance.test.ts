/**
 * Contract test: el mirror TS refleja exactamente §1, §2 y §4 de
 * `docs/contracts/territorial-equivalence-canon.md`.
 */
import { describe, it, expect } from 'vitest';
import {
  TERRITORIAL_CANON,
  TERRITORIAL_CANON_SIZE,
  COUNTRIES_WITHOUT_PROVINCIA,
  hasProvincia,
  getMunicipioField,
  getLocalityField,
  allowsRegionEqualsZone,
} from '@/shared/geography/territorial-canon';

describe('territorial-canon — PDF conformance (§1, §2, §4)', () => {
  it('contiene 49 entradas (38 PDF + RU operativo + 10 ola P0)', () => {
    expect(TERRITORIAL_CANON_SIZE).toBe(49);
  });

  it('todas las claves son ISO2 mayúsculas de 2 chars y coinciden con iso2 interno', () => {
    for (const [key, entry] of Object.entries(TERRITORIAL_CANON)) {
      expect(key).toMatch(/^[A-Z]{2}$/);
      expect(entry.iso2).toBe(key);
    }
  });

  it('§2 + ola P0: lista exacta de países sin provincia = FI,NO,NL,SE,BR,AU,JP,MX,CO + HR,BG,SI,IS', () => {
    expect([...COUNTRIES_WITHOUT_PROVINCIA].sort()).toEqual(
      ['AU', 'BG', 'BR', 'CO', 'FI', 'HR', 'IS', 'JP', 'MX', 'NL', 'NO', 'SE', 'SI'].sort(),
    );
  });

  it('§1: hasProvincia matchea tabla para muestra representativa', () => {
    for (const iso of ['ES', 'FR', 'IT', 'GB', 'US', 'PT', 'DE', 'PL', 'CH', 'AT', 'BE', 'EG', 'ID', 'KR', 'PH', 'IN', 'RU']) {
      expect(hasProvincia(iso), `${iso} debe tener provincia`).toBe(true);
    }
    for (const iso of ['FI', 'NO', 'NL', 'SE', 'BR', 'AU', 'JP', 'MX', 'CO']) {
      expect(hasProvincia(iso), `${iso} NO debe tener provincia`).toBe(false);
    }
  });

  it('ola P0: hasProvincia correcto por DOCX mundial', () => {
    // DOCX: Provincia poblada → hasProvincia=true.
    for (const iso of ['IE', 'RS', 'HU', 'ML', 'SK', 'CZ']) {
      expect(hasProvincia(iso), `${iso} P0 debe tener provincia`).toBe(true);
    }
    // DOCX: Provincia "—" → hasProvincia=false.
    for (const iso of ['HR', 'BG', 'SI', 'IS']) {
      expect(hasProvincia(iso), `${iso} P0 NO debe tener provincia`).toBe(false);
    }
  });

  it('§1: municipioField=locality solo en países sin admin3 canónico', () => {
    for (const iso of COUNTRIES_WITHOUT_PROVINCIA) {
      expect(getMunicipioField(iso), `${iso}`).toBe('locality');
    }
    for (const iso of ['ES', 'FR', 'IT', 'GB', 'US', 'PT', 'DE', 'CH', 'AT', 'BE', 'IE', 'RS', 'HU', 'ML', 'SK', 'CZ']) {
      expect(getMunicipioField(iso), `${iso}`).toBe('admin3');
    }
  });

  it('§1: localityField=locality solo en PT, CL, DZ, PH (resto sublocality)', () => {
    for (const iso of ['PT', 'CL', 'DZ', 'PH']) {
      expect(getLocalityField(iso), `${iso}`).toBe('locality');
    }
    for (const iso of ['ES', 'FR', 'IT', 'GB', 'US', 'DE', 'AR', 'BR', 'JP', 'MX']) {
      expect(getLocalityField(iso), `${iso}`).toBe('sublocality');
    }
  });

  it('§4: whitelist uniprovinciales — casos POSITIVOS clave', () => {
    expect(allowsRegionEqualsZone('ES', 'Asturias')).toBe(true);
    expect(allowsRegionEqualsZone('ES', 'Madrid')).toBe(true);
    expect(allowsRegionEqualsZone('ES', 'Ceuta')).toBe(true);
    expect(allowsRegionEqualsZone('ES', 'Melilla')).toBe(true);
    expect(allowsRegionEqualsZone('DE', 'Berlin')).toBe(true);
    expect(allowsRegionEqualsZone('DE', 'Hamburg')).toBe(true);
    expect(allowsRegionEqualsZone('DE', 'Bremen')).toBe(true);
    expect(allowsRegionEqualsZone('AT', 'Wien')).toBe(true);
    expect(allowsRegionEqualsZone('BE', 'Brussels-Capital')).toBe(true);
    expect(allowsRegionEqualsZone('CH', 'Genève')).toBe(true);
    expect(allowsRegionEqualsZone('CH', 'Basel-Stadt')).toBe(true);
    expect(allowsRegionEqualsZone('AR', 'CABA')).toBe(true);
    expect(allowsRegionEqualsZone('AR', 'Ciudad Autónoma de Buenos Aires')).toBe(true);
    expect(allowsRegionEqualsZone('CN', 'Beijing')).toBe(true);
    expect(allowsRegionEqualsZone('CN', 'Shanghai')).toBe(true);
    expect(allowsRegionEqualsZone('US', 'District of Columbia')).toBe(true);
    expect(allowsRegionEqualsZone('RU', 'Moscow')).toBe(true);
    expect(allowsRegionEqualsZone('KR', 'Seoul')).toBe(true);
    expect(allowsRegionEqualsZone('ID', 'DKI Jakarta')).toBe(true);
    expect(allowsRegionEqualsZone('EG', 'Cairo')).toBe(true);
  });

  it('§4: whitelist uniprovinciales — casos NEGATIVOS clave', () => {
    expect(allowsRegionEqualsZone('FR', 'Île-de-France')).toBe(false);
    expect(allowsRegionEqualsZone('ES', 'Cataluña')).toBe(false);
    expect(allowsRegionEqualsZone('ES', 'Andalucía')).toBe(false);
    expect(allowsRegionEqualsZone('IT', 'Lazio')).toBe(false);
    expect(allowsRegionEqualsZone('PT', 'Norte')).toBe(false);
    expect(allowsRegionEqualsZone('DE', 'Bayern')).toBe(false);
    expect(allowsRegionEqualsZone('US', 'California')).toBe(false);
  });

  it('países sin provincia tienen whitelist vacía (§3: no inventar)', () => {
    for (const iso of COUNTRIES_WITHOUT_PROVINCIA) {
      expect(TERRITORIAL_CANON[iso].regionEqZoneWhitelist).toEqual([]);
    }
  });
});
