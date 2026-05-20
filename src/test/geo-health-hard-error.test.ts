/**
 * Fase 5 — `geo_health` honesto (R2).
 *
 * Contract test del helper cliente espejo. La fuente de verdad real es
 * el trigger SQL `_compute_location_geo_health` (migración Fase 5); la
 * verificación funcional del trigger requiere ejecutar la migración y
 * hacer INSERT/UPDATE reales — no automatizable en Vitest puro. Estos
 * tests cubren la lógica del espejo TS que aplica las mismas reglas de
 * forma defensiva sobre lecturas del cliente.
 */
import { describe, it, expect } from 'vitest';
import {
  computeHonestGeoHealth,
  isHardErrorGeo,
  type GeoHealthInput,
} from '@/shared/geography/compute-geo-health';

const base: GeoHealthInput = {
  latitude: 40.4168,
  longitude: -3.7038,
  enrichmentStatus: 'enriched',
  rawGeocode: { country: 'ES' },
  geoHealth: 'ok',
};

describe('Fase 5 — geo_health honesto (R2)', () => {
  it('coords (0,0) → hardError aunque geoHealth persistido sea ok', () => {
    const loc: GeoHealthInput = { ...base, latitude: 0, longitude: 0 };
    expect(isHardErrorGeo(loc)).toBe(true);
    expect(computeHonestGeoHealth(loc)).toBe('hardError');
  });

  it('latitude null → hardError', () => {
    const loc: GeoHealthInput = { ...base, latitude: null };
    expect(computeHonestGeoHealth(loc)).toBe('hardError');
  });

  it('longitude null → hardError', () => {
    const loc: GeoHealthInput = { ...base, longitude: null };
    expect(computeHonestGeoHealth(loc)).toBe('hardError');
  });

  it('latitude fuera de WGS84 (|lat| > 90) → hardError', () => {
    expect(computeHonestGeoHealth({ ...base, latitude: 91 })).toBe('hardError');
    expect(computeHonestGeoHealth({ ...base, latitude: -90.5 })).toBe('hardError');
  });

  it('longitude fuera de WGS84 (|lng| > 180) → hardError', () => {
    expect(computeHonestGeoHealth({ ...base, longitude: 181 })).toBe('hardError');
    expect(computeHonestGeoHealth({ ...base, longitude: -181 })).toBe('hardError');
  });

  it('enriched + raw_geocode NULL → hardError', () => {
    const loc: GeoHealthInput = {
      ...base,
      rawGeocode: null,
      enrichmentStatus: 'enriched',
    };
    expect(computeHonestGeoHealth(loc)).toBe('hardError');
  });

  it('coords válidas + raw_geocode presente → respeta geoHealth persistido', () => {
    expect(computeHonestGeoHealth({ ...base, geoHealth: 'ok' })).toBe('ok');
    expect(computeHonestGeoHealth({ ...base, geoHealth: 'partial' })).toBe('partial');
    expect(computeHonestGeoHealth({ ...base, geoHealth: 'broken' })).toBe('broken');
    expect(computeHonestGeoHealth({ ...base, geoHealth: 'stale_name' })).toBe(
      'stale_name',
    );
  });

  it('coords válidas + status pending + raw_geocode null → NO hardError (regla sólo aplica si enriched)', () => {
    const loc: GeoHealthInput = {
      ...base,
      enrichmentStatus: 'pending',
      rawGeocode: null,
      geoHealth: 'empty',
    };
    expect(isHardErrorGeo(loc)).toBe(false);
    expect(computeHonestGeoHealth(loc)).toBe('empty');
  });

  it('acepta también snake_case (raw_geocode / enrichment_status / geo_health)', () => {
    const loc: GeoHealthInput = {
      latitude: 40,
      longitude: -3,
      enrichment_status: 'enriched',
      raw_geocode: null,
      geo_health: 'ok',
    };
    expect(computeHonestGeoHealth(loc)).toBe('hardError');
  });

  it('input null/undefined → hardError defensivo', () => {
    expect(computeHonestGeoHealth(null)).toBe('hardError');
    expect(computeHonestGeoHealth(undefined)).toBe('hardError');
  });
});
