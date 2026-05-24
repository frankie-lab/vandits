/**
 * poi-visual-grammar — PR-MAP-CANON-1 + canon v3 Fase 2 (marker fill SoT).
 *
 * SINGLE point of composition for everything the map renderer needs to
 * paint a POI. Combines the canonical resolvers under one pure function
 * so `createCustomIcon` reads ONE object instead of calling helpers in
 * cascade.
 *
 * Composed from:
 *   - `resolveMarkerGrammar(viewer, loc)`  → shape + paletteScope + flags
 *   - `getPointVisualState(loc)`           → 3-state palette key
 *     (enriched/imported/empty). Semántica LEGACY — NO gobierna el fill
 *     del marker desde v1.3.1. Sigue alimentando filtros, leyendas
 *     heredadas (`Final/Importado/Vacío`), buckets y telemetría.
 *   - `getPoiCurationLevel(loc)`           → POI-0/1/3/5/9/10 verdict
 *     (acciones de footer/popup). NO gobierna el fill. SÍ gobierna
 *     `showStateRing` (regla DURA: rings sólo en `poi-5`).
 *   - `getPoiMaturityColor(loc)`           → SoT cromática del fill propio
 *     (canon v3 — `poi.maturity[0..10]`). Reemplaza el lookup anterior
 *     a `poi.level.*` en el camino `paletteScope === 'state'`.
 *   - `getPointHealthRings(loc, viewer)`   → ordered ring stack.
 *
 * Pura, sin DOM ni Leaflet. Tokens se leen aquí (vía `getPoiMaturityColor`).
 *
 * Invariantes (v1.3.1):
 *   1. `grammar.source.type === 'own'` ⇔ `paletteScope === 'state'`
 *      ⇔ `allowHealthRings && allowCollectionTint && allowWhiteStroke`.
 *   2. Followed/app/source: `healthRings: []` y `levelVisual: null`
 *      (curated-only sharing boundary intacto).
 *   3. `visualState` se computa siempre pero el renderer NO la lee como
 *      fill (canon v3). Se conserva para consumidores legacy.
 *   4. `curation.level ∈ {0,1,3,5,9,10}` — no new levels.
 *   5. `levelVisual.fillHsl` se deriva de `getPoiMaturityColor(loc).fill`
 *      cuando `paletteScope === 'state'`. `levelVisual.maturityLevel`
 *      expone el nivel POI-N (0..10) usado.
 *   6. `levelVisual.showStateRing === (curation.levelKey === 'poi-5')`.
 *      La regla de rings sigue ligada a la curación, no a la madurez.
 *
 * Ver `docs/contracts/marker-grammar-contract.md` +
 *     `docs/contracts/marker-fill-canon-v3.md`.
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
import { getPoiMaturityColor } from './poi-maturity-color';
import type { PoiMaturityLevel } from './poi-maturity';

/**
 * Decisión visual del fill del marker propio.
 *
 * Canon v3 (v1.3.1): `fillHsl` proviene del token `poi.maturity[<level>]`
 * vía `getPoiMaturityColor`, no del legacy `poi.level.*`. `levelKey`
 * (curación 0/1/3/5/9/10) se conserva porque sigue gobernando
 * `showStateRing` y porque consumidores de QA/telemetría lo esperan.
 */
export interface PoiLevelVisual {
  /** Nivel de curación POI (0/1a/1b/3/5/9/10). Rige `showStateRing`. */
  levelKey: PoiVisualLevelKey;
  /** Nivel de madurez POI-N (0..10). Rige el `fillHsl` (canon v3). */
  maturityLevel: PoiMaturityLevel;
  /** Triplete HSL (sin wrapper `hsl(...)`) — listo para inyectar en CSS. */
  fillHsl: string;
  /** True sólo para `poi-5` (única curación con deuda objetiva). */
  showStateRing: boolean;
}

export interface PoiVisualGrammar {
  /** Shape + paletteScope + decoration flags (own/followed/app/source). */
  grammar: ResolvedMarkerGrammar;
  /** 3-state palette key (enriched/imported/empty). LEGACY: no rige fill. */
  visualState: PointVisualState;
  /** Health rings already filtered by ownership (curated-only sharing). */
  healthRings: HealthRing[];
  /** Curation verdict (POI-0…POI-10 producto). Always computed. */
  curation: PoiCurationVerdict;
  /**
   * Decisión visual canónica del marker propio. `null` para
   * followed/app/source (su pipeline no consume nivel POI).
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
 * fill — it only paints what the grammar declares.
 */
export function resolvePoiVisualGrammar(
  viewerUid: string | null,
  poi: GeoLocation,
): PoiVisualGrammar {
  const grammar = resolveMarkerGrammar(viewerUid, poi);
  const visualState = getPointVisualState(poi);
  const healthRings = grammar.allowHealthRings
    ? getPointHealthRings(poi, viewerUid ?? null)
    : [];
  const curation = getPoiCurationLevel(poi);
  const levelVisual = grammar.paletteScope === 'state'
    ? resolveLevelVisual(poi, curation.levelKey)
    : null;
  return { grammar, visualState, healthRings, curation, levelVisual };
}

/**
 * Canon v3 — `fillHsl` desde `poi.maturity[<level>]` vía
 * `getPoiMaturityColor`. `showStateRing` permanece ligado a la curación
 * (regla DURA `mem://style/map/health-rings-rule`).
 */
function resolveLevelVisual(
  poi: GeoLocation,
  levelKey: PoiVisualLevelKey,
): PoiLevelVisual {
  const { level: maturityLevel, fill } = getPoiMaturityColor(poi);
  // `fill` viene como `hsl(<H> <S>% <L>%)`. Unwrap para mantener el
  // contrato histórico de `fillHsl` (triplete sin wrapper) y no romper
  // consumidores que ya hacen `hsl(${fillHsl})`.
  const fillHsl = fill.startsWith('hsl(') && fill.endsWith(')')
    ? fill.slice(4, -1)
    : fill;
  return {
    levelKey,
    maturityLevel,
    fillHsl,
    showStateRing: levelKey === 'poi-5',
  };
}
