/**
 * Fase 3.1 — Mapping fix: `raw_geocode` y metadata geo se preservan al
 * convertir filas de `v_locations_resolved` a `GeoLocation`. Garantiza que
 * `computePoiMaturity` reciba la señal `rawGeocode` y pueda graduar más
 * allá de POI-3 cuando el row la tiene.
 *
 * Ver `docs/contracts/marker-fill-canon-v3.md` Fase 3.1.
 */
import { describe, it, expect } from 'vitest';
import { dbLocationToGeoLocation } from '@/domains/content/lib/db-transformers';
import { computePoiMaturity } from '@/domains/content/lib/poi-maturity';

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loc-1',
    name: 'Test POI',
    latitude: 41.4,
    longitude: 2.17,
    description: 'desc',
    visibility: 'public',
    is_approved: true,
    owner_user_id: 'u-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('dbLocationToGeoLocation — preservación de señales geo (Fase 3.1)', () => {
  it('preserva raw_geocode como rawGeocode (objeto)', () => {
    const payload = { place_id: 'osm-123', lat: '41.4', lon: '2.17' };
    const loc = dbLocationToGeoLocation(baseRow({ raw_geocode: payload }));
    expect(loc.rawGeocode).toEqual(payload);
  });

  it('preserva geo_resolved_at, geo_confidence y geo_source', () => {
    const loc = dbLocationToGeoLocation(
      baseRow({
        geo_resolved_at: '2026-02-03T10:00:00Z',
        geo_confidence: 0.92,
        geo_source: 'nominatim',
      }),
    );
    expect(loc.geoResolvedAt).toBe('2026-02-03T10:00:00Z');
    expect(loc.geoConfidence).toBe(0.92);
    expect(loc.geoSource).toBe('nominatim');
  });

  it('row sin raw_geocode → rawGeocode === null (no undefined)', () => {
    const loc = dbLocationToGeoLocation(baseRow({}));
    expect(loc.rawGeocode).toBeNull();
    expect(loc.geoResolvedAt).toBeNull();
    expect(loc.geoConfidence).toBeNull();
    expect(loc.geoSource).toBeNull();
  });

  it('enriched + raw_geocode + geo_health=ok + descripcion → computePoiMaturity > 3', () => {
    const row = baseRow({
      enrichment_status: 'enriched',
      geo_health: 'ok',
      raw_geocode: { place_id: 'osm-1', lat: '41.4', lon: '2.17' },
      country_resolved: 'España',
      region_resolved: 'Cataluña',
      zone_resolved: 'Barcelona',
      enriched_data: {
        descripcion: 'Descripción IA suficientemente larga para validar.',
      },
    });
    const loc = dbLocationToGeoLocation(row);
    const level = computePoiMaturity(loc);
    expect(level).toBeGreaterThan(3);
  });

  it('regresión: enriched SIN raw_geocode → computePoiMaturity capado en POI-3', () => {
    const row = baseRow({
      enrichment_status: 'enriched',
      geo_health: 'ok',
      country_resolved: 'España',
      region_resolved: 'Cataluña',
      enriched_data: {
        descripcion: 'Descripción IA suficientemente larga para validar.',
      },
    });
    const loc = dbLocationToGeoLocation(row);
    const level = computePoiMaturity(loc);
    expect(level).toBeLessThanOrEqual(3);
  });
});
