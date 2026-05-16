/**
 * P-POPUP-7B (unificación) — `resolveVisitedPresentationState`
 *
 * Single source of truth para el estado visited del popup. Lo consumen
 * tanto `buildVisitedHeroOverlay` como `buildPersonalStateBlock`. Esta
 * suite garantiza que el helper devuelva la matriz canon y que las dos
 * ramas (overlay hero + bloque inferior) NO puedan desincronizarse.
 */
import { describe, it, expect, vi } from 'vitest';
import type { GeoLocation } from '@/types/location';

vi.mock('@/domains/content/lib/nearby-popup-context', () => ({
  isNearbyPopupContext: (id: string) => id === 'nearby-id',
}));

vi.mock('@/domains/content/lib/personal-tags-filter', () => ({
  filterPersonalTags: (_id: string, tags: string[] | undefined) => tags ?? [],
}));

import {
  resolveVisitedPresentationState,
  isVisitedHeroOverlayActive,
  buildVisitedHeroOverlay,
} from '@/components/map/map-popups';

function poi(
  id: string,
  customData: Record<string, string> = {},
  enrichedData: any = null,
): GeoLocation {
  return {
    id,
    name: id,
    coordinates: { lat: 0, lng: 0 },
    customData,
    enrichedData,
  } as unknown as GeoLocation;
}

const OWN = { isOwn: true, isFollowing: false };

describe('resolveVisitedPresentationState — canon matrix', () => {
  it('visited=false + hero → no overlay, pill visible', () => {
    const st = resolveVisitedPresentationState(
      poi('a', {}, { imagen: 'http://x.jpg' }),
      OWN,
    );
    expect(st.isVisited).toBe(false);
    expect(st.hasHero).toBe(true);
    expect(st.showHeroOverlay).toBe(false);
    expect(st.showInlineVisited).toBe(false);
    expect(st.showVisitedPill).toBe(true);
    expect(st.showVerifiedOnHero).toBe(false);
  });

  it('visited=true + hero → overlay + inline, NO pill', () => {
    const st = resolveVisitedPresentationState(
      poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      OWN,
    );
    expect(st.isVisited).toBe(true);
    expect(st.hasHero).toBe(true);
    expect(st.showHeroOverlay).toBe(true);
    expect(st.showInlineVisited).toBe(true);
    expect(st.showVisitedPill).toBe(false);
  });

  it('visited=true + sin hero → fallback: pill, sin overlay', () => {
    const st = resolveVisitedPresentationState(poi('a', { visited: 'true' }), OWN);
    expect(st.hasHero).toBe(false);
    expect(st.showHeroOverlay).toBe(false);
    expect(st.showInlineVisited).toBe(false);
    expect(st.showVisitedPill).toBe(true);
  });

  it('curator point: overlay y pill suprimidos', () => {
    const st = resolveVisitedPresentationState(
      poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      { ...OWN, curatorId: 'cur-1' } as any,
    );
    expect(st.isCurator).toBe(true);
    expect(st.showHeroOverlay).toBe(false);
    expect(st.showVisitedPill).toBe(false);
  });

  it('nearby popup context: overlay y pill suprimidos', () => {
    const st = resolveVisitedPresentationState(
      poi('nearby-id', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      OWN,
    );
    expect(st.isNearby).toBe(true);
    expect(st.showHeroOverlay).toBe(false);
    expect(st.showVisitedPill).toBe(false);
  });

  it('legacy branch (enriched=null) NO usa imagen IA → sin overlay', () => {
    const st = resolveVisitedPresentationState(
      poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      OWN,
      null,
    );
    expect(st.hasHero).toBe(false);
    expect(st.showHeroOverlay).toBe(false);
  });

  it('visited verificado → showVerifiedOnHero=true', () => {
    const st = resolveVisitedPresentationState(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }),
      OWN,
    );
    expect(st.showVerifiedOnHero).toBe(true);
    expect(st.visitRelevance).toBeTruthy();
  });
});

describe('Wrappers comparten la fuente de verdad', () => {
  it('isVisitedHeroOverlayActive === state.showHeroOverlay (misma decisión)', () => {
    const cases: Array<[GeoLocation, any]> = [
      [poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }), OWN],
      [poi('a', {}, { imagen: 'http://x.jpg' }), OWN],
      [poi('a', { visited: 'true' }), OWN],
      [poi('nearby-id', { visited: 'true' }, { imagen: 'http://x.jpg' }), OWN],
    ];
    for (const [loc, own] of cases) {
      const st = resolveVisitedPresentationState(loc, own);
      expect(isVisitedHeroOverlayActive(loc, own)).toBe(st.showHeroOverlay);
    }
  });

  it('buildVisitedHeroOverlay respeta un state precomputado (no recomputa)', () => {
    const loc = poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' });
    const truthy = resolveVisitedPresentationState(loc, OWN);
    // Inyectamos un state forzado a OFF: el overlay debe salir vacío
    // aunque las args sugieran que debería renderizar.
    const off = { ...truthy, showHeroOverlay: false };
    expect(buildVisitedHeroOverlay(loc, OWN, loc.enrichedData, off)).toBe('');
    // Y al revés: state ON con args que devolverían OFF (sin hero) → renderiza.
    const noHero = poi('a', { visited: 'true' });
    const forcedOn = resolveVisitedPresentationState(noHero, OWN);
    const onState = { ...forcedOn, showHeroOverlay: true };
    expect(buildVisitedHeroOverlay(noHero, OWN, null, onState)).toContain('data-visited-hero-overlay="true"');
  });
});
