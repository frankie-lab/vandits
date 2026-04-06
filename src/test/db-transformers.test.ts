import { describe, it, expect } from 'vitest';
import { dbLocationToGeoLocation } from '@/domains/content/lib/db-transformers';

describe('dbLocationToGeoLocation', () => {
  it('transforms a DB row to GeoLocation', () => {
    const dbRow = {
      id: 'loc-1',
      name: 'Test Place',
      description: 'A nice place',
      latitude: 41.3851,
      longitude: 2.1734,
      altitude: 15,
      continent: 'Europa',
      country: 'España',
      region: 'Cataluña',
      zone: 'Barcelona',
      place_type: 'mirador',
      custom_data: { visited: 'true' },
      enriched_data: null,
      visibility: 'public',
      user_image_url: null,
      user_image_visibility: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    };

    const result = dbLocationToGeoLocation(dbRow);
    expect(result.id).toBe('loc-1');
    expect(result.name).toBe('Test Place');
    expect(result.coordinates.lat).toBe(41.3851);
    expect(result.coordinates.lng).toBe(2.1734);
    expect(result.coordinates.altitude).toBe(15);
    expect(result.country).toBe('España');
    expect(result.visibility).toBe('public');
    expect(result.customData?.visited).toBe('true');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('merges user_image_url into customData', () => {
    const dbRow = {
      id: 'loc-2',
      name: 'With Image',
      latitude: 40,
      longitude: -3,
      custom_data: {},
      user_image_url: 'https://example.com/img.jpg',
      user_image_visibility: 'public',
      visibility: 'followers',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const result = dbLocationToGeoLocation(dbRow);
    expect(result.customData?.user_image_url).toBe('https://example.com/img.jpg');
    expect(result.customData?.user_image_visibility).toBe('public');
  });
});
