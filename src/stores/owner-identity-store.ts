/**
 * owner-identity-store — In-memory store + service para la asignación
 * persistida `viewer → followedUid → colorIndex` (PR-OWNER-IDENTITY-1).
 *
 * Reglas:
 *  - El renderer (`createCustomIcon`) NUNCA dispara writes; solo lee
 *    `getOwnerColorIndex(uid)`.
 *  - Los writes (`ensureAssignmentsForFolloweds`) se disparan desde
 *    `UsersSidebar` al cargar la lista, y desde flujos de aceptar follow.
 *  - Algoritmo de asignación: primer índice libre 0..N-1 entre los
 *    seguidos activos del viewer; si todos usados → fallback `hash % N`.
 *  - Tras cualquier cambio de asignación se emite el evento global
 *    `lovable:owner-identity-updated` con `{ affectedUids }` para que
 *    `LocationMap` repinte SOLO los markers de esos owners (no rebuild).
 *
 * Ver mem://style/map/followed-poi-grammar.
 */
import { supabase } from '@/integrations/supabase/client';
import { OWNER_PALETTE_SIZE, OWNER_PALETTE_VERSION } from '@/components/map/owner-stroke';

const TABLE = 'user_owner_color_assignments' as const;

/** Mapa en memoria followedUid → colorIndex para el viewer actual. */
const _byFollowed = new Map<string, number>();
/** uids para los que ya garantizamos asignación (evita writes duplicados). */
const _ensured = new Set<string>();
/** Promesas en vuelo por followedUid (dedupe concurrencia). */
const _inflight = new Map<string, Promise<number | null>>();
/** uid del viewer cargado actualmente (para invalidar al cambiar de sesión). */
let _viewerUid: string | null = null;

export const OWNER_IDENTITY_UPDATED_EVENT = 'lovable:owner-identity-updated';

function emitUpdated(affectedUids: string[]) {
  if (affectedUids.length === 0) return;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OWNER_IDENTITY_UPDATED_EVENT, { detail: { affectedUids } }),
  );
}

/** Lectura síncrona del store. Devuelve `undefined` si no hay asignación. */
export function getOwnerColorIndex(followedUid: string | null | undefined): number | undefined {
  if (!followedUid) return undefined;
  return _byFollowed.get(followedUid);
}

/** Snapshot del store (para tests / inspección). */
export function _getOwnerIdentityStoreSnapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  _byFollowed.forEach((v, k) => { out[k] = v; });
  return out;
}

/** Limpia el store (logout o cambio de viewer). */
export function clearOwnerIdentityStore(): void {
  _byFollowed.clear();
  _ensured.clear();
  _inflight.clear();
  _viewerUid = null;
}

/**
 * Carga todas las asignaciones del viewer desde DB y rellena el store.
 * Idempotente — vuelve a cargar al cambiar `viewerUid`.
 */
export async function loadOwnerIdentityAssignments(viewerUid: string): Promise<void> {
  if (!viewerUid) return;
  if (_viewerUid !== viewerUid) {
    clearOwnerIdentityStore();
    _viewerUid = viewerUid;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('followed_user_id, color_index')
    .eq('viewer_user_id', viewerUid);
  if (error) {
    console.warn('[owner-identity] load failed', error.message);
    return;
  }
  const affected: string[] = [];
  (data ?? []).forEach((row: any) => {
    const idx = Number(row.color_index);
    if (!Number.isFinite(idx) || idx < 0) return;
    const prev = _byFollowed.get(row.followed_user_id);
    _byFollowed.set(row.followed_user_id, idx);
    _ensured.add(row.followed_user_id);
    if (prev !== idx) affected.push(row.followed_user_id);
  });
  emitUpdated(affected);
}

/**
 * Garantiza asignación para una lista de seguidos. Para cada uno que
 * aún no tiene `colorIndex`, calcula el primer índice libre entre los
 * seguidos activos del viewer y persiste. Idempotente y dedupea
 * llamadas concurrentes.
 */
export async function ensureAssignmentsForFolloweds(
  viewerUid: string,
  followedUids: string[],
): Promise<void> {
  if (!viewerUid || followedUids.length === 0) return;
  if (_viewerUid !== viewerUid) {
    await loadOwnerIdentityAssignments(viewerUid);
  }
  const pending = followedUids.filter(uid =>
    uid && uid !== viewerUid && !_ensured.has(uid) && !_inflight.has(uid),
  );
  if (pending.length === 0) return;

  // Procesar secuencialmente para que el cálculo de "primer índice libre"
  // sea estable y no genere colisiones por carrera local.
  const affected: string[] = [];
  for (const uid of pending) {
    const p = _ensureSingle(viewerUid, uid).then((idx) => {
      if (idx != null) {
        const prev = _byFollowed.get(uid);
        _byFollowed.set(uid, idx);
        _ensured.add(uid);
        if (prev !== idx) affected.push(uid);
      }
      return idx;
    }).finally(() => {
      _inflight.delete(uid);
    });
    _inflight.set(uid, p);
    await p;
  }
  emitUpdated(affected);
}

function pickFirstFreeIndex(): number {
  const used = new Set<number>(_byFollowed.values());
  for (let i = 0; i < OWNER_PALETTE_SIZE; i++) {
    if (!used.has(i)) return i;
  }
  return -1; // todos usados
}

function hashFallbackIndex(uid: string): number {
  let h = 5381;
  for (let i = 0; i < uid.length; i++) h = ((h << 5) + h + uid.charCodeAt(i)) | 0;
  return Math.abs(h) % OWNER_PALETTE_SIZE;
}

async function _ensureSingle(viewerUid: string, followedUid: string): Promise<number | null> {
  // Re-check (puede haber sido insertado entre tanto).
  if (_byFollowed.has(followedUid)) return _byFollowed.get(followedUid)!;

  const free = pickFirstFreeIndex();
  const colorIndex = free >= 0 ? free : hashFallbackIndex(followedUid);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      viewer_user_id: viewerUid,
      followed_user_id: followedUid,
      color_index: colorIndex,
      palette_version: OWNER_PALETTE_VERSION,
    })
    .select('color_index')
    .maybeSingle();

  if (error) {
    // Conflicto (PK ya existe → otra pestaña lo insertó). Re-leer.
    if ((error as any)?.code === '23505') {
      const { data: existing } = await supabase
        .from(TABLE)
        .select('color_index')
        .eq('viewer_user_id', viewerUid)
        .eq('followed_user_id', followedUid)
        .maybeSingle();
      if (existing && Number.isFinite(Number(existing.color_index))) {
        return Number(existing.color_index);
      }
    }
    console.warn('[owner-identity] ensure failed', error.message);
    return null;
  }
  if (data && Number.isFinite(Number(data.color_index))) {
    return Number(data.color_index);
  }
  return colorIndex;
}
