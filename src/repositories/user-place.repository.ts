import { supabase } from '@/integrations/supabase/client';
import type { UserPlace } from '@/domains/v2';

const TABLE = 'user_places' as const;

function toUserPlace(row: any): UserPlace {
  return {
    id: row.id,
    userId: row.user_id,
    placeId: row.place_id,
    visitStatus: row.visit_status,
    isSaved: row.is_saved,
    isFavorite: row.is_favorite,
    rating: row.rating ?? undefined,
    visibility: row.visibility,
    isArchived: row.is_archived,
    origin: row.origin,
    savedFromUserId: row.saved_from_user_id ?? undefined,
    sourceDocumentId: row.source_document_id ?? undefined,
    visitedAt: row.visited_at ? new Date(row.visited_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const userPlaceRepository = {
  async findByUser(userId: string): Promise<UserPlace[]> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId);
    if (error) throw error;
    return (data ?? []).map(toUserPlace);
  },

  async findByUserAndPlace(userId: string, placeId: string): Promise<UserPlace | null> {
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('user_id', userId).eq('place_id', placeId).maybeSingle();
    if (error) throw error;
    return data ? toUserPlace(data) : null;
  },

  async findFavorites(userId: string): Promise<UserPlace[]> {
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('user_id', userId).eq('is_favorite', true);
    if (error) throw error;
    return (data ?? []).map(toUserPlace);
  },

  async findByVisitStatus(userId: string, status: UserPlace['visitStatus']): Promise<UserPlace[]> {
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('user_id', userId).eq('visit_status', status);
    if (error) throw error;
    return (data ?? []).map(toUserPlace);
  },

  async upsert(userPlace: Omit<UserPlace, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserPlace> {
    const { data, error } = await supabase.from(TABLE).upsert({
      user_id: userPlace.userId,
      place_id: userPlace.placeId,
      visit_status: userPlace.visitStatus,
      is_saved: userPlace.isSaved,
      is_favorite: userPlace.isFavorite,
      rating: userPlace.rating ?? null,
      visibility: userPlace.visibility,
      is_archived: userPlace.isArchived,
      origin: userPlace.origin,
      saved_from_user_id: userPlace.savedFromUserId ?? null,
      source_document_id: userPlace.sourceDocumentId ?? null,
      visited_at: userPlace.visitedAt?.toISOString() ?? null,
    }, { onConflict: 'user_id,place_id' }).select().single();
    if (error) throw error;
    return toUserPlace(data);
  },

  async updateStatus(userId: string, placeId: string, updates: Partial<Pick<UserPlace, 'visitStatus' | 'isSaved' | 'isFavorite' | 'rating' | 'visitedAt'>>): Promise<UserPlace> {
    const row: Record<string, any> = {};
    if (updates.visitStatus !== undefined) row.visit_status = updates.visitStatus;
    if (updates.isSaved !== undefined) row.is_saved = updates.isSaved;
    if (updates.isFavorite !== undefined) row.is_favorite = updates.isFavorite;
    if (updates.rating !== undefined) row.rating = updates.rating;
    if (updates.visitedAt !== undefined) row.visited_at = updates.visitedAt?.toISOString() ?? null;

    const { data, error } = await supabase.from(TABLE).update(row)
      .eq('user_id', userId).eq('place_id', placeId).select().single();
    if (error) throw error;
    return toUserPlace(data);
  },

  async archive(userId: string, placeId: string): Promise<void> {
    const { error } = await supabase.from(TABLE).update({ is_archived: true })
      .eq('user_id', userId).eq('place_id', placeId);
    if (error) throw error;
  },

  async delete(userId: string, placeId: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete()
      .eq('user_id', userId).eq('place_id', placeId);
    if (error) throw error;
  },
};
