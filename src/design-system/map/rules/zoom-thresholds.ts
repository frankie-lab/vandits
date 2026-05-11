/**
 * @vandits/design-system/map/rules/zoom-thresholds — Zoom → render-mode band.
 *
 * SINGLE SOURCE OF TRUTH for zoom thresholds. Reads from tokens/map.json via
 * the generated `tokens` constant. No hardcoded numeric thresholds allowed
 * here (or anywhere downstream).
 *
 * Mirrors today's behaviour in `src/components/map/map-icons.ts` while
 * decoupling it from Leaflet. Existing call-sites will be migrated in a
 * later phase.
 */
import { tokens } from '@/design-system/tokens';
import type { MapZoomBand } from '../types';

const MICRO_MAX = Number(tokens.map.zoom.microMax);
const COMPACT_MAX = Number(tokens.map.zoom.compactMax);
const STANDARD_MAX = Number(tokens.map.zoom.standardMax);

/**
 * Map a numeric Leaflet zoom level to the canonical render-mode band.
 */
export function getMapZoomBand(zoom: number): MapZoomBand {
  if (zoom <= MICRO_MAX) return 'micro';
  if (zoom <= COMPACT_MAX) return 'compact';
  if (zoom <= STANDARD_MAX) return 'standard';
  return 'rich';
}

/**
 * Exposed for stories / debug overlays. Always read via this helper, never
 * inline.
 */
export const ZOOM_THRESHOLDS = {
  microMax: MICRO_MAX,
  compactMax: COMPACT_MAX,
  standardMax: STANDARD_MAX,
  heroMin: Number(tokens.map.zoom.heroMin),
  richMin: Number(tokens.map.zoom.richMin),
} as const;
