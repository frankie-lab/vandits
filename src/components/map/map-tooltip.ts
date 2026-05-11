/**
 * map-tooltip — single helper to build the hover tooltip HTML for a map marker.
 *
 * Hero image source is decided by `getPointHeroImage(loc, ownership)`, which
 * mirrors the popup visibility rule. Visibility of the hero image inside the
 * tooltip is gated by CSS classes on the map container
 * (`map-zoom-standard`, `map-zoom-rich`). The same tooltip works at every
 * zoom; CSS hides/shows the <img>.
 */
import type { GeoLocation } from '@/types/location';
import { getPointHeroImage, type HeroOwnership } from '@/domains/content/lib/point-hero-image';

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildHoverTooltipHtml(
  loc: GeoLocation,
  ownership?: HeroOwnership | null,
): string {
  const name = escapeText(loc.name ?? '');
  const hero = getPointHeroImage(loc, ownership);
  const img = hero
    ? `<img class="poi-hover-tooltip__img" src="${escapeAttr(hero)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
    : '';
  return `<div class="poi-hover-tooltip">${img}<div class="poi-hover-tooltip__name">${name}</div></div>`;
}
