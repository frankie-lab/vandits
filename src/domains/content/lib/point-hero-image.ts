/**
 * point-hero-image — single source of truth for the hero image URL of a POI.
 *
 * Mirrors EXACTLY the popup rule (`map-popups.ts` lines ~290-300):
 *
 *   userImage = customData.user_image_url
 *   aiImage   = enrichedData.imagen
 *   visibility = customData.user_image_visibility ('private' | 'followers' | 'public')
 *
 *   canSeeUserImage =
 *     userImage AND (
 *       ownership.isOwn ||
 *       visibility === 'public' ||
 *       (visibility === 'followers' && ownership.isFollowing)
 *     )
 *
 *   hero = canSeeUserImage ? userImage : aiImage
 *
 * If `ownership` is not provided we fall back to the safest viewer model
 * (anonymous third party): only `public` user images are considered, otherwise
 * we use the enriched image. This keeps the marker thumb and hover tooltip
 * aligned with whatever the popup will end up rendering.
 *
 * Used by:
 *  - map-tooltip.ts (hover preview in standard/rich)
 *  - map-icons.ts   (rich-mode marker thumb at z≥17)
 */
import type { GeoLocation } from '@/types/location';

export interface HeroOwnership {
  isOwn?: boolean;
  isFollowing?: boolean;
}

export function getPointHeroImage(
  loc?: GeoLocation | null,
  ownership?: HeroOwnership | null,
): string | null {
  if (!loc) return null;

  const userImage = ((loc.customData?.user_image_url as string | undefined) || '').trim();
  const aiImage   = ((loc.enrichedData?.imagen as string | undefined) || '').trim();
  const visibility = (loc.customData?.user_image_visibility as string | undefined) || 'private';

  const canSeeUserImage = !!userImage && (
    !!ownership?.isOwn ||
    visibility === 'public' ||
    (visibility === 'followers' && !!ownership?.isFollowing)
  );

  const url = canSeeUserImage ? userImage : aiImage;
  return url || null;
}
