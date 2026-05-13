/**
 * owner-stroke — Owner identity color helpers (PR-OWNER-IDENTITY-2).
 *
 * Module name kept for backwards-compat with existing imports. Internally
 * delegates to the OKLCH identity allocator. The v1 "stroke = identity"
 * grammar is dead: followed POIs now use `fill = identity` (no stroke).
 *
 * Contract:
 *  - `getOwnerIdentityColor(uid, oklch?)` returns a CSS color string.
 *      • If `oklch` is provided (persisted assignment) → render that.
 *      • Else → deterministic fallback from SEED_PALETTE by hash(uid).
 *  - The renderer ONLY reads. Writes happen in the identity store from
 *    UsersSidebar / follow-accept flows.
 *
 * See mem://style/map/followed-poi-grammar
 *     mem://logic/identity/owner-color-allocator
 */

import { OklchColor, oklchToCss } from '@/lib/color/oklch';
import { SEED_PALETTE, OWNER_PALETTE_VERSION } from '@/lib/color/identity-allocator';

export { OWNER_PALETTE_VERSION };
export type { OklchColor };

function hashUid(uid: string): number {
  let h = 5381;
  for (let i = 0; i < uid.length; i++) h = ((h << 5) + h + uid.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic fallback when no persisted assignment exists yet. */
export function getOwnerFallbackColor(ownerUid: string | null | undefined): OklchColor {
  if (!ownerUid) return SEED_PALETTE[0];
  return SEED_PALETTE[hashUid(ownerUid) % SEED_PALETTE.length];
}

/**
 * Resolve the CSS color for an owner identity.
 *
 * @param ownerUid  followed user uid (used only by fallback)
 * @param oklch     persisted OKLCH if available
 */
export function getOwnerIdentityColor(
  ownerUid: string | null | undefined,
  oklch: OklchColor | null | undefined,
): string {
  if (oklch && Number.isFinite(oklch.L) && Number.isFinite(oklch.C) && Number.isFinite(oklch.h)) {
    return oklchToCss(oklch);
  }
  return oklchToCss(getOwnerFallbackColor(ownerUid));
}

/** For tests / inspection. */
export const _SEED_PALETTE_FOR_TEST: ReadonlyArray<OklchColor> = SEED_PALETTE;
