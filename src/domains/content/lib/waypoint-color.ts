/**
 * waypoint-color — Thin adapter over `point-visual-state` so older callers
 * (mini-marker components) keep their previous shape but delegate to the
 * single source of truth.
 *
 * Norma transversal (2026-04-19): 3 estados visuales únicos
 * (enriched/imported/empty), aplicables a cualquier capa.
 */
import { getMarkerSizeConfig } from '@/components/map/useMarkerSizeConfig';
import { getPointVisualState } from './point-visual-state';
import type { DocWaypointRow, DocRouteRow } from '@/domains/content/components/DocumentWaypointsTabs';

export type MiniShape = 'circle' | 'pin';

export interface MiniMarkerStyle {
  color: string;
  colorLight: string;
  shape: MiniShape;
  hasInnerDot: boolean;
}

export function getWaypointMiniStyle(loc: DocWaypointRow): MiniMarkerStyle {
  const cfg = getMarkerSizeConfig();
  const state = getPointVisualState(loc);
  const entry = cfg[state] || cfg.empty || cfg.imported;
  const shape: MiniShape = entry.marker_shape === 'pin' ? 'pin' : 'circle';
  return {
    color: entry.fill_color,
    colorLight: entry.fill_color_light,
    shape,
    hasInnerDot: shape === 'pin',
  };
}

/**
 * Saved itineraries are colored using the `enriched` paleta as default
 * (verde) since routes are user-curated content. Polylines mirror this in
 * `map-routes.ts`.
 */
export function getRouteMiniStyle(_route: DocRouteRow): MiniMarkerStyle {
  const cfg = getMarkerSizeConfig();
  const entry = cfg.enriched;
  return {
    color: entry?.fill_color || '#22c55e',
    colorLight: entry?.fill_color_light || '#4ade80',
    shape: 'circle',
    hasInnerDot: false,
  };
}
