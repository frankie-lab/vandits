import { describe, it, expect } from 'vitest';
import {
  buildExternalMapLink,
  resolveGoogleMapsUrl,
  resolveAppleMapsUrl,
} from '@/domains/sharing/lib/external-maps-url';
import type { GeoLocation } from '@/types/location';

const baseLoc = {
  name: 'Test POI',
  coordinates: { lat: 41.3851, lng: 2.1734 },
} as Pick<GeoLocation, 'name' | 'coordinates' | 'externalRefs'>;

describe('buildExternalMapLink — Google', () => {
  it('placeId → high, query + query_place_id', () => {
    const r = buildExternalMapLink(
      { ...baseLoc, externalRefs: { maps: { google: { placeId: '0xd2e7d00003ba2fb:0xbdd3005d8f2947b6' } } } },
      'google',
    );
    expect(r.mode).toBe('place_id');
    expect(r.confidence).toBe('high');
    expect(r.label).toBe('Abrir en Google Maps');
    expect(r.url).toContain('https://www.google.com/maps/search/?api=1');
    expect(r.url).toContain('query=Test%20POI');
    expect(r.url).toContain('query_place_id=0xd2e7d00003ba2fb%3A0xbdd3005d8f2947b6');
  });

  it('name + coords → medium, label "Buscar"', () => {
    const r = buildExternalMapLink(baseLoc, 'google');
    expect(r.mode).toBe('name_coords');
    expect(r.confidence).toBe('medium');
    expect(r.label).toBe('Buscar en Google Maps');
    expect(r.url).toBe(
      'https://www.google.com/maps/search/?api=1&query=Test%20POI%2041.3851%2C2.1734',
    );
  });

  it('solo coords (sin name) → low, label "Abrir coordenadas"', () => {
    const r = buildExternalMapLink({ coordinates: baseLoc.coordinates, name: '' }, 'google');
    expect(r.mode).toBe('coords');
    expect(r.confidence).toBe('low');
    expect(r.label).toBe('Abrir coordenadas en Google Maps');
    expect(r.url).toBe('https://www.google.com/maps/search/?api=1&query=41.3851,2.1734');
  });

  it('persisted url se ignora cuando hay coords (no es identidad principal)', () => {
    const r = buildExternalMapLink(
      {
        ...baseLoc,
        externalRefs: { maps: { google: { url: 'https://maps.app.goo.gl/xyz' } } },
      },
      'google',
    );
    // coords + name presentes ⇒ name_coords gana al persisted URL.
    expect(r.mode).toBe('name_coords');
  });

  it('persisted url se usa SOLO como último recurso (sin coords ni name)', () => {
    const r = buildExternalMapLink(
      {
        name: '',
        coordinates: { lat: NaN as unknown as number, lng: NaN as unknown as number },
        externalRefs: { maps: { google: { url: 'https://maps.app.goo.gl/xyz' } } },
      },
      'google',
    );
    expect(r.mode).toBe('place_id');
    expect(r.confidence).toBe('high');
    expect(r.url).toBe('https://maps.app.goo.gl/xyz');
  });

  it('sin nada → url null', () => {
    const r = buildExternalMapLink(
      { name: '', coordinates: { lat: NaN as unknown as number, lng: NaN as unknown as number } },
      'google',
    );
    expect(r.url).toBeNull();
    expect(r.label).toBeNull();
  });
});

describe('buildExternalMapLink — Apple', () => {
  it('name + coords → medium, q + ll', () => {
    const r = buildExternalMapLink(baseLoc, 'apple');
    expect(r.mode).toBe('name_coords');
    expect(r.confidence).toBe('medium');
    expect(r.label).toBe('Buscar en Apple Maps');
    expect(r.url).toBe('https://maps.apple.com/?q=Test%20POI&ll=41.3851,2.1734');
  });

  it('solo coords → low', () => {
    const r = buildExternalMapLink({ coordinates: baseLoc.coordinates, name: '' }, 'apple');
    expect(r.mode).toBe('coords');
    expect(r.confidence).toBe('low');
    expect(r.label).toBe('Abrir coordenadas en Apple Maps');
    expect(r.url).toBe('https://maps.apple.com/?ll=41.3851,2.1734');
  });
});

describe('legacy wrappers', () => {
  it('resolveGoogleMapsUrl: name+coords → canonical', () => {
    expect(resolveGoogleMapsUrl(baseLoc).source).toBe('canonical');
  });

  it('resolveGoogleMapsUrl: solo coords → coords-fallback', () => {
    expect(
      resolveGoogleMapsUrl({ coordinates: baseLoc.coordinates, name: '' }).source,
    ).toBe('coords-fallback');
  });

  it('resolveAppleMapsUrl: solo coords → coords-fallback', () => {
    expect(
      resolveAppleMapsUrl({ coordinates: baseLoc.coordinates, name: '' }).source,
    ).toBe('coords-fallback');
  });
});
