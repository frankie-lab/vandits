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
  resolveHeroImage,
  buildImageSection,
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

describe('P-POPUP-7B — renderer↔resolver hero parity (drift extinguido)', () => {
  const cases: Array<[string, GeoLocation, any]> = [
    ['enriched + AI image', poi('p1', { visited: 'true' }, { imagen: 'http://ai.jpg' }), { imagen: 'http://ai.jpg' }],
    ['enriched sin AI image', poi('p2', { visited: 'true' }, {}), {}],
    ['legacy + AI imagen en location (suprimida)', poi('p3', { visited: 'true' }, { imagen: 'http://ai.jpg' }), null],
    ['user image pública', poi('p4', { visited: 'true', user_image_url: 'http://u.jpg', user_image_visibility: 'public' }, null), null],
    ['user image privada vista por otro', poi('p5', { visited: 'true', user_image_url: 'http://u.jpg', user_image_visibility: 'private' }, null), null],
  ];

  for (const [label, loc, enriched] of cases) {
    it(`paridad: ${label}`, () => {
      const ownership = label.includes('vista por otro')
        ? { isOwn: false, isFollowing: false }
        : { isOwn: true, isFollowing: false };
      const hero = resolveHeroImage(loc, ownership, enriched);
      const state = resolveVisitedPresentationState(loc, ownership, enriched);
      // Contrato canon: hasHero del resolver == !!displayImage del helper único.
      expect(state.hasHero).toBe(!!hero.displayImage);
      // Renderer usa el mismo helper, asi que su HTML refleja la misma decisión.
      const html = buildImageSection(loc, enriched, ownership, state);
      if (hero.displayImage) {
        expect(html).toContain(hero.displayImage);
      }
      // Overlay aparece sii visited + hero + no curator/nearby.
      const shouldOverlay = state.isVisited && state.hasHero && !state.isCurator && !state.isNearby;
      expect(state.showHeroOverlay).toBe(shouldOverlay);
      if (shouldOverlay) {
        expect(html).toContain('data-visited-hero-overlay="true"');
      } else {
        expect(html).not.toContain('data-visited-hero-overlay="true"');
      }
    });
  }
});
