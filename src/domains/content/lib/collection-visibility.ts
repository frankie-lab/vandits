/**
 * collection-visibility — Helper transversal de visibilidad de colecciones.
 *
 * Reglas finales (mem://logic/collections/visibility-and-styling):
 *
 *  - Cada colección tiene `inCatalog` (DB).
 *  - Por sesión (login): colecciones CATÁLOGO inician VISIBLES; colecciones
 *    PRIVADAS (inCatalog=false) inician OCULTAS. El ojo invierte SOLO en sesión
 *    y persiste hasta logout / cierre de pestaña.
 *  - Un punto APROBADO se muestra en el mapa global si:
 *      · No pertenece a ninguna colección catálogo → siempre visible.
 *      · Pertenece a ≥1 colección catálogo → visible solo si AL MENOS UNA está
 *        visible en sesión.
 *  - Un punto NO aprobado se fuerza visible si pertenece a alguna colección
 *    PRIVADA (`inCatalog=false`) visible en sesión.
 *  - Color del marcador (anillo): el de la primera colección visible miembro.
 *  - El centro del marcador NUNCA cambia (paleta de estado). Solo el anillo.
 */
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';
import { startLoading, endLoading } from '@/shared/loading';
import { supabase } from '@/integrations/supabase/client';

export const COLLECTION_VISIBILITY_EVENT = 'collection-visibility-changed';
export const COLLECTION_FIT_BOUNDS_EVENT = 'collection-fit-bounds-request';

export interface CollectionVisibilityEntry {
  color: string;
  icon: string;
  inCatalog: boolean;
  locationIds: string[];
  routeIds: string[];
}

export interface CollectionVisibilityState {
  /** id colección -> entry (las VISIBLES en sesión). */
  visible: Record<string, CollectionVisibilityEntry>;
}

const state: CollectionVisibilityState = { visible: {} };

/** Universo de colecciones CATÁLOGO del usuario (visibles o no), para saber si
 *  un punto es "miembro de alguna colección catálogo". Cargado en init y
 *  actualizado en `collection-items-changed`. */
const catalogMembership: Map<string /* locationId */, Set<string /* collectionId */>> = new Map();
let initialized = false;
let currentUserId: string | null = null;

function broadcast() {
  window.dispatchEvent(new CustomEvent(COLLECTION_VISIBILITY_EVENT, {
    detail: { visible: { ...state.visible } },
  }));
}

async function loadEntry(collection: Collection): Promise<CollectionVisibilityEntry> {
  const items = await collectionService.getItems(collection.id);
  return {
    color: collection.color || '#6b7280',
    icon: collection.icon || 'folder',
    inCatalog: collection.inCatalog === true,
    locationIds: items
      .filter(i => i.itemType === 'place' || i.itemType === 'waypoint')
      .map(i => i.itemId),
    routeIds: items.filter(i => i.itemType === 'route').map(i => i.itemId),
  };
}

async function rebuildCatalogMembership(userId: string) {
  catalogMembership.clear();
  try {
    const all = await collectionService.findByUser(userId);
    const catalog = all.filter(c => c.inCatalog === true);
    const itemsList = await Promise.all(
      catalog.map(async c => ({ id: c.id, items: await collectionService.getItems(c.id) }))
    );
    for (const { id, items } of itemsList) {
      for (const it of items) {
        if (it.itemType !== 'place' && it.itemType !== 'waypoint') continue;
        let set = catalogMembership.get(it.itemId);
        if (!set) { set = new Set(); catalogMembership.set(it.itemId, set); }
        set.add(id);
      }
    }
  } catch (e) {
    console.warn('[collection-visibility] membership rebuild failed', e);
  }
}

/** Persistencia por sesión (sessionStorage): sobrevive a refresh,
 *  muere al cerrar pestaña o logout. Cada login fresco arranca con todas visibles. */
const STORAGE_PREFIX = 'vandits.collection-visibility.v1.';
const storageKey = (uid: string) => `${STORAGE_PREFIX}${uid}`;

