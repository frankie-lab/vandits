/**
 * map-tooltip — single helper to build the hover tooltip HTML for a map marker.
 *
 * Visibility of the hero image is gated by CSS via classes on the map container
 * (`map-zoom-standard`, `map-zoom-rich`). The same tooltip works at every zoom;
 * CSS hides/shows the <img>.
 */
import type { GeoLocation } from '@/types/location';
import { getPointHeroImage } from '@/domains/content/lib/point-hero-image';

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildHoverTooltipHtml(loc: GeoLocation): string {
  const name = escapeText(loc.name ?? '');
  const hero = getPointHeroImage(loc);
  const img = hero
    ? `<img class="poi-hover-tooltip__img" src="${escapeAttr(hero)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
    : '';
  return `<div class="poi-hover-tooltip">${img}<div class="poi-hover-tooltip__name">${name}</div></div>`;
}
