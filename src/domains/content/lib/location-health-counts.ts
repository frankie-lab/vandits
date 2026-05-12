/**
 * location-health-counts — UNIQUE source of truth for the per-bucket POI
 * counts shown next to the chips of the "Filtro de salud" axis.
 *
 * Reuses the canonical predicates from `point-health-rings.ts` so the
 * counters stay aligned with the visual rings drawn on each marker.
 *
 * Each location may belong to MULTIPLE buckets simultaneously
 * (e.g. `partial` + `review`), so the counts are not mutually exclusive
 * and do not need to add up to `total`.
 *
 * IMPORTANT: this helper does NOT filter. The caller is responsible for
 * passing the right universe (typically `filteredLocations` from the
 * Discovery store, which already respects Geo/Tipo/Tags/búsqueda but does
 * not apply `healthFilter` — keeping all buckets visible regardless of the
 * active chip).
 */

import { GeoLocation } from '@/types/location';
import {
  hasPartialGeo,
  hasBrokenGeoChain,
  hasReviewFailure,
  hasHardError,
} from './point-health-rings';

export interface HealthBucketCounts {
  total: number;
  partial: number;
  chain: number;
  review: number;
  hardError: number;
}

const EMPTY: HealthBucketCounts = {
  total: 0,
  partial: 0,
  chain: 0,
  review: 0,
  hardError: 0,
};

export function getHealthBucketCounts(
  locations: ReadonlyArray<GeoLocation> | null | undefined,
): HealthBucketCounts {
  if (!locations || locations.length === 0) return { ...EMPTY };

  let partial = 0;
  let chain = 0;
  let review = 0;
  let hardError = 0;

  for (const loc of locations) {
    if (hasPartialGeo(loc)) partial++;
    if (hasBrokenGeoChain(loc)) chain++;
    if (hasReviewFailure(loc)) review++;
    if (hasHardError(loc)) hardError++;
  }

  return {
    total: locations.length,
    partial,
    chain,
    review,
    hardError,
  };
}
