/**
 * Tests del helper único `isShareablePoi` y `isHealthyShareableGeo`.
 * Frontera canónica de "contenido publicable" (PR-1 curated sharing boundary).
 */
import { describe, it, expect } from 'vitest';
import type { GeoLocation } from '@/types/location';
import { isShareablePoi } from '@/domains/content/lib/is-shareable-poi';
import { isHealthyShareableGeo } from '@/domains/content/lib/geo-health';

function loc(p: Partial<GeoLocation>): GeoLocation {
  return {
    id: 'x',
    name: 'x',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    visibility: 'public',
    geoHealth: 'ok',
    enrichedData: { descripcion: 'desc' } as any,
    ...p,
  } as GeoLocation;
}

describe('isHealthyShareableGeo', () => {
  it('true sólo cuando geo_health = ok', () => {
    expect(isHealthyShareableGeo(loc({ geoHealth: 'ok' }))).toBe(true);
    expect(isHealthyShareableGeo(loc({ geoHealth: 'partial' }))).toBe(false);
    expect(isHealthyShareableGeo(loc({ geoHealth: 'broken' }))).toBe(false);
    expect(isHealthyShareableGeo(loc({ geoHealth: 'stale_name' }))).toBe(false);
    expect(isHealthyShareableGeo(loc({ geoHealth: 'empty' }))).toBe(false);
    expect(isHealthyShareableGeo(loc({ geoHealth: null }))).toBe(false);
    expect(isHealthyShareableGeo(null)).toBe(false);
  });
});

describe('isShareablePoi — 4 ramas de exclusión', () => {
  it('positivo canónico', () => {
    expect(isShareablePoi(loc({}))).toBe(true);
  });

  it('no enriched → false', () => {
    expect(isShareablePoi(loc({ enrichedData: undefined }))).toBe(false);
    expect(isShareablePoi(loc({ enrichedData: { descripcion: '' } as any }))).toBe(false);
  });

  it('geo no ok → false', () => {
    expect(isShareablePoi(loc({ geoHealth: 'partial' }))).toBe(false);
    expect(isShareablePoi(loc({ geoHealth: 'broken' }))).toBe(false);
  });

  it('visibility private/undefined → false', () => {
    expect(isShareablePoi(loc({ visibility: 'private' }))).toBe(false);
    expect(isShareablePoi(loc({ visibility: undefined }))).toBe(false);
  });

  it('deleted → false', () => {
    expect(isShareablePoi(loc({ deletedAt: new Date() } as any))).toBe(false);
    expect(isShareablePoi(loc({ deleted_at: '2026-01-01' } as any))).toBe(false);
  });

  it('followers visibility OK', () => {
    expect(isShareablePoi(loc({ visibility: 'followers' }))).toBe(true);
  });
});
