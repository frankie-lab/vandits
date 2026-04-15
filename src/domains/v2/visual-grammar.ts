/**
 * VANDITS V2 — Visual Grammar Resolver
 * 
 * Pure function that maps entity type + ownership + state into
 * shape, colors, and decorations. The map layer does NOT deduce
 * semantics — it receives pre-resolved visual instructions.
 */

import type {
  MapFeature,
  MapFeatureState,
  MapEntityType,
  MapOwnershipSource,
} from './types';

// ── Shape Resolution ──────────────────────────────────────────

type MarkerShape = MapFeature['shape'];

/**
 * Determines the marker shape based on entity type, ownership,
 * and whether the entity has been enriched.
 */
export function resolveShape(
  entityType: MapEntityType,
  ownershipSource: MapOwnershipSource,
  isEnriched: boolean,
): MarkerShape {
  if (entityType === 'track') return 'circle-dashed'; // tracks use line, but fallback

  // Waypoints are always circles (not pins)
  if (entityType === 'waypoint') {
    return isEnriched ? 'circle-solid' : 'circle-hollow';
  }

  // Places
  switch (ownershipSource) {
    case 'own':
      return isEnriched ? 'teardrop' : 'circle-solid';
    case 'followed':
      return 'circle-solid';
    case 'curator':
      return isEnriched ? 'teardrop' : 'circle-solid';
    case 'druid':
      return isEnriched ? 'teardrop' : 'circle-solid';
    default:
      return 'circle-solid';
  }
}

// ── Color Resolution ──────────────────────────────────────────

interface ResolvedColors {
  fillColor: string;
  borderColor?: string;
}

/** Default palette keyed by ownership source */
const OWNERSHIP_COLORS: Record<MapOwnershipSource, { fill: string; fillLight: string }> = {
  own:      { fill: 'hsl(207, 90%, 54%)', fillLight: 'hsl(207, 90%, 64%)' },   // sky blue
  followed: { fill: 'hsl(280, 60%, 50%)', fillLight: 'hsl(280, 60%, 60%)' },   // purple-ish
  curator:  { fill: 'hsl(168, 76%, 42%)', fillLight: 'hsl(168, 76%, 52%)' },   // teal
  druid:    { fill: 'hsl(270, 60%, 60%)', fillLight: 'hsl(270, 60%, 70%)' },   // purple
};

export function resolveColors(
  ownershipSource: MapOwnershipSource,
  _state: MapFeatureState,
  overrideColor?: string,
): ResolvedColors {
  const palette = OWNERSHIP_COLORS[ownershipSource];
  return {
    fillColor: overrideColor || palette.fill,
    borderColor: _state.isConflict ? 'hsl(0, 72%, 51%)' : undefined,
  };
}

// ── Decoration Resolution ─────────────────────────────────────

type Decoration = NonNullable<MapFeature['decoration']>[number];

/**
 * Resolves decorations in priority order:
 * 1. isSelected → halo (dominates visually)
 * 2. isConflict → warning
 * 3. isFavorite → star
 * 4. isVisited  → check
 * 
 * Multiple decorations can coexist.
 */
export function resolveDecorations(state: MapFeatureState): Decoration[] {
  const decorations: Decoration[] = [];

  if (state.isSelected) decorations.push('halo');
  if (state.isConflict) decorations.push('warning');
  if (state.isFavorite) decorations.push('star');
  if (state.isVisited)  decorations.push('check');

  return decorations;
}

// ── Full Resolution (Convenience) ─────────────────────────────

export interface VisualGrammarInput {
  entityType: MapEntityType;
  ownershipSource: MapOwnershipSource;
  state: MapFeatureState;
  isEnriched: boolean;
  overrideColor?: string;
}

export interface VisualGrammarOutput {
  shape: MarkerShape;
  fillColor: string;
  borderColor?: string;
  decoration: Decoration[];
}

/**
 * Single entry point: resolves all visual properties for a map feature.
 * Pure function — no side effects, no DB access.
 */
export function resolveVisualGrammar(input: VisualGrammarInput): VisualGrammarOutput {
  const shape = resolveShape(input.entityType, input.ownershipSource, input.isEnriched);
  const colors = resolveColors(input.ownershipSource, input.state, input.overrideColor);
  const decoration = resolveDecorations(input.state);

  return {
    shape,
    fillColor: colors.fillColor,
    borderColor: colors.borderColor,
    decoration,
  };
}
