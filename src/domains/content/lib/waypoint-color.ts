/**
 * waypoint-color — Resolves the on-map color/shape of any waypoint or route
 * so the document panel list can render a mini-marker that matches reality.
 *
 * Single source of truth: `marker_size_config` (Back Office), the same one that
 * feeds `map-icons.ts` and `map-routes.ts`. See:
 *   - mem://style/map/marker-classification-v3
 *   - mem://style/map/route-color-synchronization-v2
 *   - mem://ui/marker-status-symbology
 */
import { getMarkerSizeConfig } from '@/components/map/useMarkerSizeConfig';
import type { DocWaypointRow, DocRouteRow } from '@/domains/content/components/DocumentWaypointsTabs';

export type MiniShape = 'circle' | 'pin';

export interface MiniMarkerStyle {
  /** Solid fill color (HSL/hex). */
  color: string;
  /** Lighter shade for the gradient stop. */
  colorLight: string;
  /** Shape used by the on-map marker (circle for non-enriched / catalog new, pin for enriched). */
  shape: MiniShape;
  /** Whether it should render the central white dot (only on pins). */
  hasInnerDot: boolean;
}

function classifyEnrichment(loc: DocWaypointRow): 'unknown' | 'new' | 'enriched' {
  const hasEnriched = !!loc.enriched_data && !!loc.enriched_data.descripcion;
  if (hasEnriched) return 'enriched';
  if (loc.description && loc.description.trim().length > 0) return 'unknown';
  return 'new';
}

/**
 * Resolves the mini-marker style for a waypoint, mirroring the logic in
 * `createCustomIcon` (map-icons.ts).
 */
export function getWaypointMiniStyle(loc: DocWaypointRow): MiniMarkerStyle {
  const cfg = getMarkerSizeConfig();
  const isCatalog = loc.is_approved === true;
  const status = classifyEnrichment(loc);

  let key: string;
  if (status === 'enriched') {
    key = isCatalog ? 'catalog_enriched' : 'own_enriched';
  } else if (status === 'unknown') {
    key = isCatalog ? 'catalog_new' : 'own_new';
  } else {
    key = isCatalog ? 'catalog_empty' : 'own_empty';
  }

  const entry = cfg[key] || cfg.own_new;
  const shape: MiniShape = entry.marker_shape === 'pin' ? 'pin' : 'circle';
  return {
    color: entry.fill_color,
    colorLight: entry.fill_color_light,
    shape,
    hasInnerDot: shape === 'pin',
  };
}

/**
 * Resolves the polyline color for a route, mirroring `getRouteColors()` in
 * `map-routes.ts`. Saved itineraries default to the forward leg color.
 */
export function getRouteMiniStyle(_route: DocRouteRow): MiniMarkerStyle {
  const cfg = getMarkerSizeConfig();
  const color = cfg.own_enriched?.fill_color || '#22c55e';
  const colorLight = cfg.own_enriched?.fill_color_light || '#4ade80';
  return { color, colorLight, shape: 'circle', hasInnerDot: false };
}
