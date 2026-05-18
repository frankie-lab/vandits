/**
 * P-POPUP-15 — Hero NO renderiza estado personal.
 *
 * El overlay visited/pendiente ha sido retirado del hero. El estado personal
 * (visitado / pendiente / valoración) vive exclusivamente en el bloque
 * canónico de ratings (P-POPUP-14.2). `resolveVisitedPresentationState`
 * preserva su interfaz pero todos los flags de presentación son `false`.
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

const CASES: Array<[string, GeoLocation, any, any]> = [
  ['visited + hero IA', poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }), { imagen: 'http://x.jpg' }, OWN],
  ['pendiente + hero IA', poi('a', {}, { imagen: 'http://x.jpg' }), { imagen: 'http://x.jpg' }, OWN],
  ['visited sin hero', poi('a', { visited: 'true' }), null, OWN],
  ['pendiente sin hero', poi('a', {}), null, OWN],
  ['curator', poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }), { imagen: 'http://x.jpg' }, { ...OWN, curatorId: 'cur' } as any],
  ['nearby', poi('nearby-id', { visited: 'true' }, { imagen: 'http://x.jpg' }), { imagen: 'http://x.jpg' }, OWN],
  ['verified + hero', poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }), { imagen: 'http://x.jpg' }, OWN],
];

describe('P-POPUP-15 — resolveVisitedPresentationState (no-op presentación)', () => {
  for (const [label, loc, enriched, own] of CASES) {
    it(`${label}: todos los flags de presentación = false`, () => {
      const st = resolveVisitedPresentationState(loc, own, enriched);
      expect(st.showHeroOverlay).toBe(false);
      expect(st.showInlineVisited).toBe(false);
      expect(st.showVisitedPill).toBe(false);
      expect(st.showVerifiedOnHero).toBe(false);
    });
  }

  it('isVisitedHeroOverlayActive === false en cualquier caso', () => {
    for (const [, loc, enriched, own] of CASES) {
      expect(isVisitedHeroOverlayActive(loc, own, enriched)).toBe(false);
    }
  });
});

describe('P-POPUP-15 — buildVisitedHeroOverlay no-op', () => {
  it('siempre devuelve "" (cualquier input / state forzado)', () => {
    for (const [, loc, enriched, own] of CASES) {
      expect(buildVisitedHeroOverlay(loc, own, enriched)).toBe('');
    }
    // Incluso forzando un state truthy desde fuera, sigue vacío.
    const forced: any = { showHeroOverlay: true, isVisited: true, visitRelevance: null };
    expect(buildVisitedHeroOverlay(poi('a'), OWN, null, forced)).toBe('');
  });
});

describe('P-POPUP-15 — buildImageSection no inyecta overlay visited', () => {
  for (const [label, loc, enriched, own] of CASES) {
    it(`${label}: ningún hook de overlay en el HTML`, () => {
      const html = buildImageSection(loc, enriched, own);
      expect(html).not.toContain('data-visited-hero-overlay');
      expect(html).not.toContain('data-action="toggle-visited"');
      expect(html).not.toContain('popup-hero-visited-badge');
    });
  }
});
