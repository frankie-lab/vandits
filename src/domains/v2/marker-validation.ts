/**
 * VANDITS V2 — Marker Validation
 * 
 * Pure function that validates a MapFeature's domain-level coherence
 * BEFORE it reaches the grammar. Does NOT validate grammar output.
 * 
 * Returns { isValid: true } or { isValid: false, reason: string }.
 */

import type { MapFeature } from './types';
import type { MarkerValidationResult } from './marker-types';

// ── Incompatible flag combinations ────────────────────────────

interface FlagRule {
  entityType: MapFeature['entityType'];
  stateKey: keyof MapFeature['state'];
  reason: string;
}

const INCOMPATIBLE_FLAGS: FlagRule[] = [
  { entityType: 'place',    stateKey: 'isConflict', reason: 'Places do not have resolution conflicts' },
  { entityType: 'waypoint', stateKey: 'isVisited',  reason: 'Waypoints cannot be visited' },
  { entityType: 'waypoint', stateKey: 'isFavorite', reason: 'Waypoints cannot be favorited' },
  { entityType: 'track',    stateKey: 'isFavorite', reason: 'Tracks do not support favorites' },
  { entityType: 'track',    stateKey: 'isVisited',  reason: 'Tracks cannot be visited' },
  { entityType: 'track',    stateKey: 'isConflict', reason: 'Tracks do not have conflicts' },
];

// ── Main validator ────────────────────────────────────────────

export function validateFeature(feature: MapFeature): MarkerValidationResult {
  // 1. Check incompatible flag combinations
  for (const rule of INCOMPATIBLE_FLAGS) {
    if (feature.entityType === rule.entityType && feature.state[rule.stateKey]) {
      return { isValid: false, reason: rule.reason };
    }
  }

  // 2. Contextual coherence: document context requires documentId
  if (
    feature.renderContext === 'document' &&
    !feature.clickPayload.documentId
  ) {
    return {
      isValid: false,
      reason: 'renderContext is "document" but clickPayload.documentId is missing',
    };
  }

  // 3. Waypoints must be own (no shared imports yet)
  if (
    feature.entityType === 'waypoint' &&
    feature.ownershipSource !== 'own'
  ) {
    return {
      isValid: false,
      reason: `Waypoints must have ownershipSource "own", got "${feature.ownershipSource}"`,
    };
  }

  return { isValid: true };
}
