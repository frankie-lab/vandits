/**
 * owner-identity-store — In-memory store + service for persistent OKLCH
 * identity colors (PR-OWNER-IDENTITY-2).
 *
 * Rules:
 *  - Renderer (`createCustomIcon`) NEVER triggers writes; it only reads
 *    `getOwnerIdentityOklch(uid)`.
 *  - Writes (`ensureAssignmentsForFolloweds`) are triggered from
 *    `UsersSidebar` mount and from follow-accept flows.
 *  - Allocation is OKLCH maximin over the candidate space, with seed
 *    palette consumed first. See `lib/color/identity-allocator.ts`.
 *  - Existing assignments are immutable; new follows never recolor old ones.
 *  - After any change a global `lovable:owner-identity-updated` event is
 *    emitted with `{ affectedUids }` so `LocationMap` can repaint only
 *    those markers in-place (no rebuild).
 *
 * See mem://style/map/followed-poi-grammar
 *     mem://logic/identity/owner-color-allocator
 */

import { supabase } from '@/integrations/supabase/client';
import {
  OWNER_PALETTE_VERSION,
  pickNextIdentityColor,
} from '@/lib/color/identity-allocator';
import type { OklchColor } from '@/lib/color/oklch';

const TABLE = 'user_owner_color_assignments' as const;

const _byFollowed = new Map<string, OklchColor>();
const _ensured = new Set<string>();
const _inflight = new Map<string, Promise<OklchColor | null>>();
let _viewerUid: string | null = null;

export const OWNER_IDENTITY_UPDATED_EVENT = 'lovable:owner-identity-updated';

function emitUpdated(affectedUids: string[]) {
  if (affectedUids.length === 0) return;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OWNER_IDENTITY_UPDATED_EVENT, { detail: { affectedUids } }),
  );
}

/** Synchronous read. Returns `undefined` when no assignment is loaded. */
export function getOwnerIdentityOklch(
  followedUid: string | null | undefined,
): OklchColor | undefined {
  if (!followedUid) return undefined;
  return _byFollowed.get(followedUid);
}

/** Snapshot for tests / inspection. */
export function _getOwnerIdentityStoreSnapshot(): Record<string, OklchColor> {
  const out: Record<string, OklchColor> = {};
  _byFollowed.forEach((v, k) => { out[k] = v; });
  return out;
}

export function clearOwnerIdentityStore(): void {
  _byFollowed.clear();
  _ensured.clear();
  _inflight.clear();
  _viewerUid = null;
}

/** Load all viewer assignments from DB into memory. */
export async function loadOwnerIdentityAssignments(viewerUid: string): Promise<void> {
  if (!viewerUid) return;
  if (_viewerUid !== viewerUid) {
    clearOwnerIdentityStore();
    _viewerUid = viewerUid;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('followed_user_id, oklch_l, oklch_c, oklch_h')
    .eq('viewer_user_id', viewerUid);
  if (error) {
    console.warn('[owner-identity] load failed', error.message);
    return;
  }
  const affected: string[] = [];
  (data ?? []).forEach((row: any) => {
    const L = Number(row.oklch_l);
    const C = Number(row.oklch_c);
    const h = Number(row.oklch_h);
    if (!Number.isFinite(L) || !Number.isFinite(C) || !Number.isFinite(h)) return;
    const color: OklchColor = { L, C, h };
    const prev = _byFollowed.get(row.followed_user_id);
    _byFollowed.set(row.followed_user_id, color);
    _ensured.add(row.followed_user_id);
    if (!prev || prev.L !== L || prev.C !== C || prev.h !== h) {
      affected.push(row.followed_user_id);
    }
  });
  emitUpdated(affected);
}

/**
 * Ensure an OKLCH assignment exists for each followed uid. New assignments
 * use the maximin allocator over the viewer's currently assigned colors.
 * Existing assignments are NEVER recomputed.
 */
export async function ensureAssignmentsForFolloweds(
  viewerUid: string,
  followedUids: string[],
): Promise<void> {
  if (!viewerUid || followedUids.length === 0) return;
  if (_viewerUid !== viewerUid) {
    await loadOwnerIdentityAssignments(viewerUid);
  }
  const pending = followedUids.filter(
    (uid) => uid && uid !== viewerUid && !_ensured.has(uid) && !_inflight.has(uid),
  );
  if (pending.length === 0) return;

  const affected: string[] = [];
  for (const uid of pending) {
    const p = _ensureSingle(viewerUid, uid).then((color) => {
      if (color) {
        _byFollowed.set(uid, color);
        _ensured.add(uid);
        affected.push(uid);
      }
      return color;
    }).finally(() => { _inflight.delete(uid); });
    _inflight.set(uid, p);
    await p;
  }
  emitUpdated(affected);
}

async function _ensureSingle(
  viewerUid: string,
  followedUid: string,
): Promise<OklchColor | null> {
  if (_byFollowed.has(followedUid)) return _byFollowed.get(followedUid)!;

  const assigned = Array.from(_byFollowed.values());
  const { color, degraded } = pickNextIdentityColor(assigned);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      viewer_user_id: viewerUid,
      followed_user_id: followedUid,
      oklch_l: color.L,
      oklch_c: color.C,
      oklch_h: color.h,
      degraded,
      palette_version: OWNER_PALETTE_VERSION,
    })
    .select('oklch_l, oklch_c, oklch_h')
    .maybeSingle();

  if (error) {
    if ((error as any)?.code === '23505') {
      // Conflict: another tab inserted. Re-read.
      const { data: existing } = await supabase
        .from(TABLE)
        .select('oklch_l, oklch_c, oklch_h')
        .eq('viewer_user_id', viewerUid)
        .eq('followed_user_id', followedUid)
        .maybeSingle();
      if (existing) {
        const L = Number(existing.oklch_l);
        const C = Number(existing.oklch_c);
        const h = Number(existing.oklch_h);
        if (Number.isFinite(L) && Number.isFinite(C) && Number.isFinite(h)) {
          return { L, C, h };
        }
      }
    }
    console.warn('[owner-identity] ensure failed', error.message);
    return null;
  }
  if (data && Number.isFinite(Number(data.oklch_l))) {
    return {
      L: Number(data.oklch_l),
      C: Number(data.oklch_c),
      h: Number(data.oklch_h),
    };
  }
  return color;
}
