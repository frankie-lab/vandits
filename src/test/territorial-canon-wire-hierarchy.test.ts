/**
 * T2A-wire — Contract test: `getLocationHierarchy` aplica el canon.
 *   - hasProvincia=false ⇒ zone omitido del path
 *   - region==zone whitelisted ⇒ zone colapsado (undefined)
 *   - hasProvincia=true sin colisión ⇒ comportamiento intacto (PT, ES, …)
 */
import { describe, it, expect } from 'vitest';
import { getLocationHierarchy } from '@/shared/geography/hierarchy';
import type { GeoLocation } from '@/types/location';

function makeLoc(partial: Partial<GeoLocation>): GeoLocation {
  return {
    id: 't-1',
    name: 'Test',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    visibility: 'followers',
    ...partial,
  } as GeoLocation;
}

describe('T2A-wire — getLocationHierarchy canon', () => {
  it('SE (hasProvincia=false): zone se omite aunque venga texto', () => {
    const h = getLocationHierarchy(makeLoc({ country: 'Sweden', region: 'Stockholms län', zone: 'INVALID-PROVINCE' }));
    expect(h.zone).toBeUndefined();
    expect(h.region).toBe('Stockholms län');
  });

  it('JP (hasProvincia=false): zone se omite', () => {
    const h = getLocationHierarchy(makeLoc({ country: 'Japan', region: 'Kantō', zone: 'GHOST' }));
    expect(h.zone).toBeUndefined();
  });

  it('AR/CABA (whitelist): region==zone colapsa', () => {
    const h = getLocationHierarchy(makeLoc({
      country: 'Argentina',
      region: 'Ciudad Autónoma de Buenos Aires',
      zone: 'Ciudad Autónoma de Buenos Aires',
    }));
    expect(h.region).toBe('Ciudad Autónoma de Buenos Aires');
    expect(h.zone).toBeUndefined();
  });

  it('AT/Wien (whitelist): region==zone colapsa', () => {
    const h = getLocationHierarchy(makeLoc({ country: 'Austria', region: 'Wien', zone: 'Wien' }));
    expect(h.zone).toBeUndefined();
  });

  it('FR (no whitelist): region!=zone se respeta', () => {
    const h = getLocationHierarchy(makeLoc({ country: 'France', region: 'Île-de-France', zone: 'Paris' }));
    expect(h.region).toBe('Île-de-France');
    expect(h.zone).toBe('Paris');
  });

  it('PT (hasProvincia=true): zone se mantiene', () => {
    const h = getLocationHierarchy(makeLoc({ country: 'Portugal', region: 'Norte', zone: 'Braga' }));
    expect(h.zone).toBe('Braga');
  });

  it('ISO2 desconocido: passthrough completo', () => {
    const h = getLocationHierarchy(makeLoc({ country: 'Atlantis', region: 'R', zone: 'Z' }));
    expect(h.zone).toBe('Z');
  });
});
