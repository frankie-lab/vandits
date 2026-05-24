/**
 * Contract tests — Fase 7 R7: places_trunk rechaza coords inválidas.
 *
 * Verifica que la defensa cliente espejo (en `enrich-location.ts` y
 * `batch-enrich`) NO invoca `lookup_trunk_place` ni `upsert_trunk_place`
 * con coordenadas que `isValidWgs84Coord` clasifica como inválidas.
 *
 * Test unitario del gate canónico (no depende de Supabase): la regla del
 * gate vive en `src/shared/geography/coord-validity.ts` y es la misma que
 * la migración SQL aplica server-side.
 */
import { describe, it, expect } from 'vitest';
import { isValidWgs84Coord } from '@/shared/geography/coord-validity';

describe('Fase 7 R7 — places_trunk coord guard (cliente espejo)', () => {
  it('(0,0) Null Island es inválida → trunk lookup/upsert se omite', () => {
    expect(isValidWgs84Coord(0, 0)).toBe(false);
  });

  it('lat/lng null son inválidas', () => {
    expect(isValidWgs84Coord(null as unknown as number, 10)).toBe(false);
    expect(isValidWgs84Coord(10, null as unknown as number)).toBe(false);
  });

  it('NaN es inválido', () => {
    expect(isValidWgs84Coord(NaN, 10)).toBe(false);
    expect(isValidWgs84Coord(10, NaN)).toBe(false);
  });

  it('fuera de WGS84 es inválido', () => {
    expect(isValidWgs84Coord(95, 10)).toBe(false);
    expect(isValidWgs84Coord(-91, 10)).toBe(false);
    expect(isValidWgs84Coord(10, 200)).toBe(false);
    expect(isValidWgs84Coord(10, -181)).toBe(false);
  });

  it('coords válidas pasan (Barcelona)', () => {
    expect(isValidWgs84Coord(41.3851, 2.1734)).toBe(true);
  });
});
