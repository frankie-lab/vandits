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
  type PoiVisualLevelKey,
} from './poi-curation-level';
import { tokens } from '@/design-system/tokens';

/**
 * PR-MAP-CANON-3 — Decisión visual derivada del nivel canónico POI-N.
 * Sólo se computa cuando `paletteScope === 'state'` (POI propio); para
 * followed/app/source es `null` y el pipeline de esos orígenes no cambia.
 *
 * - `fill`: color HSL ya resuelto desde tokens (`poi.level.<N>`), listo
 *   para inyectar en `hsl(...)`. Cero literal en el renderer.
 * - `showStateRing`: true sólo para `poi-5` (único nivel con deuda
 *   objetiva que requiere capa de health rings como señal operativa
 *   secundaria). El resto de niveles no debe pintar rings.
 */
export interface PoiLevelVisual {
  levelKey: PoiVisualLevelKey;
  /** Triplete HSL (sin wrapper `hsl(...)`) — mismo formato que los demás tokens. */
  fillHsl: string;
  showStateRing: boolean;
}

export interface PoiVisualGrammar {
  /** Shape + paletteScope + decoration flags (own/followed/app/source). */
  grammar: ResolvedMarkerGrammar;
  /** 3-state palette key (enriched/imported/empty). Meaningful only for `own`. */
  visualState: PointVisualState;
  /** Health rings already filtered by ownership (curated-only sharing). */
  healthRings: HealthRing[];
  /** Curation verdict (POI-0…POI-10). Always computed; renderer may ignore. */
  curation: PoiCurationVerdict;
  /**
   * PR-MAP-CANON-3 — Decisión visual canónica del marker propio. `null`
   * para followed/app/source (su pipeline no consume nivel POI).
   */
  levelVisual: PoiLevelVisual | null;
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
  const levelVisual = grammar.paletteScope === 'state'
    ? resolveLevelVisual(curation.levelKey)
    : null;
  return { grammar, visualState, healthRings, curation, levelVisual };
}

/**
 * PR-MAP-CANON-3 — Lookup canónico nivel → token. Sin lógica de negocio:
 * el verdict ya decidió el `levelKey`; aquí solo resolvemos el color y
 * la regla "rings sólo en POI-5".
 */
function resolveLevelVisual(levelKey: PoiVisualLevelKey): PoiLevelVisual {
  const levelTokens = (tokens as any).poi.level as Record<string, string>;
  // El verdict mapea 1:1 con las keys del token (`poi.level.0`, `1a`, `1b`,
  // `3`, `5`, `9`, `10`). El sufijo `poi-` se quita para indexar.
  const tokenKey = levelKey.replace(/^poi-/, '');
  const fillHsl = levelTokens[tokenKey];
  return {
    levelKey,
    fillHsl,
    showStateRing: levelKey === 'poi-5',
  };
}
