/**
 * point-hero-image — single source of truth for the hero image URL of a POI.
 *
 * Used by:
 *  - map-icons.ts (focused/selected thumb + rich-mode marker)
 *  - map-tooltip.ts (hover preview in standard/rich)
 *
 * Priority: enrichedData.imagen (public, AI/Wikipedia) → customData.user_image_url
 * (user-owned, RLS already governs delivery). Returns null when no hero exists.
 */
import type { GeoLocation } from '@/types/location';

export function getPointHeroImage(loc?: GeoLocation | null): string | null {
  if (!loc) return null;
  const a = loc.enrichedData?.imagen as string | undefined;
  const b = loc.customData?.user_image_url as string | undefined;
  const url = (a || b || '').trim();
  return url || null;
}
