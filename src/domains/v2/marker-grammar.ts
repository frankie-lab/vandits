/**
 * VANDITS V2 — Marker Grammar
 * 
 * Pure function that resolves the visual representation of a validated
 * MapFeature. Assumes the feature has already passed validation.
 * 
 * The grammar does NOT validate — it only resolves visual properties.
 */

import type { MapFeature, MapOwnershipSource } from './types';
import type { MarkerGrammarOutput, MarkerShape, Decoration } from './marker-types';

// ── Color Palettes ────────────────────────────────────────────

/** Own places: catalog (sky blue) vs workspace (green) */
const OWN_CATALOG_COLOR  = 'hsl(207, 90%, 54%)';
const OWN_WORKSPACE_COLOR = 'hsl(142, 76%, 36%)';

/** Own unenriched / promoted: orange */
const OWN_UNENRICHED_COLOR = 'hsl(24, 95%, 53%)';

/** Non-own ownership colors */
const OWNERSHIP_COLORS: Record<Exclude<MapOwnershipSource, 'own'>, string> = {
  followed: 'hsl(280, 60%, 50%)',
};

/** Conflict border */
const CONFLICT_BORDER = 'hsl(0, 72%, 51%)';

// ── Shape Resolution ──────────────────────────────────────────

function resolveShape(feature: MapFeature): MarkerShape {
  if (feature.entityType === 'track') return 'circle-dashed';
  if (feature.entityType === 'waypoint') return 'circle-hollow';

  // Place
  const isEnriched = !!feature.overrideColor || hasEnrichedShape(feature);
  if (isEnriched) return 'teardrop';

  // Place not enriched (manually promoted) → solid circle
  return 'circle-solid';
}

/**
 * Determines if a place should get the enriched teardrop shape.
 * A place is considered enriched when it has the teardrop shape
 * already set, OR when we can infer enrichment from available data.
 * 
 * Since MapFeature already carries the pre-existing shape from the
 * composition layer, we check if the feature's existing shape is
 * teardrop (set by the composition hook based on enrichedData).
 * 
 * For fresh resolution (no pre-existing shape), this is controlled
 * by the `isCatalog` flag and enrichment state from the composition layer.
 */
function hasEnrichedShape(feature: MapFeature): boolean {
  // The composition layer sets shape based on enrichment.
  // Here we use the existing shape as a signal if present.
  return feature.shape === 'teardrop';
}

// ── Color Resolution ──────────────────────────────────────────

function resolveColor(feature: MapFeature, shape: MarkerShape): string {
  // Override always wins
  if (feature.overrideColor) return feature.overrideColor;

  if (feature.ownershipSource !== 'own') {
    return OWNERSHIP_COLORS[feature.ownershipSource];
  }

  // Own entity
  if (feature.entityType === 'waypoint') return OWN_UNENRICHED_COLOR;

  // Own place
  if (shape === 'teardrop') {
    // Enriched place: catalog vs workspace
    return feature.isCatalog ? OWN_CATALOG_COLOR : OWN_WORKSPACE_COLOR;
  }

  // Promoted place (not enriched)
  return OWN_UNENRICHED_COLOR;
}

// ── Border Resolution ─────────────────────────────────────────

function resolveBorder(feature: MapFeature): string | undefined {
  if (feature.state.isConflict) return CONFLICT_BORDER;
  return undefined;
}

// ── Decoration Resolution ─────────────────────────────────────

function resolveDecorations(feature: MapFeature): Decoration[] {
  const decorations: Decoration[] = [];

  // Tracks only support halo
  if (feature.entityType === 'track') {
    if (feature.state.isSelected) decorations.push('halo');
    return decorations;
  }

  // Waypoints: only halo + warning (never check/star)
  if (feature.entityType === 'waypoint') {
    if (feature.state.isSelected) decorations.push('halo');
    if (feature.state.isConflict) decorations.push('warning');
    return decorations;
  }

  // Places: full decoration support
  if (feature.state.isSelected) decorations.push('halo');
  if (feature.state.isConflict) decorations.push('warning'); // filtered by validator, but defensive
  if (feature.state.isFavorite) decorations.push('star');
  if (feature.state.isVisited) decorations.push('check');

  return decorations;
}

// ── zIndex Resolution ─────────────────────────────────────────

function resolveZIndex(feature: MapFeature, shape: MarkerShape): number {
  if (feature.state.isSelected) return 1000;
  if (feature.state.isConflict) return 500;
  if (shape === 'teardrop') return 200;
  return 100;
}

// ── Main Entry Point ──────────────────────────────────────────

/**
 * Resolves all visual properties for a validated MapFeature.
 * Pure function — no side effects, no DB access.
 */
export function resolveMarkerGrammar(feature: MapFeature): MarkerGrammarOutput {
  const shape = resolveShape(feature);
  const fillColor = resolveColor(feature, shape);
  const borderColor = resolveBorder(feature);
  const decorations = resolveDecorations(feature);
  const zIndex = resolveZIndex(feature, shape);

  return { shape, fillColor, borderColor, decorations, zIndex };
}

// Re-export color constants for testing
export const _TEST_COLORS = {
  OWN_CATALOG_COLOR,
  OWN_WORKSPACE_COLOR,
  OWN_UNENRICHED_COLOR,
  OWNERSHIP_COLORS,
  CONFLICT_BORDER,
} as const;
