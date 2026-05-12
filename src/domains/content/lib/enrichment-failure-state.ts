/**
 * enrichment-failure-state — single source of truth for "what's the
 * operational health bucket for this point's last enrichment attempt?"
 *
 * v2 (Health Rings v2): we no longer collapse all failures into a single
 * "error" outline. The 8 `EnrichmentErrorKind`s map to two buckets:
 *
 *   - `review`    → soft / semantic failure (coherence, llm_unverifiable,
 *                   no_match). Magenta ring. Operational action: revisar.
 *   - `hardError` → hard / infrastructure failure (rate_limit, no_credits,
 *                   timeout, network, unknown). Red ring. Operational
 *                   action: reintentar.
 *
 * Rules:
 *  - Already-enriched points never show review/hardError rings (regla
 *    "verde nunca marca error" — si después se enriqueció, el fallo
 *    queda resuelto).
 *  - The actual failure record lives in the singleton `enrichmentFailureStore`
 *    populated by `prewarmFromRecentJobs()` on map mount and invalidated by
 *    realtime UPDATE / `location:enriched`.
 *  - Sync accessors — designed to be called inside `createCustomIcon` for
 *    thousands of markers without I/O.
 *
 * Helper único. Cualquier render de marcador que necesite saber "este punto
 * falló al enriquecer?" debe pasar por aquí. Ver
 * `mem://style/map/health-rings-rule` y
 * `mem://logic/enrichment/per-poi-recovery-block`.
 */

import { GeoLocation } from '@/types/location';
import { enrichmentFailureStore } from '@/domains/content/hooks/use-enrichment-failure';
import { isPointEnriched } from './point-visual-state';
import {
  COHERENCE_KINDS,
  HARD_ERROR_KINDS,
  type EnrichmentErrorKind,
} from './enrichment-error-kind';

export type EnrichmentFailureBucket = 'review' | 'hardError';

const REVIEW_KINDS = new Set<EnrichmentErrorKind>(COHERENCE_KINDS);
const HARD_KINDS = new Set<EnrichmentErrorKind>(HARD_ERROR_KINDS);

/**
 * Map a raw `EnrichmentErrorKind` → operational bucket. Helper único:
 * cualquier UI/marker debe pasar por aquí, no por listas duplicadas.
 */
export function bucketForKind(kind: EnrichmentErrorKind | null | undefined): EnrichmentFailureBucket | null {
  if (!kind) return null;
  if (REVIEW_KINDS.has(kind)) return 'review';
  if (HARD_KINDS.has(kind)) return 'hardError';
  return null;
}

/**
 * Backwards-compat: returns true if the point has ANY failure (review OR
 * hardError). Kept because some legacy call-sites (popup branches, badge
 * counters) just need a binary "did it fail?" answer.
 */
export function hasEnrichmentFailure(location: GeoLocation | null | undefined): boolean {
  if (!location?.id) return false;
  // Verde nunca marca error. Helper único `isPointEnriched` — NO usar
  // `location.enrichedData` truthy: hay stubs sin `descripcion`.
  if (isPointEnriched(location)) return false;
  return enrichmentFailureStore.hasFailureSync(location.id);
}

/**
 * Returns the operational bucket for the marker's outer ring. `null` =
 * no failure (or point already enriched, see "verde nunca marca error").
 */
export function getEnrichmentFailureBucket(
  location: GeoLocation | null | undefined,
): EnrichmentFailureBucket | null {
  if (!location?.id) return null;
  if (isPointEnriched(location)) return null;
  const parsed = enrichmentFailureStore.getCachedSync(location.id);
  if (!parsed) return null;
  return bucketForKind(parsed.kind);
}

/**
 * Returns the raw `EnrichmentErrorKind` for the most recent failure, or
 * `null` if none. Useful for popup/recovery UI that needs the exact reason.
 */
export function getEnrichmentFailureKind(
  location: GeoLocation | null | undefined,
): EnrichmentErrorKind | null {
  if (!location?.id) return null;
  if (isPointEnriched(location)) return null;
  const parsed = enrichmentFailureStore.getCachedSync(location.id);
  return parsed?.kind ?? null;
}

/**
 * Returns the `mismatchKind` for `coherence` failures only. Drives the
 * polaroid corner glyph in `rich` mode (MapPin vs Type).
 *
 * `llm_unverifiable` and `no_match` belong to the `review` bucket but do
 * NOT carry a `mismatchKind` — they get the magenta ring without a glyph.
 */
export function getCoherenceMismatchKind(
  location: GeoLocation | null | undefined,
): 'coordinate' | 'name' | null {
  if (!location?.id) return null;
  if (isPointEnriched(location)) return null;
  const parsed = enrichmentFailureStore.getCachedSync(location.id);
  if (!parsed || parsed.kind !== 'coherence') return null;
  return parsed.mismatchKind ?? null;
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
