// Domain: Content — delta merge ("redraw por delta") for catalog snapshots.
// Reemplaza el patrón destructivo reset+re-add por un diff con scope que
// preserva referencias de objetos cuando nada visual ha cambiado.
//
// Principio: la `CatalogLoadingCard` representa "no hay catálogo usable",
// nunca "hay una sincronización en curso". Este helper hace innecesario
// vaciar el store para refrescarlo.
import { GeoLocation, KMLDocument } from '@/types/location';

export type OwnerScope = 'mine' | 'social' | 'all';

export interface ApplySnapshotOpts {
  ownerScope: OwnerScope;
  currentUserId: string | null;
}

/** Inputs that affect how the marker is PAINTED. */
function locRenderHash(l: GeoLocation): string {
  return [
    l.coordinates?.lat ?? '',
    l.coordinates?.lng ?? '',
    l.name ?? '',
    l.isApproved ? 1 : 0,
    l.enrichedData?.descripcion ? 1 : 0,
    l.description ? 1 : 0,
    l.placeType ?? '',
    l.geoHealth ?? '',
    l.customData?.user_image_url ?? '',
    l.enrichedData?.imagen ?? '',
    l.customData?.adopted_from ?? '',
    l.documentId ?? '',
    l.visibility ?? '',
  ].join('|');
}

/** Inputs that affect the FICHA (popup/full card) but not the marker visual. */
function locDataHash(l: GeoLocation): string {
  const ts = l.updatedAt instanceof Date ? l.updatedAt.getTime() : 0;
  return String(ts);
}

function isInScope(docUserId: string | undefined, scope: OwnerScope, currentUserId: string | null): boolean {
  if (scope === 'all') return true;
  const isMine = !!docUserId && !!currentUserId && docUserId === currentUserId;
  return scope === 'mine' ? isMine : !isMine;
}

function docMetaEquals(a: KMLDocument, b: KMLDocument): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.fileName === b.fileName &&
    a.status === b.status &&
    a.userId === b.userId &&
    a.ownerName === b.ownerName
  );
}

/** Diff two location arrays for a single doc. Returns the merged array and
 *  whether anything actually changed. Preserves references when both hashes
 *  match so React/Leaflet don't re-render identical markers. */
function mergeLocations(
  prev: GeoLocation[],
  next: GeoLocation[],
): { locations: GeoLocation[]; changed: boolean } {
  if (prev.length === 0 && next.length === 0) {
    return { locations: prev, changed: false };
  }
  const prevById = new Map<string, GeoLocation>();
  prev.forEach((l) => prevById.set(l.id, l));

  let changed = prev.length !== next.length;
  const merged: GeoLocation[] = new Array(next.length);

  for (let i = 0; i < next.length; i++) {
    const nIn = next[i];
    const p = prevById.get(nIn.id);
    if (!p) {
      merged[i] = nIn;
      changed = true;
      continue;
    }
    const prh = locRenderHash(p);
    const nrh = locRenderHash(nIn);
    const pdh = locDataHash(p);
    const ndh = locDataHash(nIn);
    if (prh === nrh && pdh === ndh) {
      // Nothing changed → keep exact same reference.
      merged[i] = p;
      // Even if same content, position in array may differ from prev → that's
      // fine, the array identity will still update only if changed=true.
      continue;
    }
    merged[i] = nIn;
    changed = true;
  }

  // Detect removed-from-snapshot ids (not strictly needed because we return
  // `merged` from the new snapshot, but we still need `changed=true` to
  // trigger a doc replace.
  if (!changed) {
    // Order may differ even if content matches; check sequence.
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== merged[i]) {
        changed = true;
        break;
      }
    }
  }
  return { locations: changed ? merged : prev, changed };
}

export interface ApplySnapshotResult {
  documents: KMLDocument[];
  mutated: boolean;
  /** ids removed from the merged set; caller uses this to clean selection. */
  removedLocationIds: Set<string>;
}

/** Pure merge: produces a new documents array applying the snapshot inside
 *  the requested scope. Documents outside the scope are kept untouched. */
export function applyCatalogSnapshotPure(
  prevDocs: KMLDocument[],
  snapshot: KMLDocument[],
  opts: ApplySnapshotOpts,
): ApplySnapshotResult {
  const { ownerScope, currentUserId } = opts;
  const snapshotById = new Map<string, KMLDocument>();
  snapshot.forEach((d) => snapshotById.set(d.id, d));

  const seen = new Set<string>();
  const removedLocationIds = new Set<string>();
  let mutated = false;

  // 1) Walk previous docs in their current order. Out-of-scope stay as-is.
  //    In-scope docs are either replaced (if changed) or kept (if identical),
  //    and removed if missing from snapshot.
  const next: KMLDocument[] = [];
  for (const prev of prevDocs) {
    const inScope = isInScope(prev.userId, ownerScope, currentUserId);
    if (!inScope) {
      next.push(prev);
      continue;
    }
    const snap = snapshotById.get(prev.id);
    if (!snap) {
      // Doc disappeared within scope → remove. Track its locations.
      prev.locations.forEach((l) => removedLocationIds.add(l.id));
      mutated = true;
      continue;
    }
    seen.add(prev.id);
    const { locations, changed: locsChanged } = mergeLocations(prev.locations, snap.locations);
    const metaChanged = !docMetaEquals(prev, snap);
    if (!locsChanged && !metaChanged) {
      next.push(prev);
      continue;
    }
    // Track removed location ids
    if (locsChanged) {
      const nextIds = new Set(locations.map((l) => l.id));
      prev.locations.forEach((l) => {
        if (!nextIds.has(l.id)) removedLocationIds.add(l.id);
      });
    }
    next.push({
      ...prev,
      ...snap,
      locations,
    });
    mutated = true;
  }

  // 2) Append new docs in scope that weren't in prev.
  for (const snap of snapshot) {
    if (seen.has(snap.id)) continue;
    if (!isInScope(snap.userId, ownerScope, currentUserId)) continue;
    next.push(snap);
    mutated = true;
  }

  return { documents: mutated ? next : prevDocs, mutated, removedLocationIds };
}
