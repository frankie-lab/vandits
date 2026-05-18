/**
 * poi-visual-grammar — PR-MAP-CANON-1 (no-op visual).
 *
 * SINGLE point of composition for everything the map renderer needs to
 * paint a POI. Combines the three existing canonical resolvers under one
 * pure function so `createCustomIcon` (and any future renderer) reads
 * ONE object instead of calling three helpers in cascade.
 *
 * Composed from:
 *   - `resolveMarkerGrammar(viewer, loc)`  → shape + paletteScope + flags
 *     (own/followed/app/source rules).
 *   - `getPointVisualState(loc)`           → 3-state palette key
 *     (enriched/imported/empty). Only meaningful for `own`.
 *   - `getPoiCurationLevel(loc)`           → POI-0/1/3/5/9/10 verdict
 *     (level + healthState + shareability + bodyBlocker + primaryAction).
 *     Reserved for `own`; for followed/app/source it is still computed but
 *     callers MAY ignore it (the marker does not currently differentiate
 *     curation levels visually — that is PR-MAP-CANON-3).
 *   - `getPointHealthRings(loc, viewer)`   → ordered ring stack.
 *
 * This module is INTENTIONALLY pure and non-visual: it returns a
 * declarative object. Zero DOM, zero Leaflet, zero token resolution.
 * Tokens are read in the renderer.
 *
 * Invariants (must hold across PR-MAP-CANON-1):
 *   1. `grammar.source.type === 'own'`     ⇔ `paletteScope === 'state'`
 *      ⇔ `allowHealthRings && allowCollectionTint && allowWhiteStroke`.
 *   2. Followed/app/source POIs receive `healthRings: []` (PR-1 curated
 *      sharing boundary) regardless of underlying data.
 *   3. `visualState` is always computed but the renderer should only use
 *      it when `paletteScope === 'state'`.
 *   4. `curation.level ∈ {0,1,3,5,9,10}` — no new levels.
 *
 * Ver `docs/contracts/marker-grammar-contract.md`.
 */

import type { GeoLocation } from '@/types/location';
import {
  resolveMarkerGrammar,
  type ResolvedMarkerGrammar,
} from './poi-marker-grammar';
import {
  getPointVisualState,
  type PointVisualState,
} from './point-visual-state';
import {
  getPointHealthRings,
  type HealthRing,
} from './point-health-rings';
import {
  getPoiCurationLevel,
  type PoiCurationVerdict,
} from './poi-curation-level';

export interface PoiVisualGrammar {
  /** Shape + paletteScope + decoration flags (own/followed/app/source). */
  grammar: ResolvedMarkerGrammar;
  /** 3-state palette key (enriched/imported/empty). Meaningful only for `own`. */
  visualState: PointVisualState;
  /** Health rings already filtered by ownership (curated-only sharing). */
  healthRings: HealthRing[];
  /** Curation verdict (POI-0…POI-10). Always computed; renderer may ignore. */
  curation: PoiCurationVerdict;
}

export interface ResolvePoiVisualGrammarOptions {
  /** Pre-resolved viewer ownership (avoids recomputing in the renderer). */
  viewerUid?: string | null;
}

/**
 * Single composition point. Pure. Same input → same output.
 *
 * Renderer contract: `createCustomIcon` reads `PoiVisualGrammar` and
 * decides nothing about ownership, shape, palette scope, ring stack or
 * curation level — it only paints what the grammar declares.
 */
export function resolvePoiVisualGrammar(
  viewerUid: string | null,
  poi: GeoLocation,
): PoiVisualGrammar {
  const grammar = resolveMarkerGrammar(viewerUid, poi);
  const visualState = getPointVisualState(poi);
  // Followed/app/source NEVER receive health rings on the map
  // (PR-1 curated-only sharing boundary). The ownership guard lives in
  // `getPointHealthRings` when `currentUserId` is passed; we double-gate
  // here so a missing `viewerUid` cannot accidentally leak rings for
  // non-own shapes.
  const healthRings = grammar.allowHealthRings
    ? getPointHealthRings(poi, viewerUid ?? null)
    : [];
  const curation = getPoiCurationLevel(poi);
  return { grammar, visualState, healthRings, curation };
}
