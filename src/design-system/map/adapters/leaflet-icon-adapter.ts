/**
 * @vandits/design-system/map/adapters/leaflet-icon-adapter — Boundary layer.
 *
 * This is the ONLY place allowed to import `leaflet` for icon construction.
 * Pure visual decisions live in `../rules/`, SVG/DOM strings in `../icons/`,
 * and this adapter wraps them into `L.DivIcon` / `L.Icon` instances.
 *
 * Phase 2: scaffold. Today's adapter is still inlined in
 * `src/components/map/map-icons.ts` and re-exported via `../icons/`. In a
 * later phase the wrapping calls will move here.
 */
import L from 'leaflet';
import { tokens } from '@/design-system/tokens';

/**
 * Leaflet pane z-indices, sourced exclusively from tokens/map.json.
 * Components that create custom panes MUST read these values, never inline
 * numeric z-indices.
 */
export const LEAFLET_PANE_Z_INDEX = {
  tile: Number(tokens.map.pane.tile),
  overlay: Number(tokens.map.pane.overlay),
  marker: Number(tokens.map.pane.marker),
  markerFocused: Number(tokens.map.pane.markerFocused),
  tooltip: Number(tokens.map.pane.tooltip),
  popup: Number(tokens.map.pane.popup),
} as const;

/**
 * Convenience type alias re-exported so consumers don't need a direct
 * `import L from 'leaflet'` just for typing icon factories.
 */
export type LeafletDivIcon = L.DivIcon;
export type LeafletIcon = L.Icon;
