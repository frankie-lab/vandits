// Contract test — BLOQUEANTE: subtab/CTA/árbol DEBEN derivar del MISMO
// universeBase en el panel "Buscar y Filtrar" → Mantener.
//
// Ver docs/audits/search-filter-maintain-tree-universe-counts-unification-postflight.md.
//
// Invariante (sin treeSelection, sin userSelection):
//   subtab        = resolveUniverseBase(mode, source).length
//   ctaCount      = effectiveActionSet.length
//   geoRootSum    = sum(rootNodes(resolveUniverseBase(mode, source)))
//   ───────────────────────────────────────────────
//   subtab == ctaCount == geoRootSum == universeBase.length

import { describe, it, expect } from 'vitest';
import {
  resolveUniverseBase,
  isLocationInDebtUniverse,
  isLocationInUnenrichedUniverse,
} from '@/domains/content/lib/resolve-universe-base';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import type { GeoLocation } from '@/types/location';

function loc(id: string, over: Partial<GeoLocation> = {}): GeoLocation {
  return {
    id,
    name: `loc-${id}`,
    coordinates: { lat: 0, lng: 0 },
    documentId: 'doc',
    isApproved: true,
    ...over,
  } as GeoLocation;
}

// Fixture: mezcla heterogénea — own/followed/orphan-geo, debt/sano,
// enriched/imported, con sourceKind variado.
const FIXTURE: GeoLocation[] = [
  loc('a-debt-own', { geoHealth: 'partial' } as any),
  loc('b-debt-followed', { ownerUserId: 'u2', geoHealth: 'stale_name' } as any),
  loc('c-unenr-imported'),
  loc('d-unenr-followed', { ownerUserId: 'u2' } as any),
  loc('e-app-skip', { sourceKind: 'app' } as any),
  loc('f-enriched-ok', {
    enrichedData: { descripcion: 'Texto IA suficientemente largo para pasar el verificador heurístico.' },
    geoHealth: 'ok',
  } as any),
  loc('g-orphan-geo-debt', { geoHealth: 'empty' } as any), // sin geo resuelta
];

describe('counts unification — Mantener (BLOQUEANTE)', () => {
  it('debt: subtab == CTA == universeBase.length (sin tree/selection)', () => {
    const universe = resolveUniverseBase('debt', FIXTURE);
    const subtabCount = universe.length;

    // Mismo predicado que el componente: parte de universe + matcher sin health.
    const ctaSet = universe.filter((l) =>
      matchesLocationFilters(l, {}, { includeHealth: false }),
    );

    expect(subtabCount).toBe(ctaSet.length);
    // Y ambos deben coincidir con el predicado canónico aplicado al pool.
    expect(subtabCount).toBe(FIXTURE.filter(isLocationInDebtUniverse).length);
  });

  it('unenriched: subtab == CTA == universeBase.length (sin tree/selection)', () => {
    const universe = resolveUniverseBase('unenriched', FIXTURE);
    const subtabCount = universe.length;
    const ctaSet = universe.filter((l) =>
      matchesLocationFilters(l, {}, { includeHealth: false }),
    );
    expect(subtabCount).toBe(ctaSet.length);
    expect(subtabCount).toBe(FIXTURE.filter(isLocationInUnenrichedUniverse).length);
  });

  it('followed consistency: una location followed con deuda cuenta en universe ⇒ cuenta en CTA', () => {
    const universe = resolveUniverseBase('debt', FIXTURE);
    const ctaSet = universe.filter((l) =>
      matchesLocationFilters(l, {}, { includeHealth: false }),
    );
    const inUniverse = universe.some((l) => l.id === 'b-debt-followed');
    const inCta = ctaSet.some((l) => l.id === 'b-debt-followed');
    expect(inUniverse).toBe(inCta);
    expect(inUniverse).toBe(true);
  });

  it('geo-orphan consistency: POI con geoHealth=empty cuenta igual en universe y CTA', () => {
    const universe = resolveUniverseBase('debt', FIXTURE);
    const ctaSet = universe.filter((l) =>
      matchesLocationFilters(l, {}, { includeHealth: false }),
    );
    const inUniverse = universe.some((l) => l.id === 'g-orphan-geo-debt');
    const inCta = ctaSet.some((l) => l.id === 'g-orphan-geo-debt');
    expect(inUniverse).toBe(inCta);
    expect(inUniverse).toBe(true);
  });

  it('source guard: el matcher con filters vacíos no excluye ningún POI del universe', () => {
    for (const mode of ['debt', 'unenriched', 'all'] as const) {
      const universe = resolveUniverseBase(mode, FIXTURE);
      const passes = universe.filter((l) =>
        matchesLocationFilters(l, {}, { includeHealth: false }),
      );
      expect(passes.length).toBe(universe.length);
    }
  });
});
