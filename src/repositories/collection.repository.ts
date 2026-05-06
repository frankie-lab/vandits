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
    inCatalog: row.in_catalog === true,
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
      in_catalog: collection.inCatalog,
    } as any).select().single();
    if (error) throw error;
    return toCollection(data);
  },

  async update(id: string, updates: Partial<Pick<Collection, 'name' | 'description' | 'icon' | 'color' | 'visibility' | 'inCatalog'>>): Promise<Collection> {
    const dbUpdates: any = { ...updates };
    if ('inCatalog' in dbUpdates) {
      dbUpdates.in_catalog = dbUpdates.inCatalog;
      delete dbUpdates.inCatalog;
    }
    const { data, error } = await supabase.from('collections').update(dbUpdates).eq('id', id).select().single();
    if (error) throw error;
    return toCollection(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('collections').delete().eq('id', id);
    if (error) throw error;
  },

  // Items
  /** Bulk counts: returns Map<collectionId, { total }>. Exact count per collection. */
  async getItemCountsByCollection(collectionIds: string[]): Promise<Map<string, { total: number }>> {
    const result = new Map<string, { total: number }>();
    if (collectionIds.length === 0) return result;

    const counts = await Promise.all(collectionIds.map(async (collectionId) => {
      const { count, error } = await supabase
        .from('collection_items')
        .select('id', { count: 'exact', head: true })
        .eq('collection_id', collectionId);

      if (error) throw error;
      return [collectionId, { total: count ?? 0 }] as const;
    }));

    for (const [collectionId, value] of counts) {
      result.set(collectionId, value);
    }

    return result;
  },

  async getItems(collectionId: string): Promise<CollectionItem[]> {
    // Paginate to bypass the 1000-row PostgREST cap so collections with many
    // items load completely (counts and expanded list must agree).
    const PAGE = 1000;
    const all: any[] = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.from('collection_items').select('*')
        .eq('collection_id', collectionId)
        .order('position')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data ?? [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return all.map(toCollectionItem);
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
