/**
 * location-collections-store — Fuente única y SÍNCRONA para resolver
 * `locationId -> Array<{ id, name, color, icon }>`.
 *
 * Diseño:
 *  - Lectura síncrona vía `getCollectionsForLocation(id)`. Devuelve `[]` si aún
 *    no se hidrató — el caller decide si "vacío" significa "sin colección"
 *    porque siempre que un punto se vuelve visible se llama a
 *    `primeCollectionsForLocations` (carga batch perezosa).
 *  - Una sola subscripción global vía `subscribeLocationCollections(fn)`. El
 *    callback recibe el set de `locationId` afectado en cada cambio (o `null`
 *    si fue un refresh completo). El popup del mapa lo usa para regenerar su
 *    HTML mediante `setPopupContent` — sin React mount frágil dentro de Leaflet.
 *  - Se mantiene en sync con los eventos transversales existentes:
 *    `collections-updated` (cambios en colecciones del usuario) y
 *    `collection-items-changed` (añadidos/eliminados de items).
 *
 * Esta es la fuente única que TODOS los renders de chips de colección deben
 * consumir (popup del mapa por HTML, `useLocationCollections` para React).
 */
import { supabase } from '@/integrations/supabase/client';

export interface LocationCollectionChip {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

type Listener = (changed: Set<string> | null) => void;

const cache = new Map<string, LocationCollectionChip[]>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<Listener>();

function notify(changed: Set<string> | null) {
  listeners.forEach((l) => {
    try { l(changed); } catch { /* noop */ }
  });
}

async function loadBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { data, error } = await supabase
      .from('collection_items')
      .select('item_id, collection_id, collections!inner(id, name, color, icon)')
      .eq('item_type', 'place')
      .in('item_id', ids);
    if (error) throw error;

    const next = new Map<string, LocationCollectionChip[]>();
    ids.forEach((id) => next.set(id, []));
    (data ?? []).forEach((row: any) => {
      const itemId: string = row.item_id;
      const chip: LocationCollectionChip = {
        id: row.collections.id,
        name: row.collections.name,
        color: row.collections.color ?? null,
        icon: row.collections.icon ?? null,
      };
      const arr = next.get(itemId) ?? [];
      arr.push(chip);
      next.set(itemId, arr);
    });
    const changed = new Set<string>();
    next.forEach((chips, id) => {
      cache.set(id, chips);
      changed.add(id);
    });
    notify(changed);
  } catch {
    // En caso de error dejamos cache como estaba para no parpadear.
  }
}

/**
 * Lectura síncrona — devuelve la última snapshot conocida o `[]`.
 */
export function getCollectionsForLocation(
  locationId: string | null | undefined,
): LocationCollectionChip[] {
  if (!locationId) return [];
  return cache.get(locationId) ?? [];
}

/**
 * Precarga (batch) las colecciones de un conjunto de puntos. Idempotente:
 * los `locationId` ya hidratados se omiten salvo invalidación previa.
 */
export function primeCollectionsForLocations(ids: Array<string | null | undefined>): void {
  const pending = Array.from(new Set(ids.filter((x): x is string => !!x)))
    .filter((id) => !cache.has(id) && !inflight.has(id));
  if (pending.length === 0) return;
  const promise = loadBatch(pending).finally(() => {
    pending.forEach((id) => inflight.delete(id));
  });
  pending.forEach((id) => inflight.set(id, promise));
}

/**
 * Invalida la caché de uno o más puntos y dispara una recarga.
 */
export function invalidateCollectionsForLocation(
  locationId: string | string[] | null | undefined,
): void {
  if (!locationId) return;
  const ids = Array.isArray(locationId) ? locationId : [locationId];
  ids.forEach((id) => cache.delete(id));
  primeCollectionsForLocations(ids);
}

/**
 * Recarga completa: vacía la caché y notifica a los subscriptores.
 * Los puntos visibles deberán llamar de nuevo a `primeCollectionsForLocations`.
 */
export function invalidateAllCollections(): void {
  cache.clear();
  notify(null);
}

/**
 * Subscripción única. El callback recibe el set de `locationId` afectado o
 * `null` para un refresh completo.
 */
export function subscribeLocationCollections(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ─── Sync con event bus transversal ─────────────────────────────────────────
// Una sola vez por sesión: cuando cambian las colecciones del usuario o los
// items, invalidamos la caché para que los popups y vistas se regeneren.
if (typeof window !== 'undefined') {
  const w = window as any;
  if (!w.__locationCollectionsBound) {
    w.__locationCollectionsBound = true;
    const onCollectionsUpdated = () => invalidateAllCollections();
    const onItemsChanged = () => invalidateAllCollections();
    window.addEventListener('collections-updated', onCollectionsUpdated);
    window.addEventListener('collection-items-changed', onItemsChanged as EventListener);
  }
}
