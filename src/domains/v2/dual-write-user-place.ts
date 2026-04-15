/**
 * V2 Dual-Write Bridge for User-Place Actions
 * 
 * Wraps the V2 user-place service with flag-aware dual-write logic.
 * When v2_data_write_user_places is active, visited/favorite actions
 * write to both legacy (locations.custom_data) and V2 (user_places) tables.
 * 
 * Usage: call from popup actions after legacy write succeeds.
 */

import { userPlaceService } from '@/services/user-place.service';
import { getV2Flags } from '@/hooks/use-v2-flags';
import type { VisitStatus } from '@/domains/v2';

/**
 * After toggling visited in legacy, optionally mirror to V2 user_places.
 */
export async function dualWriteVisited(params: {
  userId: string;
  placeId: string;
  visited: boolean;
}): Promise<void> {
  const flags = await getV2Flags();
  if (!flags.v2DataWriteUserPlaces) return;

  try {
    // Ensure user_place record exists
    await userPlaceService.getOrCreate(params.userId, params.placeId);

    // Set visit status
    const status: VisitStatus = params.visited ? 'visited' : 'not_visited';
    await userPlaceService.setVisitStatus(params.userId, params.placeId, status);

    console.log('[V2 DualWrite] Visited status mirrored to user_places');
  } catch (error) {
    console.error('[V2 DualWrite] Visited mirror failed:', error);
  }
}

/**
 * After toggling favorite in legacy, optionally mirror to V2 user_places.
 */
export async function dualWriteFavorite(params: {
  userId: string;
  placeId: string;
}): Promise<void> {
  const flags = await getV2Flags();
  if (!flags.v2DataWriteUserPlaces) return;

  try {
    await userPlaceService.toggleFavorite(params.userId, params.placeId);
    console.log('[V2 DualWrite] Favorite toggled in user_places');
  } catch (error) {
    console.error('[V2 DualWrite] Favorite mirror failed:', error);
  }
}

/**
 * After rating in legacy, optionally mirror to V2 user_places.
 */
export async function dualWriteRating(params: {
  userId: string;
  placeId: string;
  rating: number;
}): Promise<void> {
  const flags = await getV2Flags();
  if (!flags.v2DataWriteUserPlaces) return;

  try {
    await userPlaceService.getOrCreate(params.userId, params.placeId);
    await userPlaceService.rate(params.userId, params.placeId, params.rating);
    console.log('[V2 DualWrite] Rating mirrored to user_places');
  } catch (error) {
    console.error('[V2 DualWrite] Rating mirror failed:', error);
  }
}

/**
 * After adopting a location in legacy, optionally mirror to V2 user_places.
 */
export async function dualWriteAdopt(params: {
  userId: string;
  placeId: string;
  fromUserId: string;
  sourceDocumentId?: string;
}): Promise<void> {
  const flags = await getV2Flags();
  if (!flags.v2DataWriteUserPlaces) return;

  try {
    await userPlaceService.adopt(
      params.userId,
      params.placeId,
      params.fromUserId,
      params.sourceDocumentId,
    );
    console.log('[V2 DualWrite] Adoption mirrored to user_places');
  } catch (error) {
    console.error('[V2 DualWrite] Adoption mirror failed:', error);
  }
}
