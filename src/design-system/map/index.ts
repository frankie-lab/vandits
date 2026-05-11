/**
 * @vandits/design-system/map — Public barrel.
 *
 * Stable import surface for everything map/POI-visual related. Consumers
 * MUST import from sub-paths to keep tree-shaking clean:
 *
 *   import type { PoiVisualState } from '@/design-system/map/types';
 *   import { getMapZoomBand }       from '@/design-system/map/rules/zoom-thresholds';
 *   import { createCustomIcon }     from '@/design-system/map/icons';
 *   import { LEAFLET_PANE_Z_INDEX } from '@/design-system/map/adapters/leaflet-icon-adapter';
 *
 * The bare `@/design-system/map` import is reserved for type-level use.
 */
export type * from './types';