function loadVisibleIdsFromStorage(userId: string): Set<string> | null {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : null;
  } catch { return null; }
}

function persistVisibleIds() {
  if (!currentUserId) return;
  try {
    sessionStorage.setItem(storageKey(currentUserId), JSON.stringify(Object.keys(state.visible)));
  } catch { /* quota / private mode — ignore */ }
}

/** Initialize per-session: hidrata desde sessionStorage si existe; en primer login
 *  todas inician visibles. Idempotente — pero re-broadcastea siempre, para que
 *  consumidores recién montados (al re-abrir un panel, cambio de sub-tab, etc.)
 *  reciban el estado actual sin esperar a una mutación. */
export async function initSessionCollectionVisibility(userId: string): Promise<void> {
  if (initialized && currentUserId === userId) {
    // Si por cualquier razón el state in-memory se vació pero hay persistido,
    // rehidrata sincrónicamente con placeholders mínimos antes de re-broadcast.
    if (Object.keys(state.visible).length === 0) {
      const persisted = loadVisibleIdsFromStorage(userId);
      if (persisted && persisted.size > 0) {
        for (const id of persisted) {
          state.visible[id] = state.visible[id] ?? {
            color: '#6b7280', icon: 'folder', inCatalog: false,
            locationIds: [], routeIds: [],
          };
        }
        // Refresh real entries en background.
        collectionService.findByUser(userId).then(async all => {
          const subset = all.filter(c => persisted.has(c.id));
          const entries = await Promise.all(subset.map(loadEntry));
          subset.forEach((c, i) => { state.visible[c.id] = entries[i]; });
          broadcast();
        }).catch(() => {});
      }
    }
    broadcast();
    return;
  }
  initialized = true;
  currentUserId = userId;
  startLoading('collections-init', 'Cargando colecciones');
  try {
    const all = await collectionService.findByUser(userId);
    const entries = await Promise.all(all.map(loadEntry));

    const persisted = loadVisibleIdsFromStorage(userId);
    all.forEach((c, i) => {
      // Con persistencia → respetar set guardado.
      // Sin persistencia (primer login de la sesión) → solo colecciones de catálogo
      // visibles por defecto; las privadas (inCatalog=false) inician ocultas.
      const shouldBeVisible = persisted ? persisted.has(c.id) : c.inCatalog === true;
      if (shouldBeVisible) {
        state.visible[c.id] = entries[i];
      }
    });

    // Construir el índice de membresía catálogo (universo completo).
    for (let i = 0; i < all.length; i++) {
      if (all[i].inCatalog !== true) continue;
      for (const lid of entries[i].locationIds) {
        let set = catalogMembership.get(lid);
        if (!set) { set = new Set(); catalogMembership.set(lid, set); }
        set.add(all[i].id);
      }
    }

    if (!persisted) persistVisibleIds();
    broadcast();
  } catch (e) {
    console.warn('[collection-visibility] init failed', e);
  } finally {
    endLoading('collections-init');
  }

  // Mantener membresía catálogo al día tras add/remove de items.
  if (typeof window !== 'undefined') {
    const handler = async (e: Event) => {
      if (!currentUserId) return;
      const detail = (e as CustomEvent).detail || {};
      const cid: string | undefined = detail.collectionId;
      // Refresh visible entry's locationIds (membership snapshot) si está visible.
      if (cid && state.visible[cid]) {
        try {
          const all = await collectionService.findByUser(currentUserId);
          const c = all.find(x => x.id === cid);
          if (c) state.visible[cid] = await loadEntry(c);
        } catch { /* ignore */ }
      }
      await rebuildCatalogMembership(currentUserId);
      broadcast();
      // Si la colección mutada está visible, pide refit del mapa.
      if (cid && state.visible[cid]) {
        requestCollectionFit(cid, 'if-outside');
      }
    };
    window.removeEventListener('collection-items-changed', handler as EventListener);
    window.addEventListener('collection-items-changed', handler as EventListener);

    // Refrescar metadata (color/icon/inCatalog) tras editar apariencia de
    // cualquier colección. Evita que el cache mantenga el color viejo y los
    // marcadores no reflejen el cambio hasta cerrar sesión.
    const metaHandler = async () => {
      if (!currentUserId) return;
      try {
        const all = await collectionService.findByUser(currentUserId);
        const byId = new Map(all.map(c => [c.id, c]));
        let inCatalogChanged = false;

        for (const id of Object.keys(state.visible)) {
          const c = byId.get(id);
          if (!c) {
            // Colección eliminada → quitar de visibles.
            delete state.visible[id];
            inCatalogChanged = true;
            continue;
          }
          const prev = state.visible[id];
          const nextInCatalog = c.inCatalog === true;
          if (prev.inCatalog !== nextInCatalog) inCatalogChanged = true;
          state.visible[id] = {
            ...prev,
            color: c.color || '#6b7280',
            icon: c.icon || 'folder',
            inCatalog: nextInCatalog,
          };
        }

        if (inCatalogChanged) {
          await rebuildCatalogMembership(currentUserId);
        }
        persistVisibleIds();
        broadcast();
      } catch (e) {
        console.warn('[collection-visibility] meta refresh failed', e);
      }
    };
    window.removeEventListener('collections-updated', metaHandler as EventListener);
    window.addEventListener('collections-updated', metaHandler as EventListener);
  }

  // Realtime: rebuild catalogMembership cuando edge functions
  // (scraper, OneDrive, batch-enrich) insertan/borran collection_items
  // directamente sin pasar por el evento DOM 'collection-items-changed'.
  // Sin esto, los puntos quedan invisibles porque el snapshot in-memory
  // se queda rancio.
  await setupCollectionItemsRealtime(userId);
}

