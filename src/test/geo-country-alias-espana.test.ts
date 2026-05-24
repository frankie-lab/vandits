// Contract — alias ASCII de país.
// Ver docs/audits/geo-country-alias-tree-audit.md.
import { describe, it, expect } from 'vitest';
import { canonicalCountry } from '@/shared/geography/canonical-names';
import { getLocationHierarchy } from '@/shared/geography/hierarchy';
import type { GeoLocation } from '@/types/location';

describe('canonicalCountry — Espana (ASCII) → Spain', () => {
  it('mapea "Espana" sin tilde a "Spain"', () => {
    expect(canonicalCountry('Espana')).toBe('Spain');
  });

  it('sigue mapeando "España" con tilde a "Spain"', () => {
    expect(canonicalCountry('España')).toBe('Spain');
  });

  it('preserva países que ya están en inglés', () => {
    expect(canonicalCountry('Spain')).toBe('Spain');
    expect(canonicalCountry('France')).toBe('France');
  });
});

describe('GeographyTree — beta-partial con country="Espana" cae bajo "Spain"', () => {
  const makeLoc = (id: string, country: string): GeoLocation => ({
    id,
    name: `beta-partial-${id}`,
    coordinates: { lat: 40.4, lng: -3.7 },
    country,
    // country_id NULL en BD (no resuelto): countryResolved undefined,
    // el resolver cae al texto legacy `country`.
  } as unknown as GeoLocation);

  it('los 3 POIs Espana se agrupan bajo el mismo bucket "Spain"', () => {
    const locs = [
      makeLoc('1', 'Espana'),
      makeLoc('2', 'Espana'),
      makeLoc('3', 'Espana'),
    ];
    const buckets = new Set(locs.map((l) => getLocationHierarchy(l).country));
    expect(buckets.size).toBe(1);
    expect([...buckets][0]).toBe('Spain');
  });

  it('"Espana" y "España" colapsan en el mismo nodo', () => {
    const a = getLocationHierarchy(makeLoc('ascii', 'Espana')).country;
    const b = getLocationHierarchy(makeLoc('tilde', 'España')).country;
    expect(a).toBe(b);
    expect(a).toBe('Spain');
  });
});
