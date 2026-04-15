import { supabase } from '@/integrations/supabase/client';
import type { Collection, CollectionItem } from '@/domains/v2';

function toCollection(row: any): Collection {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    icon: row.icon,
    color: row.color,
    visibility: row.visibility,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toCollectionItem(row: any): CollectionItem {
  return {
    id: row.id,
    collectionId: row.collection_id,
    itemType: row.item_type,
    itemId: row.item_id,
    position: row.position,
    addedAt: new Date(row.added_at),
  };
}

export const collectionRepository = {
  async findByUser(userId: string): Promise<Collection[]> {
    const { data, error } = await supabase.from('collections').select('*').eq('user_id', userId);
    if (error) throw error;
    return (data ?? []).map(toCollection);
  },

  async findById(id: string): Promise<Collection | null> {
    const { data, error } = await supabase.from('collections').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toCollection(data) : null;
  },

  async insert(collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection> {
    const { data, error } = await supabase.from('collections').insert({
      user_id: collection.userId,
      name: collection.name,
      description: collection.description ?? null,
      icon: collection.icon,
      color: collection.color,
      visibility: collection.visibility,
    }).select().single();
    if (error) throw error;
    return toCollection(data);
  },

  async update(id: string, updates: Partial<Pick<Collection, 'name' | 'description' | 'icon' | 'color' | 'visibility'>>): Promise<Collection> {
    const { data, error } = await supabase.from('collections').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return toCollection(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('collections').delete().eq('id', id);
    if (error) throw error;
  },

  // Items
  async getItems(collectionId: string): Promise<CollectionItem[]> {
    const { data, error } = await supabase.from('collection_items').select('*')
      .eq('collection_id', collectionId).order('position');
    if (error) throw error;
    return (data ?? []).map(toCollectionItem);
  },

  async addItem(collectionId: string, itemType: CollectionItem['itemType'], itemId: string, position?: number): Promise<CollectionItem> {
    const { data, error } = await supabase.from('collection_items').insert({
      collection_id: collectionId,
      item_type: itemType,
      item_id: itemId,
      position: position ?? 0,
    }).select().single();
    if (error) throw error;
    return toCollectionItem(data);
  },

  async removeItem(collectionId: string, itemType: CollectionItem['itemType'], itemId: string): Promise<void> {
    const { error } = await supabase.from('collection_items').delete()
      .eq('collection_id', collectionId)
      .eq('item_type', itemType)
      .eq('item_id', itemId);
    if (error) throw error;
  },
};
