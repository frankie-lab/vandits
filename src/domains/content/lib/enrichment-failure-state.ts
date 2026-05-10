/**
 * enrichment-failure-state — single source of truth for "does this point
 * deserve the red 5px outline on the map?".
 *
 * Rules:
 *  - Already-enriched points never show the error ring (regla "verde nunca
 *    marca error" — si después se enriqueció, el fallo queda resuelto).
 *  - The actual failure record lives in the singleton `enrichmentFailureStore`
 *    populated by `prewarmFromRecentJobs()` on map mount and invalidated by
 *    realtime UPDATE / `location:enriched`.
 *  - Sync accessor — designed to be called inside `createCustomIcon` for
 *    thousands of markers without I/O.
 *
 * Helper único. Cualquier render de marcador que necesite saber "este punto
 * falló al enriquecer?" debe pasar por aquí. Ver
 * `mem://style/map/error-outline-rule` y
 * `mem://logic/enrichment/per-poi-recovery-block`.
 */

import { GeoLocation } from '@/types/location';
import { enrichmentFailureStore } from '@/domains/content/hooks/use-enrichment-failure';
import { isPointEnriched } from './point-visual-state';

export function hasEnrichmentFailure(location: GeoLocation | null | undefined): boolean {
  if (!location?.id) return false;
  // Verde nunca marca error. Helper único `isPointEnriched` — NO usar
  // `location.enrichedData` truthy: hay stubs sin `descripcion`.
  if (isPointEnriched(location)) return false;
  return enrichmentFailureStore.hasFailureSync(location.id);
}

/**
 * Subscribe to failure-store changes (prewarm finished, realtime invalidated,
 * etc.). Wrapper to avoid leaking the store to map code.
 */
export function subscribeFailureChange(cb: () => void): () => void {
  return enrichmentFailureStore.subscribe(cb);
}

/** Pre-warm the cache. Call once on map mount. */
export function prewarmEnrichmentFailures(jobLimit = 20): Promise<void> {
  return enrichmentFailureStore.prewarmFromRecentJobs(jobLimit);
}
