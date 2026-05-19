import { describe, it, expect } from 'vitest';
import {
  resolveGoogleMapsUrl,
  resolveAppleMapsUrl,
} from '@/domains/sharing/lib/external-maps-url';
import type { GeoLocation } from '@/types/location';

const baseLoc = {
  name: 'Test POI',
  coordinates: { lat: 41.3851, lng: 2.1734 },
} as Pick<GeoLocation, 'name' | 'coordinates' | 'externalRefs'>;

describe('resolveGoogleMapsUrl', () => {
  it('prefers placeId when present', () => {
    const r = resolveGoogleMapsUrl({
      ...baseLoc,
      externalRefs: { maps: { google: { placeId: 'ChIJabc123' } } },
    });
    expect(r.source).toBe('canonical');
    expect(r.url).toBe('https://www.google.com/maps/place/?q=place_id:ChIJabc123');
  });

  it('accepts a valid persisted google URL when no placeId', () => {
    const url = 'https://maps.app.goo.gl/xyz';
    const r = resolveGoogleMapsUrl({
      ...baseLoc,
      externalRefs: { maps: { google: { url } } },
    });
    expect(r.source).toBe('canonical');
    expect(r.url).toBe(url);
  });

  it('rejects a URL on an unauthorized host and falls back to coords', () => {
    const r = resolveGoogleMapsUrl({
      ...baseLoc,
      externalRefs: { maps: { google: { url: 'https://evil.example.com/foo' } } },
    });
    expect(r.source).toBe('coords-fallback');
    expect(r.url).toContain('https://www.google.com/maps/search/?api=1&query=41.3851,2.1734');
  });

  it('falls back to coords when no externalRefs', () => {
    const r = resolveGoogleMapsUrl(baseLoc);
    expect(r.source).toBe('coords-fallback');
    expect(r.url).toBe('https://www.google.com/maps/search/?api=1&query=41.3851,2.1734');
  });
});

describe('resolveAppleMapsUrl', () => {
  it('accepts valid apple URL', () => {
    const url = 'https://maps.apple.com/place?id=I123';
    const r = resolveAppleMapsUrl({
      ...baseLoc,
      externalRefs: { maps: { apple: { url } } },
    });
    expect(r.source).toBe('canonical');
    expect(r.url).toBe(url);
  });

  it('falls back to coords when no externalRefs', () => {
    const r = resolveAppleMapsUrl(baseLoc);
    expect(r.source).toBe('coords-fallback');
    expect(r.url).toContain('https://maps.apple.com/?ll=41.3851,2.1734&q=Test%20POI');
  });

  it('rejects malformed URL and falls back', () => {
    const r = resolveAppleMapsUrl({
      ...baseLoc,
      externalRefs: { maps: { apple: { url: 'not-a-url' } } },
    });
    expect(r.source).toBe('coords-fallback');
  });
});
