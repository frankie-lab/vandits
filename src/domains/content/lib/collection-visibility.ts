/**
 * collection-visibility — Helper transversal para mostrar/ocultar el TINTE de
 * una colección en el mapa.
 *
 * Reglas:
 *  - Activar el ojo NO oculta el resto del catálogo. Sólo añade un anillo
 *    exterior coloreado en los marcadores miembros y tiñe las polilíneas de
 *    las rutas miembros.
 *  - Estado central singleton + bus de eventos. El mapa (y cualquier UI)
 *    consulta `getTintForLocation(id)` / `getTintForRoute(id)` o se suscribe.
 *  - No muta records originales: el color/icono se aplica como capa overlay.
 */
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';

export const COLLECTION_VISIBILITY_EVENT = 'collection-visibility-changed';
export const COLLECTION_FIT_BOUNDS_EVENT = 'collection-fit-bounds-request';

export interface CollectionVisibilityEntry {
  color: string;
  icon: string;
  locationIds: string[];
  routeIds: string[];
}

export interface CollectionVisibilityState {
  /** id colección -> entry */
  visible: Record<string, CollectionVisibilityEntry>;
}

const state: CollectionVisibilityState = { visible: {} };

function broadcast() {
  window.dispatchEvent(new CustomEvent(COLLECTION_VISIBILITY_EVENT, {
    detail: { visible: { ...state.visible } },
  }));
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
  const items = await collectionService.getItems(collection.id);
  state.visible[collection.id] = {
    color: collection.color || '#6b7280',
    icon: collection.icon || 'folder',
    locationIds: items
      .filter(i => i.itemType === 'place' || i.itemType === 'waypoint')
      .map(i => i.itemId),
    routeIds: items.filter(i => i.itemType === 'route').map(i => i.itemId),
  };
  broadcast();
  // Pide al mapa hacer auto-fit inteligente (sólo si está fuera de viewport).
  window.dispatchEvent(new CustomEvent(COLLECTION_FIT_BOUNDS_EVENT, {
    detail: { collectionId: collection.id },
  }));
  return true;
}

export function clearAllCollectionVisibility() {
  for (const k of Object.keys(state.visible)) delete state.visible[k];
  broadcast();
}

/** Devuelve el color de tinte que debe aplicarse al punto, o null si no está
 *  en ninguna colección visible. Si está en varias, devuelve la primera. */
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

/** Subscripción reactiva (devuelve unsubscribe). */
export function subscribeCollectionVisibility(cb: (state: CollectionVisibilityState) => void): () => void {
  const handler = () => cb(getCollectionVisibilityState());
  window.addEventListener(COLLECTION_VISIBILITY_EVENT, handler);
  return () => window.removeEventListener(COLLECTION_VISIBILITY_EVENT, handler);
}
