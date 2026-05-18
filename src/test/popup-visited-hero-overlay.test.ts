/**
 * P-POPUP-15 — Visited hero overlay retirado.
 *
 * El hero queda SOLO para imagen + acciones foto. El estado personal
 * (visitado/pendiente/rating) vive exclusivamente en el bloque canónico
 * de ratings (P-POPUP-14.2). `buildVisitedHeroOverlay` y
 * `isVisitedHeroOverlayActive` se preservan como no-op de contrato.
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

describe('P-POPUP-15 — overlay visited del hero retirado', () => {
  it('isVisitedHeroOverlayActive siempre false', () => {
    expect(isVisitedHeroOverlayActive(poi('a', {}, { imagen: 'http://x/y.jpg' }), OWN)).toBe(false);
    expect(isVisitedHeroOverlayActive(poi('a', { visited: 'true' }, { imagen: 'http://x/y.jpg' }), OWN)).toBe(false);
    expect(isVisitedHeroOverlayActive(poi('a', { visited: 'true' }), OWN)).toBe(false);
    expect(isVisitedHeroOverlayActive(poi('nearby-id', { visited: 'true' }, { imagen: 'http://x/y.jpg' }), OWN)).toBe(false);
  });

  it('buildVisitedHeroOverlay siempre devuelve ""', () => {
    expect(buildVisitedHeroOverlay(poi('a'), OWN)).toBe('');
    expect(buildVisitedHeroOverlay(poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }), OWN)).toBe('');
    expect(buildVisitedHeroOverlay(poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }), OWN)).toBe('');
  });

  it('buildImageSection nunca inyecta hooks de overlay visited', () => {
    const cases: Array<[GeoLocation, any]> = [
      [poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }), { imagen: 'http://x.jpg' }],
      [poi('a', {}, { imagen: 'http://x.jpg' }), { imagen: 'http://x.jpg' }],
      [poi('a', { user_image_url: 'http://u.jpg' }), null],
      [poi('a', { visited: 'true', user_image_url: 'http://u.jpg' }), null],
    ];
    for (const [loc, enriched] of cases) {
      const html = buildImageSection(loc, enriched, OWN);
      expect(html).not.toContain('data-visited-hero-overlay');
      expect(html).not.toContain('data-action="toggle-visited"');
      expect(html).not.toContain('popup-hero-visited-badge');
      expect(html).not.toContain('>Visitado<');
      expect(html).not.toContain('>Pendiente<');
    }
  });
});
