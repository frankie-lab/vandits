/**
 * P-POPUP-7B (canon simplificado 2026-05-16) — Visited/Pendiente hero overlay.
 *
 * - Visible SIEMPRE que haya hero image y no sea curator/nearby.
 * - Etiqueta: "Visitado" (visited=true) o "Pendiente" (visited=false).
 * - data-action="toggle-visited" + data-visited-hero-overlay="true".
 * - Cuando overlay activo, `buildPersonalStateBlock` NO renderiza visited.
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

describe('P-POPUP-7B — isVisitedHeroOverlayActive (canon simplificado)', () => {
  it('true when hero exists even if not visited (renders Pendiente)', () => {
    expect(isVisitedHeroOverlayActive(poi('a', {}, { imagen: 'http://x/y.jpg' }), OWN_VIEWER)).toBe(true);
  });

  it('false when no hero image at all', () => {
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

  it('true with own user image (visibilidad privada permitida si isOwn)', () => {
    expect(isVisitedHeroOverlayActive(
      poi('a', { user_image_url: 'http://x/u.jpg' }),
      OWN_VIEWER,
    )).toBe(true);
  });

  it('legacy branch: enriched=null suprime AI image, sin user image → off', () => {
    expect(isVisitedHeroOverlayActive(
      poi('a', { visited: 'true' }, { imagen: 'http://x/y.jpg' }),
      OWN_VIEWER,
      null,
    )).toBe(false);
  });
});

describe('P-POPUP-7D — buildVisitedHeroOverlay (icon-only badge)', () => {
  it('returns empty when no hero (inactive)', () => {
    expect(buildVisitedHeroOverlay(poi('a'), OWN_VIEWER)).toBe('');
  });

  it('renders visited check icon-only (no label) when visited=true', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    expect(out).toContain('data-action="toggle-visited"');
    expect(out).toContain('data-visited-hero-overlay="true"');
    expect(out).toContain('data-visited-state="visited"');
    // Sin label visible
    expect(out).not.toContain('<span>Visitado</span>');
    expect(out).not.toContain('<span>Pendiente</span>');
    // Tooltip / a11y
    expect(out).toContain('aria-label="Visitado');
    expect(out).toContain('click para quitar');
    // Position + size 24x24
    expect(out).toContain('position: absolute');
    expect(out).toContain('width: 24px');
    expect(out).toContain('height: 24px');
    expect(out).toContain('z-index: 2');
    expect(out).toContain('pointer-events: auto');
    expect(out).toContain('popup-hero-visited-badge');
  });

  it('renders pending circle icon-only (no label) when visited=false', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', {}, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    expect(out).toContain('data-action="toggle-visited"');
    expect(out).toContain('data-visited-state="pending"');
    expect(out).not.toContain('<span>Pendiente</span>');
    expect(out).toContain('aria-label="Pendiente · click para marcar visitado"');
  });

  it('check SVG stroke usa un color resoluble (token o hex fallback)', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', { visited: 'true' }, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    expect(out).toMatch(/stroke="(hsl\(var\(--state-success\)\)|#16a34a)"/);
  });

  it('verified NO se renderiza visualmente en el badge icon-only (P-POPUP-7D)', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    // Sólo 1 SVG (check). Sin verified badge inyectado.
    const svgCount = (out.match(/<svg /g) ?? []).length;
    expect(svgCount).toBe(1);
    // Tooltip puede mencionar relevance pero sin renderizar icon adicional.
    expect(out).toContain('aria-label="Visitado');
  });

  it('pending tampoco renderiza verified aunque haya visited_verified_at', () => {
    const out = buildVisitedHeroOverlay(
      poi('a', { visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }),
      OWN_VIEWER,
    );
    const svgCount = (out.match(/<svg /g) ?? []).length;
    expect(svgCount).toBe(1);
    expect(out).toContain('data-visited-state="pending"');
  });
});

describe('P-POPUP-7B — buildPersonalStateBlock (canon simplificado)', () => {
  it('NO renderiza visited cuando heroOverlayActive=true (sólo rating)', () => {
    const out = buildPersonalStateBlock(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }, { imagen: 'http://x.jpg' }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: true, heroOverlayActive: true },
    );
    expect(out).not.toContain('data-action="toggle-visited"');
    expect(out).not.toContain('<span>Visitado</span>');
    expect(out).not.toContain('<span>Pendiente</span>');
  });

  it('cuando heroOverlayActive=false, renderiza pill "Visitado" si visited', () => {
    const out = buildPersonalStateBlock(
      poi('a', { visited: 'true' }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: true, heroOverlayActive: false },
    );
    expect(out).toContain('data-action="toggle-visited"');
    expect(out).toContain('hsl(var(--state-success) / 0.10)');
    expect(out).toContain('<span>Visitado</span>');
  });

  it('cuando heroOverlayActive=false y no visited, renderiza pill "Pendiente"', () => {
    const out = buildPersonalStateBlock(
      poi('a', {}),
      { isOwn: true, isCuratorPoint: false, canEditLocation: true, heroOverlayActive: false },
    );
    expect(out).toContain('data-action="toggle-visited"');
    expect(out).toContain('<span>Pendiente</span>');
  });
});
