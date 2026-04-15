import { userPlaceRepository } from '@/repositories/user-place.repository';
import type { UserPlace, VisitStatus } from '@/domains/v2';

/**
 * UserPlace service — manages the relationship between users and canonical places.
 */
export const userPlaceService = {
  findByUser: userPlaceRepository.findByUser,
  findFavorites: userPlaceRepository.findFavorites,

  async getOrCreate(userId: string, placeId: string, origin: UserPlace['origin'] = 'manual'): Promise<UserPlace> {
    const existing = await userPlaceRepository.findByUserAndPlace(userId, placeId);
    if (existing) return existing;

    return userPlaceRepository.upsert({
      userId,
      placeId,
      visitStatus: 'not_visited',
      isSaved: true,
      isFavorite: false,
      visibility: 'followers',
      isArchived: false,
      origin,
    });
  },

  async markVisited(userId: string, placeId: string): Promise<UserPlace> {
    return userPlaceRepository.updateStatus(userId, placeId, {
      visitStatus: 'visited',
      visitedAt: new Date(),
    });
  },

  async toggleFavorite(userId: string, placeId: string): Promise<UserPlace> {
    const existing = await userPlaceRepository.findByUserAndPlace(userId, placeId);
    const current = existing?.isFavorite ?? false;
    return userPlaceRepository.updateStatus(userId, placeId, {
      isFavorite: !current,
    });
  },

  async setVisitStatus(userId: string, placeId: string, status: VisitStatus): Promise<UserPlace> {
    return userPlaceRepository.updateStatus(userId, placeId, { visitStatus: status });
  },

  async rate(userId: string, placeId: string, rating: number): Promise<UserPlace> {
    return userPlaceRepository.updateStatus(userId, placeId, { rating });
  },

  async adopt(userId: string, placeId: string, fromUserId: string, sourceDocumentId?: string): Promise<UserPlace> {
    return userPlaceRepository.upsert({
      userId,
      placeId,
      visitStatus: 'not_visited',
      isSaved: true,
      isFavorite: false,
      visibility: 'followers',
      isArchived: false,
      origin: 'adopted',
      savedFromUserId: fromUserId,
      sourceDocumentId,
    });
  },

  archive: userPlaceRepository.archive,
  delete: userPlaceRepository.delete,
};
