/**
 * point-visual-state — UNIQUE source of truth for the visual state of any
 * waypoint/location anywhere in the app (global map, document view, popup,
 * mini-markers in lists). The status of the parent document only governs
 * VISIBILITY, never paleta.
 *
 * Three visual states (transversal norm, 2026-04-19):
 *
 *   enriched  → green  circle  · `enriched_data.descripcion` present
 *   imported  → grey   circle  · has `description` text but no IA enrichment
 *   empty     → orange circle  · neither description nor enrichment
 *
 * Catálogo común heredado/vinculado is treated as `imported` (grey) — same
 * paleta, different shape/size only if the marker_size_config says so.
 *
 * See:
 *  - mem://style/map/marker-classification-v3 (norma transversal)
 *  - mem://logic/map/catalog-workspace-layers (visibilidad por status)
 */
import { getEnrichmentBucket, type EnrichableLocation } from './enrichment-state';

export type PointVisualState = 'enriched' | 'imported' | 'empty';

/**
 * Resolve the visual state of a point. Delegates to the single source of
 * truth (`getEnrichmentBucket`) so paleta, contadores y badges nunca
 * divergen.
 */
export function getPointVisualState(
  loc: EnrichableLocation | null | undefined,
): PointVisualState {
  return getEnrichmentBucket(loc);
}

/**
 * Map the visual state to its `marker_size_config` key. Single source so the
 * Back Office only needs to maintain three rows.
 */
export function visualStateToConfigKey(state: PointVisualState): 'enriched' | 'imported' | 'empty' {
  return state;
}

/** Convenience: get the config key directly from a location. */
export function getPointConfigKey(loc: EnrichableLocation | null | undefined) {
  return visualStateToConfigKey(getPointVisualState(loc));
}
