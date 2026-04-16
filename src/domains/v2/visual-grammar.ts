/**
 * VANDITS V2 — Visual Grammar (Compatibility Layer)
 */

import type {
  MapFeature,
  MapFeatureState,
  MapEntityType,
  MapOwnershipSource,
} from './types';
import { resolveMarkerGrammar } from './marker-grammar';
import type { MarkerShape, Decoration, MarkerGrammarOutput } from './marker-types';

// ── Legacy Shape Resolution (compat) ─────────────────────────

/** @deprecated Use resolveMarkerGrammar() instead. */
export function resolveShape(
  entityType: MapEntityType,
  ownershipSource: MapOwnershipSource,
  isEnriched: boolean,
): MapFeature['shape'] {
  if (entityType === 'track') return 'circle-dashed';
  if (entityType === 'waypoint') {
    return isEnriched ? 'circle-solid' : 'circle-hollow';
  }
  switch (ownershipSource) {
    case 'own':
      return isEnriched ? 'teardrop' : 'circle-solid';
    case 'followed':
      return 'circle-solid';
    default:
      return 'circle-solid';
  }
}

// ── Legacy Color Resolution (compat) ─────────────────────────

interface ResolvedColors {
  fillColor: string;
  borderColor?: string;
}

const OWNERSHIP_COLORS: Record<MapOwnershipSource, { fill: string; fillLight: string }> = {
  own:      { fill: 'hsl(207, 90%, 54%)', fillLight: 'hsl(207, 90%, 64%)' },
  followed: { fill: 'hsl(280, 60%, 50%)', fillLight: 'hsl(280, 60%, 60%)' },
};

/** @deprecated Use resolveMarkerGrammar() instead. */
export function resolveColors(
  ownershipSource: MapOwnershipSource,
  _state: MapFeatureState,
  overrideColor?: string,
): ResolvedColors {
  const palette = OWNERSHIP_COLORS[ownershipSource] || OWNERSHIP_COLORS.own;
  return {
    fillColor: overrideColor || palette.fill,
    borderColor: _state.isConflict ? 'hsl(0, 72%, 51%)' : undefined,
  };
}

// ── Legacy Decoration Resolution (compat) ─────────────────────

/** @deprecated Use resolveMarkerGrammar() instead. */
export function resolveDecorations(state: MapFeatureState): Decoration[] {
  const decorations: Decoration[] = [];
  if (state.isSelected) decorations.push('halo');
  if (state.isConflict) decorations.push('warning');
  if (state.isFavorite) decorations.push('star');
  if (state.isVisited) decorations.push('check');
  return decorations;
}

// ── Legacy Full Resolution (compat) ───────────────────────────

export interface VisualGrammarInput {
  entityType: MapEntityType;
  ownershipSource: MapOwnershipSource;
  state: MapFeatureState;
  isEnriched: boolean;
  overrideColor?: string;
}

export interface VisualGrammarOutput {
  shape: MapFeature['shape'];
  fillColor: string;
  borderColor?: string;
  decoration: Decoration[];
}

/** @deprecated Use resolveMarkerGrammar() instead. */
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
