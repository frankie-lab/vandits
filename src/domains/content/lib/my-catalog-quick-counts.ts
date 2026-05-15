/**
 * my-catalog-quick-counts — Counts del subset "míos publicados" desglosado
 * por los dos ejes canónicos: `visualState` y `healthFilter`.
 *
 * Universo = locations con `is_approved=true` cuyo owner = currentUserId
 * (mismo criterio que `myCatalog` en `getBucketStats`).
 *
 * Single source of truth para el popover de filtros rápidos anclado al
 * contador verde de "mis POI" en `FloatingToolbar`.
 */
import type { GeoLocation } from '@/types/location';
import { getPointVisualState } from './point-visual-state';
import { getLocationOwnerUserId } from './location-owner';
import {
  hasPartialGeo,
  hasBrokenGeoChain,
  hasReviewFailure,
  hasHardError,
} from './point-health-rings';

export interface MyCatalogQuickCounts {
  all: number;
  enriched: number;
  imported: number;
  empty: number;
  partial: number;
  chain: number;
  review: number;
  hardError: number;
}

const EMPTY: MyCatalogQuickCounts = {
  all: 0,
  enriched: 0,
  imported: 0,
  empty: 0,
  partial: 0,
  chain: 0,
  review: 0,
  hardError: 0,
};

export function getMyCatalogQuickCounts(
  allLocations: ReadonlyArray<GeoLocation> | null | undefined,
  currentUserId: string | null | undefined,
): MyCatalogQuickCounts {
  if (!allLocations || allLocations.length === 0 || !currentUserId) {
    return { ...EMPTY };
  }

  const counts: MyCatalogQuickCounts = { ...EMPTY };

  for (const loc of allLocations) {
    if (!(loc as any).isApproved) continue;
    if (getLocationOwnerUserId(loc as any) !== currentUserId) continue;

    counts.all++;

    const vs = getPointVisualState(loc as any);
    if (vs === 'enriched') counts.enriched++;
    else if (vs === 'imported') counts.imported++;
    else if (vs === 'empty') counts.empty++;

    if (hasPartialGeo(loc)) counts.partial++;
    if (hasBrokenGeoChain(loc)) counts.chain++;
    if (hasReviewFailure(loc)) counts.review++;
    if (hasHardError(loc)) counts.hardError++;
  }

  return counts;
}