// ─── Realtime: collection_items ─────────────────────────────────────────────
let collectionItemsChannel: ReturnType<typeof supabase.channel> | null = null;
let collectionItemsUserId: string | null = null;
let rebuildDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleMembershipRebuild(userId: string) {
  if (rebuildDebounceTimer) clearTimeout(rebuildDebounceTimer);
  rebuildDebounceTimer = setTimeout(async () => {
    if (currentUserId !== userId) return;
    await rebuildCatalogMembership(userId);
    broadcast();
  }, 250);
}

async function setupCollectionItemsRealtime(userId: string) {
  if (collectionItemsChannel && collectionItemsUserId === userId) return;
  if (collectionItemsChannel) {
    try { await supabase.removeChannel(collectionItemsChannel); } catch { /* ignore */ }
    collectionItemsChannel = null;
  }
  collectionItemsUserId = userId;

  // Cargamos ids de colecciones del usuario para filtrar el canal.
  let collectionIds: string[] = [];
  try {
    const { data } = await (supabase as any)
      .from('collections')
      .select('id')
      .eq('owner_user_id', userId);
    collectionIds = (data ?? []).map((r: any) => r.id);
  } catch (e) {
    console.warn('[collection-visibility] could not preload collection ids', e);
  }

  // Si no hay colecciones todavía, igual nos suscribimos sin filter de ids
  // (la API filtra por server-side; sin filter recibimos todos los items y
  //  rebuildCatalogMembership descarta los que no son del usuario).
  const ch: any = supabase.channel(`collection-items-${userId}`);
  ch.on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'collection_items',
  }, (payload: any) => {
    const cid = payload?.new?.collection_id;
    if (!cid) return;
    if (collectionIds.length > 0 && !collectionIds.includes(cid)) return;
    scheduleMembershipRebuild(userId);
  });
  ch.on('postgres_changes', {
    event: 'DELETE',
    schema: 'public',
    table: 'collection_items',
  }, (payload: any) => {
    const cid = payload?.old?.collection_id;
    if (collectionIds.length > 0 && cid && !collectionIds.includes(cid)) return;
    scheduleMembershipRebuild(userId);
  });
  ch.on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'collections',
    filter: `owner_user_id=eq.${userId}`,
  }, (payload: any) => {
    const cid = payload?.new?.id;
    if (cid && !collectionIds.includes(cid)) collectionIds.push(cid);
    scheduleMembershipRebuild(userId);
  });
  ch.subscribe();
  collectionItemsChannel = ch;
}

