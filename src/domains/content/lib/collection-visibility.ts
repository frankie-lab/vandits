/**
 * collection-visibility — Helper transversal de visibilidad de colecciones.
 *
 * Reglas (mem://logic/collections/visibility-rules):
 *  - Cada colección tiene `inCatalog` (DB).
 *  - Default por sesión: `inCatalog=true` → visible; `inCatalog=false` → oculta.
 *  - El ojo invierte el estado SOLO en sesión (nunca persiste).
 *  - Una colección "visible":
 *      · Si `inCatalog=true`: añade ANILLO de color a sus marcadores (sus puntos
 *        ya están en el mapa global vía catálogo aprobado).
 *      · Si `inCatalog=false`: además FUERZA la visibilidad de sus puntos en el
 *        mapa global aunque no estén aprobados.
 *  - Un punto en varias colecciones es visible si AL MENOS UNA está visible.
 *  - El centro del marcador NUNCA cambia (paleta de estado). Solo el anillo.
 */
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';

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
  /** id colección -> entry */
  visible: Record<string, CollectionVisibilityEntry>;
}

const state: CollectionVisibilityState = { visible: {} };
let initialized = false;

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

/** Initialize per-session defaults: collections with `inCatalog=true` start
 *  visible; the rest start hidden. Idempotent and called once per login. */
export async function initSessionCollectionVisibility(userId: string): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const all = await collectionService.findByUser(userId);
    const inCatalog = all.filter(c => c.inCatalog === true);
    // Load items in parallel.
    const entries = await Promise.all(inCatalog.map(loadEntry));
    inCatalog.forEach((c, i) => { state.visible[c.id] = entries[i]; });
    broadcast();
  } catch (e) {
    console.warn('[collection-visibility] init failed', e);
  }
}

/** Reset on logout/user change. */
export function resetSessionCollectionVisibility() {
  for (const k of Object.keys(state.visible)) delete state.visible[k];
  initialized = false;
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
    broadcast();
    return false;
  }
  state.visible[collection.id] = await loadEntry(collection);
  broadcast();
  window.dispatchEvent(new CustomEvent(COLLECTION_FIT_BOUNDS_EVENT, {
    detail: { collectionId: collection.id },
  }));
  return true;
}

export function clearAllCollectionVisibility() {
  for (const k of Object.keys(state.visible)) delete state.visible[k];
  broadcast();
}

/** Color del anillo para un punto, o null si no está en ninguna colección
 *  visible. Si está en varias, devuelve la primera. */
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
