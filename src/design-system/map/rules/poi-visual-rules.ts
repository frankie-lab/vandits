/**
 * @vandits/design-system/map/rules/poi-visual-rules — Pure visual decisions.
 *
 * This module re-exports today's canonical helpers from the content domain
 * so the design system becomes the single import surface for visual logic.
 * In a later phase the implementations will be moved here; for now we
 * re-export to guarantee zero-behavior-change.
 *
 * NO DOM, NO Leaflet, NO inline literals. All colors/sizes must come from
 * tokens (`@/design-system/tokens`) via tokens/poi.json.
 */

export {
  getPointVisualState,
  isPointEnriched,
  visualStateToConfigKey,
  getPointConfigKey,
  type PointVisualState,
} from '@/domains/content/lib/point-visual-state';

export {
  getPointHealthRings,
  hasBrokenGeoChain,
  hasEmptyContent,
  RING_COLORS,
  RING_WIDTH,
  type HealthRing,
} from '@/domains/content/lib/point-health-rings';

import { tokens } from '@/design-system/tokens';
import type { PoiRenderMode, PoiVisualState } from '../types';

/**
 * Render scale per zoom band. Source: tokens/poi.json → renderScale.
 */
export const POI_RENDER_SCALE: Record<PoiRenderMode, number> = {
  micro: Number(tokens.poi.renderScale.micro),
  compact: Number(tokens.poi.renderScale.compact),
  standard: Number(tokens.poi.renderScale.standard),
  rich: Number(tokens.poi.renderScale.rich),
};

/**
 * Palette color per visual state. Source: tokens/poi.json → state.
 * Returned wrapped in `hsl(...)` because tokens are HSL triplets (DS grammar).
 */
export const POI_STATE_COLOR: Record<PoiVisualState, string> = {
  enriched: `hsl(${tokens.poi.state.enriched})`,
  imported: `hsl(${tokens.poi.state.imported})`,
  empty: `hsl(${tokens.poi.state.empty})`,
};
