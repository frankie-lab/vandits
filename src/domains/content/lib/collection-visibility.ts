/**
 * collection-visibility — Helper transversal para mostrar/ocultar el contenido
 * de una colección en el mapa.
 *
 * Reutiliza el bus `itinerary-focus` (usado por itinerarios) para resaltar los
 * puntos miembros, y emite además `collection-visibility-changed` para que el
 * mapa pinte los polilíneas de rutas y los anillos exteriores de los marcadores
 * con el color de la colección.
 *
 * NO modifica el record de cada punto/ruta: el color/icono se aplica como
 * "tinte de capa" mientras la colección está visible.
 */
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';

export const COLLECTION_VISIBILITY_EVENT = 'collection-visibility-changed';

export interface CollectionVisibilityState {
  /** id colección -> { color, icon, locationIds, routeIds } */
  visible: Record<string, {
    color: string;
    icon: string;
    locationIds: string[];
    routeIds: string[];
  }>;
}

const state: CollectionVisibilityState = { visible: {} };

function broadcast() {
  // Lista plana de locationIds para el bus itinerary-focus
  const locationIds: string[] = [];
  for (const c of Object.values(state.visible)) locationIds.push(...c.locationIds);

  window.dispatchEvent(new CustomEvent('itinerary-focus', {
    detail: { locationIds: locationIds.length > 0 ? locationIds : null },
  }));
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
  return true;
}

export function clearAllCollectionVisibility() {
  for (const k of Object.keys(state.visible)) delete state.visible[k];
  broadcast();
}

/** Para que la UI sepa qué tinte aplicar a un point o route concreto. */
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
