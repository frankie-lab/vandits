/**
 * useCollections — Hook centralizado para gestionar colecciones del usuario actual.
 * Domain: Content. Reusa collectionService (repositorio v2).
 * Emite el evento global `collections-updated` tras cualquier mutación,
 * para mantener la regla de sync vía event bus (no full reloads).
 */
import { useCallback, useEffect, useState } from 'react';
import { collectionService } from '@/services/collection.service';
import { useAuth } from '@/domains/identity';
import type { Collection } from '@/domains/v2';

export const COLLECTIONS_UPDATED_EVENT = 'collections-updated';

export function useCollections() {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setCollections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await collectionService.findByUser(user.id);
      list.sort((a, b) => a.name.localeCompare(b.name));
      setCollections(list);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const handler = () => reload();
    window.addEventListener(COLLECTIONS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(COLLECTIONS_UPDATED_EVENT, handler);
  }, [reload]);

  const notify = () => window.dispatchEvent(new CustomEvent(COLLECTIONS_UPDATED_EVENT));

  const create = useCallback(async (input: { name: string; description?: string; icon?: string; color?: string; visibility?: string }) => {
    if (!user?.id) throw new Error('Not authenticated');
    const created = await collectionService.create({
      userId: user.id,
      name: input.name,
      description: input.description,
      icon: input.icon ?? 'folder',
      color: input.color ?? '#6b7280',
      visibility: (input.visibility as any) ?? 'private',
    } as any);
    notify();
    return created;
  }, [user?.id]);

  const update = useCallback(async (id: string, updates: Partial<Pick<Collection, 'name' | 'description' | 'icon' | 'color' | 'visibility'>>) => {
    const updated = await collectionService.update(id, updates as any);
    notify();
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await collectionService.delete(id);
    notify();
  }, []);

  return { collections, loading, reload, create, update, remove };
}
