import { collectionRepository } from '@/repositories/collection.repository';
import type { Collection, CollectionItem, CollectionItemType } from '@/domains/v2';

/**
 * Collection service — manages user collections with polymorphic items.
 * Validates item_type/item_id integrity at service level (no DB FK for polymorphic).
 */

const VALID_ITEM_TYPES: CollectionItemType[] = ['place', 'waypoint', 'route'];

export const collectionService = {
  findByUser: collectionRepository.findByUser,
  findById: collectionRepository.findById,

  async create(collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection> {
    return collectionRepository.insert(collection);
  },

  async update(id: string, updates: Parameters<typeof collectionRepository.update>[1]): Promise<Collection> {
    return collectionRepository.update(id, updates);
  },

  async delete(id: string): Promise<void> {
    return collectionRepository.delete(id);
  },

  async getItems(collectionId: string): Promise<CollectionItem[]> {
    return collectionRepository.getItems(collectionId);
  },

  async addItem(collectionId: string, itemType: CollectionItemType, itemId: string, position?: number): Promise<CollectionItem> {
    if (!VALID_ITEM_TYPES.includes(itemType)) {
      throw new Error(`Invalid item_type: ${itemType}`);
    }
    if (!itemId || typeof itemId !== 'string') {
      throw new Error('item_id is required');
    }
    return collectionRepository.addItem(collectionId, itemType, itemId, position);
  },

  async removeItem(collectionId: string, itemType: CollectionItemType, itemId: string): Promise<void> {
    return collectionRepository.removeItem(collectionId, itemType, itemId);
  },
};
