/**
 * PR-2 · Health Filter Axis
 *
 * Verifica que `matchesLocationFilters` delega 100% en
 * `getPointHealthRings(loc)` y que el resto de la batería
 * (filter-presets, chips, count) trata `healthFilter` como un
 * sub-eje más del estado.
 *
 * Regla clave: el filtro NO duplica predicados. Que un POI
 * enriquecido nunca pase `review`/`hardError` es **consecuencia**
 * de que `getPointHealthRings` no devuelve esos rings para
 * verdes — no una regla del matcher.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GeoLocation } from '@/types/location';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import {
  resetAllFilters,
  countActiveStateFilters,
  getActiveFilterChips,
} from '@/domains/content/lib/filter-presets';
import { enrichmentFailureStore } from '@/domains/content/hooks/use-enrichment-failure';

const baseLoc = (overrides: Partial<GeoLocation> = {}): GeoLocation => ({
  id: `loc-${Math.random().toString(36).slice(2)}`,
  name: 'Punto',
  coordinates: { lat: 0, lng: 0 },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const enrichedLoc = (overrides: Partial<GeoLocation> = {}): GeoLocation =>
  baseLoc({
    enrichedData: {
      descripcion:
        'Descripción IA suficientemente larga para superar el umbral mínimo de validación del helper hasRealEnrichment y considerarse verde de pleno derecho.',
    } as GeoLocation['enrichedData'],
    ...overrides,
  });

beforeEach(() => {
  enrichmentFailureStore.invalidate();
});

describe('matchesLocationFilters · healthFilter', () => {
  it('sin healthFilter, todos pasan', () => {
    const loc = baseLoc();
    expect(matchesLocationFilters(loc, {})).toBe(true);
  });

  it('partial: solo geoHealth=partial pasa', () => {
    const partial = baseLoc({ geoHealth: 'partial' });
    const broken = baseLoc({ geoHealth: 'broken' });
    const ok = baseLoc();
    expect(matchesLocationFilters(partial, { healthFilter: 'partial' })).toBe(true);
    expect(matchesLocationFilters(broken, { healthFilter: 'partial' })).toBe(false);
    expect(matchesLocationFilters(ok, { healthFilter: 'partial' })).toBe(false);
  });

  it('partial: enriched + geoHealth=partial sigue pasando (consecuencia del helper)', () => {
    const loc = enrichedLoc({ geoHealth: 'partial' });
    expect(matchesLocationFilters(loc, { healthFilter: 'partial' })).toBe(true);
  });

  it('chain: broken y stale_name pasan, partial no', () => {
    expect(
      matchesLocationFilters(baseLoc({ geoHealth: 'broken' }), { healthFilter: 'chain' }),
    ).toBe(true);
    expect(
      matchesLocationFilters(baseLoc({ geoHealth: 'stale_name' }), { healthFilter: 'chain' }),
    ).toBe(true);
    expect(
      matchesLocationFilters(baseLoc({ geoHealth: 'partial' }), { healthFilter: 'chain' }),
    ).toBe(false);
  });

  it('chain: enriched + broken pasa (consecuencia)', () => {
    const loc = enrichedLoc({ geoHealth: 'broken' });
    expect(matchesLocationFilters(loc, { healthFilter: 'chain' })).toBe(true);
  });

  it('review: POI con fallo soft pasa', () => {
    const loc = baseLoc();
    enrichmentFailureStore.recordFailure(loc.id, { kind: 'no_match', message: 'sim' });
    expect(matchesLocationFilters(loc, { healthFilter: 'review' })).toBe(true);
  });

  it('review: POI enriched NO pasa — consecuencia de getPointHealthRings', () => {
    const loc = enrichedLoc();
    enrichmentFailureStore.recordFailure(loc.id, { kind: 'no_match', message: 'sim' });
    expect(matchesLocationFilters(loc, { healthFilter: 'review' })).toBe(false);
  });

  it('hardError: POI con timeout pasa; enriched NO pasa', () => {
    const broken = baseLoc();
    enrichmentFailureStore.recordFailure(broken.id, { kind: 'timeout', message: 'sim' });
    expect(matchesLocationFilters(broken, { healthFilter: 'hardError' })).toBe(true);

    const ok = enrichedLoc();
    enrichmentFailureStore.recordFailure(ok.id, { kind: 'timeout', message: 'sim' });
    expect(matchesLocationFilters(ok, { healthFilter: 'hardError' })).toBe(false);
  });

  it('AND con searchTerm', () => {
    const loc = baseLoc({ name: 'Faro de Hércules', geoHealth: 'broken' });
    expect(
      matchesLocationFilters(loc, { healthFilter: 'chain', searchTerm: 'Hércules' }),
    ).toBe(true);
    expect(
      matchesLocationFilters(loc, { healthFilter: 'chain', searchTerm: 'NoExiste' }),
    ).toBe(false);
    expect(
      matchesLocationFilters(loc, { healthFilter: 'partial', searchTerm: 'Hércules' }),
    ).toBe(false);
  });
});

describe('filter-presets · healthFilter', () => {
  it('resetAllFilters borra healthFilter', () => {
    const next = resetAllFilters({ healthFilter: 'review', searchTerm: 'x' });
    expect(next.healthFilter).toBeUndefined();
    expect(next.searchTerm).toBeUndefined();
  });

  it('resetAllFilters preserva clasificación + geo', () => {
    const next = resetAllFilters({
      healthFilter: 'chain',
      placeType: 'monument',
      country: 'España',
    });
    expect(next.healthFilter).toBeUndefined();
    expect(next.placeType).toBe('monument');
    expect(next.country).toBe('España');
  });

  it('countActiveStateFilters cuenta healthFilter', () => {
    expect(countActiveStateFilters({})).toBe(0);
    expect(countActiveStateFilters({ healthFilter: 'partial' })).toBe(1);
    expect(
      countActiveStateFilters({ healthFilter: 'partial', searchTerm: 'x' }),
    ).toBe(2);
  });

  it('getActiveFilterChips emite chip axis=health con label en ES', () => {
    const chips = getActiveFilterChips({ healthFilter: 'review' });
    const health = chips.find((c) => c.axis === 'health');
    expect(health).toBeDefined();
    expect(health!.label).toBe('Revisar');
    expect(health!.id).toBe('health:review');
  });

  it('chip.remove borra solo healthFilter, deja el resto', () => {
    const chips = getActiveFilterChips({
      healthFilter: 'hardError',
      searchTerm: 'foo',
      country: 'España',
    });
    const health = chips.find((c) => c.axis === 'health')!;
    const next = health.remove({
      healthFilter: 'hardError',
      searchTerm: 'foo',
      country: 'España',
    });
    expect(next.healthFilter).toBeUndefined();
    expect(next.searchTerm).toBe('foo');
    expect(next.country).toBe('España');
  });
});
