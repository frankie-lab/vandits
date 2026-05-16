/**
 * P-POPUP-7B — Visited hero overlay.
 *
 * - Visible SÓLO si `customData.visited === 'true'` y hay hero image.
 * - Sin texto "Visitado" en el overlay (sólo iconos).
 * - data-action="toggle-visited" + data-visited-hero-overlay="true".
 * - Ausente para curator/nearby/sin-hero/no-visitado.
 * - Cuando overlay activo, `buildPersonalStateBlock` colapsa a inline
 *   `✓ Visitado` discreto y NO renderiza verified badge inline.
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
  buildPersonalStateBlock,
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

const OWN_VIEWER = { isOwn: true, isFollowing: false };

describe('P-POPUP-7B — isVisitedHeroOverlayActive', () => {
  it('false when not visited', () => {
    expect(isVisitedHeroOverlayActive(poi('a', {}, { imagen: 'http://x/y.jpg' }), OWN_VIEWER)).toBe(false);
  });

  it('false when no hero image (no user image, no AI image)', () => {
    expect(isVisitedHeroOverlayActive(poi('a', { visited: 'true' }), OWN_VIEWER)).toBe(false);
  });

  it('false for curator points', () => {
    const out = isVisitedHeroOverlayActive(
      poi('a', { visited: 'true' }, { imagen: 'http://x/y.jpg' }),
      { ...OWN_VIEWER, curatorId: 'cur-1' } as any,
    );
    expect(out).toBe(false);
  });

  it('false in nearby popup context', () => {
    expect(isVisitedHeroOverlayActive(
      poi('nearby-id', { visited: 'true' }, { imagen: 'http://x/y.jpg' }),
      OWN_VIEWER,
    )).toBe(false);
  });

  it('true with AI image + visited', () => {
    expect(isVisitedHeroOverlayActive(
      poi('a', { visited: 'true' }, { imagen: 'http://x/y.jpg' }),
      OWN_VIEWER,
    )).toBe(true);
  });

  it('true with own user image + visited (private visibility ok if isOwn)', () => {
    expect(isVisitedHeroOverlayActive(
      poi('a', { visited: 'true', user_image_url: 'http://x/u.jpg' }),
      OWN_VIEWER,
    )).toBe(true);
  });

  it('legacy branch: enriched=null suppresses AI image fallback', () => {
    // Legacy popup passes enriched=null; helper must honor that.
    expect(isVisitedHeroOverlayActive(
      poi('a', { visited: 'true' }, { imagen: 'http://x/y.jpg' }),
      OWN_VIEWER,
      null,
    )).toBe(false);
  });
});

describe('P-POPUP-7B — buildVisitedHeroOverlay', () => {
  it('returns empty when inactive', () => {
    expect(buildVisitedHeroOverlay(poi('a'), OWN_VIEWER)).toBe('');
  });

  it('renders absolute pill with data-action="toggle-visited"', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    expect(out).toContain('data-action="toggle-visited"');
    expect(out).toContain('data-visited-hero-overlay="true"');
    expect(out).toContain('position: absolute');
    expect(out).toContain('bottom: 8px');
    expect(out).toContain('left: 8px');
  });

  it('does NOT render the text label "Visitado" inside the overlay', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    // The label only appears in aria-label/title attributes, never as a span body.
    expect(out).not.toMatch(/<span[^>]*>Visitado<\/span>/);
  });

  it('includes verified SVG when visited_verified_at is recent (mapPin)', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    // Two SVGs: check + verified.
    const svgCount = (out.match(/<svg /g) ?? []).length;
    expect(svgCount).toBe(2);
  });

  it('renders only the check SVG when no verification info', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    const svgCount = (out.match(/<svg /g) ?? []).length;
    expect(svgCount).toBe(1);
  });
});

describe('P-POPUP-7B — buildPersonalStateBlock with heroOverlayActive=true', () => {
  it('renders inline "Visitado" link (no pill, no background) and NO verified badge', () => {
    const out = buildPersonalStateBlock(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: true, heroOverlayActive: true },
    );
    // Inline marker present.
    expect(out).toContain('data-personal-visited-inline="true"');
    expect(out).toContain('background: none');
    // Verified badge (the small <span> with border + camera/mapPin) NOT present
    // when overlay is active — verified lives only in the hero overlay.
    expect(out).not.toMatch(/border: 1px solid hsl\(var\(--surface-border\)\); border-radius: 9999px/);
  });

  it('falls back to legacy pill + verified badge when heroOverlayActive=false', () => {
    const out = buildPersonalStateBlock(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: true, heroOverlayActive: false },
    );
    expect(out).not.toContain('data-personal-visited-inline="true"');
    // Legacy pill uses pill background (state-success tint).
    expect(out).toContain('hsl(var(--state-success) / 0.10)');
  });

  it('not-visited + heroOverlayActive=true keeps legacy pill "Marcar visitado"', () => {
    // Overlay is gated on isVisited; if not visited, heroOverlayActive should
    // be false at call sites, but the block must still degrade gracefully.
    const out = buildPersonalStateBlock(
      poi('a', {}),
      { isOwn: true, isCuratorPoint: false, canEditLocation: true, heroOverlayActive: true },
    );
    // Falls back to legacy pill since !isVisited.
    expect(out).not.toContain('data-personal-visited-inline="true"');
    expect(out).toContain('data-action="toggle-visited"');
  });
});
