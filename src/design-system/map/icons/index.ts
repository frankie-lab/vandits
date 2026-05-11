/**
 * @vandits/design-system/map/icons — SVG/DOM icon factories.
 *
 * Phase 2 scaffolding: re-exports today's `createCustomIcon` from
 * `src/components/map/map-icons.ts`. In a later phase the SVG construction
 * will be extracted here (pure DOM/string output, no Leaflet) and the
 * Leaflet wrapping will live in `../adapters/`.
 *
 * Until then this file exists so consumers can already import from the
 * stable path `@/design-system/map/icons`.
 */

export {
  createCustomIcon,
  createSelectedIcon,
  createHoverTooltipIcon,
  setMapRenderMode,
  getCurrentRenderMode,
  zoomToRenderMode,
  type MarkerRenderMode,
} from '@/components/map/map-icons';
