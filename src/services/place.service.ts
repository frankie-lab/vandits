import { placeRepository } from '@/repositories/place.repository';
import { placeMergeRepository } from '@/repositories/place-merge.repository';
import { waypointRepository } from '@/repositories/waypoint.repository';
import { userPlaceRepository } from '@/repositories/user-place.repository';
import type { Place } from '@/domains/v2';

/**
 * Place service — CRUD + canonicalization logic for canonical places.
 */
export const placeService = {
  findById: placeRepository.findById,
  findByIds: placeRepository.findByIds,
  findByCreator: placeRepository.findByCreator,

  async create(place: Omit<Place, 'id' | 'createdAt' | 'updatedAt'>): Promise<Place> {
    return placeRepository.insert(place);
  },

  async update(id: string, updates: Parameters<typeof placeRepository.update>[1]): Promise<Place> {
    return placeRepository.update(id, updates);
  },

  /**
   * Merge source place into target place:
   * 1. Reassign all waypoints pointing to source → target
   * 2. Reassign all user_places from source → target (skip if already exists)
   * 3. Record merge in history
   * 4. Delete source place
   */
  async mergePlaces(sourcePlaceId: string, targetPlaceId: string, mergedBy?: string, reason?: string): Promise<void> {
    // Get waypoints linked to source
    // Note: we can't query waypoints by place_id directly via the repository
    // since it filters by document. We'll use supabase directly here.
    const { supabase } = await import('@/integrations/supabase/client');

    // Reassign waypoints
    await supabase.from('waypoints')
      .update({ place_id: targetPlaceId })
      .eq('place_id', sourcePlaceId);

    // Reassign user_places (delete conflicts on unique constraint)
    const { data: sourceUserPlaces } = await supabase.from('user_places')
      .select('user_id')
      .eq('place_id', sourcePlaceId);

    if (sourceUserPlaces?.length) {
      for (const up of sourceUserPlaces) {
        // Check if target already exists for this user
        const existing = await userPlaceRepository.findByUserAndPlace(up.user_id, targetPlaceId);
        if (existing) {
          // Delete the source one (target wins)
          await userPlaceRepository.delete(up.user_id, sourcePlaceId);
        } else {
          // Move to target
          await supabase.from('user_places')
            .update({ place_id: targetPlaceId })
            .eq('user_id', up.user_id)
            .eq('place_id', sourcePlaceId);
        }
      }
    }

    // Record merge
    await placeMergeRepository.record(sourcePlaceId, targetPlaceId, mergedBy, reason);

    // Delete source
    await placeRepository.delete(sourcePlaceId);
  },

  /**
   * Find candidate duplicates near a given place (within radiusDeg).
   * Used for continuous canonicalization.
   */
  async findDuplicateCandidates(lat: number, lng: number, radiusDeg: number = 0.0025): Promise<Place[]> {
    return placeRepository.findNearby(lat, lng, radiusDeg);
  },
};
