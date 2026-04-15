/**
 * VANDITS V2 — Marker Grammar Types
 * 
 * Shared types consumed by marker-validation, marker-grammar,
 * legacy-to-feature mapper, and hooks. No cyclic dependencies.
 */

import type { MapFeature } from './types';

// ── Shapes ────────────────────────────────────────────────────

export type MarkerShape = 'teardrop' | 'circle-solid' | 'circle-hollow' | 'circle-dashed';

// ── Decorations ───────────────────────────────────────────────

export type Decoration = 'halo' | 'check' | 'star' | 'warning';

// ── Validation ────────────────────────────────────────────────

export interface MarkerValidationResult {
  isValid: boolean;
  reason?: string;
}

// ── Grammar Output ────────────────────────────────────────────

/**
 * Pre-resolved visual instructions for a single map marker.
 * 
 * zIndex priority rules:
 * - selected:  +1000
 * - conflict:  +500
 * - teardrop:  +200  (enriched place shape)
 * - default:   +100
 */
export interface MarkerGrammarOutput {
  shape: MarkerShape;
  fillColor: string;
  borderColor?: string;
  decorations: Decoration[];
  zIndex: number;
}

// ── Discarded Feature ─────────────────────────────────────────

/** A feature rejected by validation, with its rejection reason. */
export interface DiscardedFeature {
  feature: MapFeature;
  reason: string;
}
