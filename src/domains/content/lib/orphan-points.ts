/**
 * orphan-points — Helper transversal para "puntos sin colección".
 *
 * Define un grupo virtual del usuario actual con todos sus puntos que NO
 * pertenecen a ninguna colección (ni catálogo ni privada). Se expone:
 *
 *  - Conteo + IDs (usado por la fila virtual del CollectionsListPanel y por
 *    una vista enfocada similar a CollectionFocusView).
 *  - Visibilidad por sesión (ojo on/off). Por defecto VISIBLES. Persistencia
 *    en sessionStorage por usuario.
 *  - Integración con la regla `isLocationVisibleInGlobalMap`: si el ojo está
 *    OFF, los puntos aprobados sin colección desaparecen del mapa global.
 *
 * Eventos emitidos:
 *  - 'orphan-points-changed' (detail: { count, ids, visible })
 */
import { supabase } from '@/integrations/supabase/client';
import { collectionService } from '@/services/collection.service';

export const ORPHAN_POINTS_EVENT = 'orphan-points-changed';

interface OrphanState {
  userId: string | null;
  ids: Set<string>;
  visible: boolean;
  loaded: boolean;
}

const state: OrphanState = {
  userId: null,
  ids: new Set(),
  visible: true,
  loaded: false,
};

const STORAGE_PREFIX = 'vandits.orphan-points-visible.v1.';
const storageKey = (uid: string) => `${STORAGE_PREFIX}${uid}`;

function persist() {
  if (!state.userId) return;
  try {
    sessionStorage.setItem(storageKey(state.userId), JSON.stringify(state.visible));
  } catch { /* ignore */ }
}
function loadPersisted(uid: string): boolean {
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    return raw === null ? true : JSON.parse(raw) === true;
  } catch { return true; }
}

function broadcast() {
  window.dispatchEvent(new CustomEvent(ORPHAN_POINTS_EVENT, {
    detail: {
      count: state.ids.size,
      ids: Array.from(state.ids),
      visible: state.visible,
    },
  }));
}

/** Recalcula los IDs de puntos del usuario sin colección. */
export async function recomputeOrphanPoints(userId: string): Promise<void> {
  if (state.userId !== userId) {
    state.userId = userId;
    state.visible = loadPersisted(userId);
  }
  // 1. Todas las locations del usuario (no borradas).
  // owner_user_id es la fuente canónica (cubre puntos manuales y de docs).
  const { data: locs, error } = await supabase
    .from('locations')
    .select('id')
    .eq('owner_user_id', userId)
    .is('deleted_at', null);
  if (error) {
    console.warn('[orphan-points] fetch locations failed', error);
    return;
  }
  const allIds = new Set((locs ?? []).map((r: any) => r.id as string));

  // 2. Restar las que pertenecen a alguna colección del usuario.
  try {
    const collections = await collectionService.findByUser(userId);
    for (const c of collections) {
      const items = await collectionService.getItems(c.id);
      for (const it of items) {
        if (it.itemType === 'route') continue;
        allIds.delete(it.itemId);
      }
    }
  } catch (e) {
    console.warn('[orphan-points] membership compute failed', e);
  }

  state.ids = allIds;
  state.loaded = true;
  broadcast();
}

export function getOrphanCount(): number { return state.ids.size; }
export function getOrphanIds(): string[] { return Array.from(state.ids); }
export function isOrphan(locationId: string): boolean { return state.ids.has(locationId); }
export function isOrphanGroupVisible(): boolean { return state.visible; }
export function isOrphanLoaded(): boolean { return state.loaded; }

export function toggleOrphanVisibility(): boolean {
  state.visible = !state.visible;
  persist();
  broadcast();
  return state.visible;
}

export function setOrphanVisibility(v: boolean) {
  if (state.visible === v) return;
  state.visible = v;
  persist();
  broadcast();
}

export function subscribeOrphanPoints(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(ORPHAN_POINTS_EVENT, handler);
  return () => window.removeEventListener(ORPHAN_POINTS_EVENT, handler);
}

/** Re-cómputo automático cuando cambian items o se actualizan colecciones. */
let wired = false;
export function wireOrphanAutoRecompute(userId: string) {
  if (wired && state.userId === userId) return;
  wired = true;
  state.userId = userId;
  const handler = () => { void recomputeOrphanPoints(userId); };
  window.addEventListener('collection-items-changed', handler);
  window.addEventListener('collections-updated', handler);
  window.addEventListener('locations-updated', handler);
}

export function resetOrphanState() {
  state.userId = null;
  state.ids.clear();
  state.visible = true;
  state.loaded = false;
  broadcast();
}
