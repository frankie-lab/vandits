/**
 * Contract tests — Fase 7 R8: zone ≠ region guard.
 *
 * El helper `shouldDropZone(zone, region)` decide si `zone_id` debe quedar
 * NULL cuando el caller envía la misma cadena para región y provincia/zona.
 * Comparación case- y diacritic-insensitive. `region_id` no se toca.
 *
 * Mirror de `supabase/functions/_shared/zone-region-guard.ts`.
 */
import { describe, it, expect } from 'vitest';
import { shouldDropZone } from '@/shared/geography/zone-region-guard';

describe('Fase 7 R8 — shouldDropZone(zone, region)', () => {
  it('zone === region → drop (zone_id queda NULL)', () => {
    expect(shouldDropZone('Galicia', 'Galicia')).toBe(true);
  });

  it('zone !== region → no drop (caso canónico provincia ⊂ región)', () => {
    expect(shouldDropZone('Pontevedra', 'Galicia')).toBe(false);
  });

  it('case-insensitive: galicia == Galicia', () => {
    expect(shouldDropZone('galicia', 'Galicia')).toBe(true);
    expect(shouldDropZone('  GALICIA  ', 'galicia')).toBe(true);
  });

  it('diacritic-insensitive: Cataluña == Cataluna', () => {
    expect(shouldDropZone('Cataluña', 'Cataluna')).toBe(true);
    expect(shouldDropZone('Andalucía', 'Andalucia')).toBe(true);
  });

  it('zone vacía/null → no drop (no aplica la regla)', () => {
    expect(shouldDropZone(null, 'Galicia')).toBe(false);
    expect(shouldDropZone('', 'Galicia')).toBe(false);
    expect(shouldDropZone('  ', 'Galicia')).toBe(false);
  });

  it('region vacía/null → no drop (no hay con qué comparar)', () => {
    expect(shouldDropZone('Galicia', null)).toBe(false);
    expect(shouldDropZone('Galicia', '')).toBe(false);
  });
});
