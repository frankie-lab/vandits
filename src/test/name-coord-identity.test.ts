import { describe, it, expect } from 'vitest';
import {
  assertNameCoordinateIdentity,
  isGenericName,
  similarity,
  normalizeName,
  type NearbyCandidate,
  type RemoteCandidate,
} from '@/shared/geography/name-coord-identity';

const baseOpts = {
  supabaseUrl: 'http://test.local',
  serviceKey: 'svc-key',
};

describe('R9 — assertNameCoordinateIdentity (Phase 3 contract)', () => {
  it('returns ok when name matches a nearby candidate', async () => {
    const nearby: NearbyCandidate[] = [
      { name: 'Plaza Mayor', latitude: 40.4155, longitude: -3.7074, distance_m: 30 },
      { name: 'Mercado de San Miguel', latitude: 40.4154, longitude: -3.7090, distance_m: 120 },
    ];
    const result = await assertNameCoordinateIdentity({
      ...baseOpts,
      name: 'Plaza Mayor',
      lat: 40.4155,
      lng: -3.7074,
      searchNearby: async () => nearby,
      searchCandidates: async () => [],
    });
    expect(result.status).toBe('ok');
    expect(result.matched?.name).toBe('Plaza Mayor');
  });

  it('returns name_coordinate_mismatch when nothing nearby matches and no remote candidates', async () => {
    const nearby: NearbyCandidate[] = [
      { name: 'Cafetería Sol', latitude: 40.0, longitude: -3.0, distance_m: 80 },
    ];
    const result = await assertNameCoordinateIdentity({
      ...baseOpts,
      name: 'Sagrada Familia',
      lat: 40.0,
      lng: -3.0,
      searchNearby: async () => nearby,
      searchCandidates: async () => [],
    });
    expect(result.status).toBe('name_coordinate_mismatch');
    expect(result.nearby?.length).toBe(1);
  });

  it('returns name_found_elsewhere when remote candidates are all far away', async () => {
    const remote: RemoteCandidate[] = [
      { name: 'Sagrada Familia', lat: 41.4036, lng: 2.1744, distanceKm: 500, source: 'wikipedia' },
      { name: 'Sagrada Familia', lat: 19.4326, lng: -99.1332, distanceKm: 9000, source: 'wikidata' },
    ];
    const result = await assertNameCoordinateIdentity({
      ...baseOpts,
      name: 'Sagrada Familia',
      lat: 40.4168,
      lng: -3.7038,
      searchNearby: async () => [],
      searchCandidates: async () => remote,
    });
    expect(result.status).toBe('name_found_elsewhere');
    expect(result.candidates?.length).toBe(2);
    expect(result.candidates?.[0].name).toBe('Sagrada Familia');
  });

  it('returns ok for generic name with empty nearby (does not block imports)', async () => {
    expect(isGenericName('Hotel')).toBe(true);
    expect(isGenericName('Parking')).toBe(true);
    expect(isGenericName('Mirador')).toBe(true);
    const result = await assertNameCoordinateIdentity({
      ...baseOpts,
      name: 'Hotel',
      lat: 42.0,
      lng: -8.0,
      searchNearby: async () => [],
      // generic → searchCandidates skipped; should not be called
      searchCandidates: async () => { throw new Error('should not be called'); },
    });
    expect(result.status).toBe('ok');
  });

  it('returns identity_lookup_unavailable as HARD BLOCK when both lookups throw', async () => {
    const result = await assertNameCoordinateIdentity({
      ...baseOpts,
      name: 'Catedral de Burgos',
      lat: 42.3408,
      lng: -3.7042,
      searchNearby: async () => { throw new Error('overpass timeout'); },
      searchCandidates: async () => { throw new Error('wikipedia 503'); },
    });
    expect(result.status).toBe('identity_lookup_unavailable');
    expect(result.reason).toBe('both_lookups_failed');
  });

  it('returns identity_lookup_unavailable when nearby fails for a generic name (only signal)', async () => {
    const result = await assertNameCoordinateIdentity({
      ...baseOpts,
      name: 'Mirador',
      lat: 42.0,
      lng: -8.0,
      searchNearby: async () => { throw new Error('overpass down'); },
    });
    expect(result.status).toBe('identity_lookup_unavailable');
    expect(result.reason).toBe('nearby_lookup_failed_generic_name');
  });

  it('similarity tolerates diacritics, articles and generic prefixes', () => {
    expect(normalizeName('La Sagrada Família')).toBe('sagrada familia');
    expect(normalizeName('Iglesia de San Pedro')).toBe('san pedro');
    expect(similarity('La Sagrada Família', 'Sagrada Familia')).toBeGreaterThanOrEqual(0.95);
    expect(similarity('Plaza Mayor', 'Plaza Mayor de Madrid')).toBeGreaterThanOrEqual(0.82);
    expect(similarity('Hotel', 'Plaza Mayor')).toBeLessThan(0.5);
  });
});