/** Solicita al mapa hacer fit a los puntos de una colección.
 *  - 'always': mueve siempre.
 *  - 'if-outside' (default): mueve solo si <30% de los puntos están en viewport. */
export function requestCollectionFit(
  collectionId: string,
  mode: 'always' | 'if-outside' = 'if-outside',
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COLLECTION_FIT_BOUNDS_EVENT, {
    detail: { collectionId, mode },
  }));
}

export function resetSessionCollectionVisibility() {
  if (currentUserId) {
    try { sessionStorage.removeItem(storageKey(currentUserId)); } catch { /* ignore */ }
  }
  for (const k of Object.keys(state.visible)) delete state.visible[k];
  catalogMembership.clear();
  initialized = false;
  currentUserId = null;
  broadcast();
}

export function getVisibleCollectionIds(): Set<string> {
  return new Set(Object.keys(state.visible));
}

export function isCollectionVisible(id: string): boolean {
  return !!state.visible[id];
}

export function getCollectionVisibilityState(): CollectionVisibilityState {
  return { visible: { ...state.visible } };
}

export async function toggleCollectionVisibility(collection: Collection): Promise<boolean> {
  if (state.visible[collection.id]) {
    delete state.visible[collection.id];
    persistVisibleIds();
    broadcast();
    return false;
  }
  const taskId = `collection-toggle:${collection.id}`;
  startLoading(taskId, `Cargando colección "${collection.name ?? ''}"`);
  try {
    state.visible[collection.id] = await loadEntry(collection);
    if (collection.inCatalog === true) {
      for (const lid of state.visible[collection.id].locationIds) {
        let set = catalogMembership.get(lid);
        if (!set) { set = new Set(); catalogMembership.set(lid, set); }
        set.add(collection.id);
      }
    }
    persistVisibleIds();
    broadcast();
    requestCollectionFit(collection.id, 'if-outside');
    return true;
  } finally {
    endLoading(taskId);
  }
}

export function clearAllCollectionVisibility() {
  for (const k of Object.keys(state.visible)) delete state.visible[k];
  persistVisibleIds();
  broadcast();
}

/** Color del anillo para un punto, o null. */
export function getTintForLocation(locationId: string): string | null {
  for (const c of Object.values(state.visible)) {
    if (c.locationIds.includes(locationId)) return c.color;
  }
  return null;
}
export function getTintForRoute(routeId: string): string | null {
  for (const c of Object.values(state.visible)) {
    if (c.routeIds.includes(routeId)) return c.color;
  }
  return null;
}

/** ¿El punto pertenece a alguna colección catálogo del usuario (visible o no)? */
export function isPointInAnyCatalogCollection(locationId: string): boolean {
  return catalogMembership.has(locationId);
}

/** ¿Hay al menos una colección catálogo VISIBLE en sesión que contenga el punto? */
export function isPointInAnyVisibleCatalogCollection(locationId: string): boolean {
  const memberOf = catalogMembership.get(locationId);
  if (!memberOf) return false;
  for (const cid of memberOf) {
    if (state.visible[cid]) return true;
  }
  return false;
}

/** True si el punto pertenece a alguna colección visible cuyo `inCatalog=false`,
 *  forzando su visibilidad en el mapa global aunque no esté aprobado. */
export function isPointVisibleViaCollections(locationId: string): boolean {
  for (const c of Object.values(state.visible)) {
    if (!c.inCatalog && c.locationIds.includes(locationId)) return true;
  }
  return false;
}

/** Subscripción reactiva (devuelve unsubscribe). */
export function subscribeCollectionVisibility(cb: (state: CollectionVisibilityState) => void): () => void {
  const handler = () => cb(getCollectionVisibilityState());
  window.addEventListener(COLLECTION_VISIBILITY_EVENT, handler);
  return () => window.removeEventListener(COLLECTION_VISIBILITY_EVENT, handler);
}
