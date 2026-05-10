/**
 * useLocationCollections — Devuelve las colecciones (con name/color/icon) que
 * contienen un location concreto. Se mantiene en sync con el evento global
 * `collections-updated` y `collection-items-changed`.
 *
 * Fuente única para mostrar "hashtags" de colecciones en cualquier ficha
 * (GalleryView, popup, listas de admin).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COLLECTIONS_UPDATED_EVENT } from './use-collections';

export interface LocationCollectionChip {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export function useLocationCollections(locationId: string | null | undefined) {
  const [items, setItems] = useState<LocationCollectionChip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId) { setItems([]); return; }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('collection_items')
          .select('collection_id, collections!inner(id, name, color, icon)')
          .eq('item_type', 'location')
          .eq('item_id', locationId);
        if (error) throw error;
        if (cancelled) return;
        const chips: LocationCollectionChip[] = (data ?? []).map((row: any) => ({
          id: row.collections.id,
          name: row.collections.name,
          color: row.collections.color ?? null,
          icon: row.collections.icon ?? null,
        }));
        setItems(chips);
      } catch (e) {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener(COLLECTIONS_UPDATED_EVENT, handler);
    window.addEventListener('collection-items-changed', handler as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(COLLECTIONS_UPDATED_EVENT, handler);
      window.removeEventListener('collection-items-changed', handler as EventListener);
    };
  }, [locationId]);

  return { collections: items, loading };
}
