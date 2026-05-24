/**
 * T2A-wire (§1.b) — `getLocationHierarchy` con excepción regional PT-20/PT-30:
 *   - no emite zone
 *   - no lee `loc.zone`/`zoneResolved`
 *   - no cae a `enriched_data.datos_geograficos.admin_nivel_2`
 *     (caso Madalena → revive legacy de "Lisboa" debe quedar neutralizado).
 */
import { describe, it, expect } from 'vitest';
import { getLocationHierarchy } from '@/shared/geography/hierarchy';
import type { GeoLocation } from '@/types/location';

function mk(loc: Partial<GeoLocation>): GeoLocation {
  return {
    id: 'x',
    name: 'x',
    coordinates: { lat: 38.5, lng: -28.5 },
    ...loc,
  } as GeoLocation;
}

describe('getLocationHierarchy — PT-20 / PT-30 sin provincia', () => {
  it('Madalena (PT-20) con enriched admin_nivel_2="Lisboa" ⇒ zone undefined', () => {
    const h = getLocationHierarchy(mk({
      country: 'Portugal',
      countryResolved: 'Portugal',
      region: 'Açores',
      regionResolved: 'Açores',
      regionIsoCode: 'PT-20',
      zone: 'Lisboa',
      zoneResolved: 'Lisboa',
      enrichedData: {
        datos_geograficos: { admin_nivel_2: 'Lisboa' },
      } as any,
    }));
    expect(h.zone).toBeUndefined();
    expect(h.region).toBe('Açores');
  });

  it('Madeira (PT-30) ⇒ zone undefined aun con admin_nivel_2 legacy', () => {
    const h = getLocationHierarchy(mk({
      country: 'Portugal',
      regionResolved: 'Madeira',
      regionIsoCode: 'PT-30',
      enrichedData: { datos_geograficos: { admin_nivel_2: 'Funchal' } } as any,
    }));
    expect(h.zone).toBeUndefined();
  });

  it('PT continental (PT-01 Norte) ⇒ zone se preserva', () => {
    const h = getLocationHierarchy(mk({
      country: 'Portugal',
      regionResolved: 'Norte',
      regionIsoCode: 'PT-01',
      zoneResolved: 'Braga',
    }));
    expect(h.zone).toBe('Braga');
  });

  it('sin regionIsoCode ⇒ comportamiento legacy (zone se lee)', () => {
    const h = getLocationHierarchy(mk({
      country: 'Portugal',
      regionResolved: 'Açores',
      zoneResolved: 'Lisboa',
    }));
    expect(h.zone).toBe('Lisboa');
  });
});
