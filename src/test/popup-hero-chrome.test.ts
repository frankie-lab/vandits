/**
 * P-POPUP-7C — Hero chrome reduction.
 *
 * - Hero container tiene class `popup-hero` (hook CSS para reveal-on-hover).
 * - Controles foto (upload/delete) van dentro de `.popup-hero-controls`.
 * - Handlers `data-action="upload-photo"` y `data-action="delete-photo"`
 *   se preservan EXACTAMENTE (no se tocan).
 * - Overlay Visitado/Pendiente sigue presente y clicable.
 */
import { describe, it, expect, vi } from 'vitest';
import type { GeoLocation } from '@/types/location';

vi.mock('@/domains/content/lib/nearby-popup-context', () => ({
  isNearbyPopupContext: () => false,
}));

vi.mock('@/domains/content/lib/personal-tags-filter', () => ({
  filterPersonalTags: (_id: string, tags: string[] | undefined) => tags ?? [],
}));

import { buildImageSection } from '@/components/map/map-popups';

function poi(id: string, customData: Record<string, string> = {}, enrichedData: any = null): GeoLocation {
  return {
    id,
    name: id,
    coordinates: { lat: 0, lng: 0 },
    customData,
    enrichedData,
  } as unknown as GeoLocation;
}

const OWN = { isOwn: true, isFollowing: false } as any;

describe('P-POPUP-7C — buildImageSection hero chrome', () => {
  it('wraps hero container with class "popup-hero"', () => {
    const out = buildImageSection(
      poi('a', { user_image_url: 'http://x/u.jpg' }),
      null,
      OWN,
    );
    expect(out).toContain('class="popup-hero"');
  });

  it('wraps photo controls with class "popup-hero-controls" (own + user image)', () => {
    const out = buildImageSection(
      poi('a', { user_image_url: 'http://x/u.jpg' }),
      null,
      OWN,
    );
    expect(out).toContain('class="popup-hero-controls"');
    expect(out).toContain('data-action="delete-photo"');
    expect(out).toContain('data-action="upload-photo"');
  });

  it('wraps photo controls with class "popup-hero-controls" (own, AI image, no user image)', () => {
    const out = buildImageSection(
      poi('a', {}, { imagen: 'http://x/y.jpg' }),
      { imagen: 'http://x/y.jpg' },
      OWN,
    );
    expect(out).toContain('class="popup-hero-controls"');
    expect(out).toContain('data-action="upload-photo"');
    // sin user image → no delete-photo
    expect(out).not.toContain('data-action="delete-photo"');
  });

  it('does NOT add hero-controls for non-own viewers', () => {
    const out = buildImageSection(
      poi('a', {}, { imagen: 'http://x/y.jpg' }),
      { imagen: 'http://x/y.jpg' },
      { isOwn: false } as any,
    );
    expect(out).not.toContain('popup-hero-controls');
    expect(out).not.toContain('data-action="upload-photo"');
  });

  it('overlay Visitado/Pendiente sigue inyectado en el hero', () => {
    const out = buildImageSection(
      poi('a', { visited: 'true' }, { imagen: 'http://x/y.jpg' }),
      { imagen: 'http://x/y.jpg' },
      OWN,
    );
    expect(out).toContain('data-visited-hero-overlay="true"');
    expect(out).toContain('data-action="toggle-visited"');
  });
});
