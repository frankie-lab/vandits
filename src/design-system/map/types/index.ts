/**
 * @vandits/design-system/map/types — Canonical map/POI types.
 *
 * These are the ONLY accepted unions for marker state across the app.
 * Loose strings are forbidden (enforced via ESLint in Phase 5).
 *
 * - `PoiOrigin`        → where the POI comes from in the data graph.
 * - `PoiRenderMode`    → zoom-driven render variant (single source: tokens/map.json).
 * - `PoiVisualState`   → palette state (single source: tokens/poi.json).
 * - `PoiHealthState`   → additive outer ring modifier(s).
 * - `PoiLayerKind`     → which Leaflet pane / layer group the POI belongs to.
 * - `MapZoomBand`      → discrete zoom band derived from numeric zoom.
 */

export type PoiOrigin = 'my' | 'followed' | 'service' | 'catalog';

export type PoiRenderMode = 'micro' | 'compact' | 'standard' | 'rich';

export type PoiVisualState = 'enriched' | 'imported' | 'empty';

export type PoiHealthState = 'empty' | 'chain' | 'error';

export type PoiLayerKind =
  | 'tile'
  | 'overlay'
  | 'marker'
  | 'marker-focused'
  | 'tooltip'
  | 'popup';

export type MapZoomBand = PoiRenderMode;

/**
 * Visual specification consumed by icon factories. The icon factory MUST
 * derive every pixel/color from this spec; no inline literals are allowed.
 */
export interface PoiVisualSpec {
  origin: PoiOrigin;
  state: PoiVisualState;
  health: PoiHealthState[];
  renderMode: PoiRenderMode;
  isFocused: boolean;
  isSelected: boolean;
}

/**
 * Resolved decision returned by rules → consumed by icons & adapters.
 */
export interface PoiRenderDecision {
  spec: PoiVisualSpec;
  showHero: boolean;
  showHealthRings: boolean;
  scale: number;
}
