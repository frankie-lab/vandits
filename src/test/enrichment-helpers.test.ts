import { describe, it, expect } from 'vitest';
import { getLocationEnrichmentStatus } from '@/domains/content/store/enrichment-helpers';
import { GeoLocation } from '@/types/location';

const baseLoc: GeoLocation = {
  id: 'test-1',
  name: 'Test Location',
  coordinates: { lat: 40, lng: -3 },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('getLocationEnrichmentStatus', () => {
  it('returns "new" for location without description or enrichedData', () => {
    expect(getLocationEnrichmentStatus(baseLoc)).toBe('new');
  });

  it('returns "unknown" for location with description but no enrichedData', () => {
    const loc = { ...baseLoc, description: 'Some original desc' };
    expect(getLocationEnrichmentStatus(loc)).toBe('unknown');
  });

  it('returns "current" for location with enrichedData.descripcion', () => {
    const loc = {
      ...baseLoc,
      enrichedData: { descripcion: 'AI description' } as any,
      updatedAt: new Date(), // recent
    };
    expect(getLocationEnrichmentStatus(loc)).toBe('current');
  });

  it('returns "previous" for location with old enrichedData', () => {
    // Set criteria timestamp to future
    localStorage.setItem('geodata-enrichment-criteria', JSON.stringify({ _updatedAt: Date.now() + 100000 }));
    const loc = {
      ...baseLoc,
      enrichedData: { descripcion: 'AI description' } as any,
      updatedAt: new Date('2020-01-01'),
    };
    expect(getLocationEnrichmentStatus(loc)).toBe('previous');
    localStorage.removeItem('geodata-enrichment-criteria');
  });
});
