/**
 * Tests del helper único `getHealthFilterScopeIds`.
 * Cubre precedencia selection > viewport > filtered, opt-in del modo
 * viewport, casos vacíos y la garantía de que `verde` nunca entra en
 * review/hardError (consecuencia del helper getPointHealthRings).
 */
import { describe, it, expect } from 'vitest';
import { getHealthFilterScopeIds } from '@/domains/discovery/lib/health-filter-scope';
import type { GeoLocation } from '@/types/location';

function loc(partial: Partial<GeoLocation> & { id: string }): GeoLocation {
  return {
    id: partial.id,
    name: partial.id,
    latitude: 0,
    longitude: 0,
    ...partial,
  } as GeoLocation;
}

const partialPoint = loc({ id: 'p1', geoHealth: 'partial' });
const chainPoint   = loc({ id: 'c1', geoHealth: 'broken' });
const okPoint      = loc({ id: 'o1', geoHealth: 'ok' });

describe('health-filter-scope', () => {
  it('sin healthFilter activo → ids vacíos', () => {
    const r = getHealthFilterScopeIds({
      filteredLocations: [partialPoint, chainPoint, okPoint],
      selectedLocationIds: new Set(),
      visibleLocationIds: new Set(),
      healthFilter: null,
      onlyVisible: false,
    });
    expect(r.ids).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('default mode=filtered → matching del filtro activo', () => {
    const r = getHealthFilterScopeIds({
      filteredLocations: [partialPoint, chainPoint, okPoint],
      selectedLocationIds: new Set(),
      visibleLocationIds: new Set(),
      healthFilter: 'partial',
      onlyVisible: false,
    });
    expect(r.mode).toBe('filtered');
    expect(r.ids).toEqual(['p1']);
  });

  it('selection > viewport > filtered (precedencia)', () => {
    const ctx = {
      filteredLocations: [partialPoint, chainPoint, okPoint],
      selectedLocationIds: new Set(['c1']),  // selección manual
      visibleLocationIds: new Set(['p1']),   // viewport activo
      healthFilter: 'chain' as const,
      onlyVisible: true,                     // viewport opt-in
    };
    const r = getHealthFilterScopeIds(ctx);
    // selection manda incluso con onlyVisible activo
    expect(r.mode).toBe('selection');
    expect(r.ids).toEqual(['c1']);
  });

  it('viewport requiere opt-in explícito', () => {
    const r = getHealthFilterScopeIds({
      filteredLocations: [partialPoint, chainPoint],
      selectedLocationIds: new Set(),
      visibleLocationIds: new Set(['c1']),  // visible sólo c1
      healthFilter: 'partial',
      onlyVisible: false,                   // toggle off
    });
    // sin opt-in, mode=filtered ignora visibleLocationIds
    expect(r.mode).toBe('filtered');
    expect(r.ids).toEqual(['p1']);
  });

  it('viewport opt-in intersecta con filtered', () => {
    const r = getHealthFilterScopeIds({
      filteredLocations: [partialPoint, chainPoint, okPoint],
      selectedLocationIds: new Set(),
      visibleLocationIds: new Set(['c1', 'o1']),
      healthFilter: 'chain',
      onlyVisible: true,
    });
    expect(r.mode).toBe('viewport');
    expect(r.ids).toEqual(['c1']);  // o1 no es chain
  });

  it('verde (ok) nunca entra en review/hardError', () => {
    // okPoint sin enrichmentFailureStore: helper no devuelve review.
    const r = getHealthFilterScopeIds({
      filteredLocations: [okPoint],
      selectedLocationIds: new Set(),
      visibleLocationIds: new Set(),
      healthFilter: 'review',
      onlyVisible: false,
    });
    expect(r.ids).toEqual([]);
  });

  it('selection vacía no degrada a filtered cuando hay viewport opt-in', () => {
    const r = getHealthFilterScopeIds({
      filteredLocations: [partialPoint, chainPoint],
      selectedLocationIds: new Set(),
      visibleLocationIds: new Set(['p1']),
      healthFilter: 'partial',
      onlyVisible: true,
    });
    expect(r.mode).toBe('viewport');
    expect(r.ids).toEqual(['p1']);
  });

  describe('curated-only boundary (PR-1)', () => {
    // Tras la curated boundary los seguidos con health rota se filtran ANTES
    // (en getFilteredLocations vía isShareablePoi). El scope sólo recibe
    // propios — todo lo que aparece en `ids` es accionable. La distinción
    // repairableIds/repairableCount desaparece.
    const mine = loc({ id: 'm1', geoHealth: 'partial', ownerUserId: 'me' } as any);

    it('partial: ids contiene los propios y total coincide', () => {
      const r = getHealthFilterScopeIds({
        filteredLocations: [mine],
        selectedLocationIds: new Set(),
        visibleLocationIds: new Set(),
        healthFilter: 'partial',
        onlyVisible: false,
        currentUserId: 'me',
      });
      expect(r.ids).toEqual(['m1']);
      expect(r.total).toBe(1);
    });

    it('review: ids del propio entran (rings no se ocultan para owner)', () => {
      const r = getHealthFilterScopeIds({
        filteredLocations: [mine],
        selectedLocationIds: new Set(),
        visibleLocationIds: new Set(),
        healthFilter: 'review',
        onlyVisible: false,
        currentUserId: 'me',
      });
      // partial != review, este punto no debería estar bajo review
      expect(r.ids).toEqual([]);
    });
  });
});
