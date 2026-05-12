/**
 * point-health-rings — UNIQUE source of truth for the operative "health
 * outline" modifiers that decorate a marker on top of its base palette.
 *
 * v2 (Health Rings v2): 4 anillos concéntricos de 5px, apilados POR FUERA
 * del marker base y del `collection-tint-ring` (tinte de colección). Nunca
 * sustituyen al stroke blanco interior ni al tinte — son una capa puramente
 * aditiva que desaparece cuando el problema se resuelve.
 *
 *   partial   → amber claro `--poi-health-partial`
 *               · `loc.geoHealth === 'partial'`
 *               · Significa: faltan niveles administrativos (rellenar huecos).
 *   chain     → amarillo `--poi-health-chain`
 *               · `loc.geoHealth ∈ {'broken','stale_name'}`
 *               · Significa: cadena admin rota / nombre desactualizado.
 *               · Aplica también a verdes (un punto enriquecido puede
 *                 mantener la cadena rota hasta que pase repair).
 *   review    → magenta `--poi-health-review`
 *               · enrichmentFailureStore.kind ∈
 *                   {'coherence','llm_unverifiable','no_match'}
 *               · Significa: revisar manualmente (coords/nombre/sin verificar).
 *               · NO es un fallo técnico — es un conflicto semántico.
 *   hardError → rojo `--poi-health-hard-error`
 *               · enrichmentFailureStore.kind ∈
 *                   {'rate_limit','no_credits','timeout','network','unknown'}
 *               · Significa: fallo técnico — reintentar.
 *
 * Orden devuelto: de DENTRO hacia FUERA → `[partial, chain, review, hardError]`
 * filtrado. El renderer dibuja en ese orden, dejando el más severo (rojo)
 * en el aro más externo.
 *
 * Verde nunca marca `review` ni `hardError` (regla `isPointEnriched`,
 * heredada vía `getEnrichmentFailureBucket`). Sí puede marcar `partial`
 * o `chain` (problema geográfico independiente del enriquecimiento).
 *
 * Bandas: los rings se pintan SOLO cuando `renderMode ∈ {standard, rich}`.
 * Esa condición vive en `createCustomIcon` y depende de `renderMode`, no de
 * umbrales de zoom hardcodeados.
 *
 * Ver `mem://style/map/health-rings-rule`.
 */

import { GeoLocation } from '@/types/location';
import {
  getEnrichmentFailureBucket,
  getCoherenceMismatchKind,
} from './enrichment-failure-state';
import { getPointVisualState } from './point-visual-state';

export type HealthRing = 'partial' | 'chain' | 'review' | 'hardError';

/**
 * Color CSS por ring. Los nombres `--poi-health-*` se generan desde
 * `src/design-system/tokens/source/poi.json` → `poi.health.*`. Cero hex
 * hardcoded: cualquier ajuste de color debe pasar por el JSON + rebuild.
 */
export const RING_COLORS: Record<HealthRing, string> = {
  partial:   'hsl(var(--poi-health-partial))',
  chain:     'hsl(var(--poi-health-chain))',
  review:    'hsl(var(--poi-health-review))',
  hardError: 'hsl(var(--poi-health-hard-error))',
};

export const RING_WIDTH = 5;

/** Order canónico (inner → outer). El renderer dibuja en este orden. */
const RING_ORDER: readonly HealthRing[] = ['partial', 'chain', 'review', 'hardError'];

// ── Predicados granulares (helpers únicos, exportados para tests/UI) ────

export function hasPartialGeo(loc: GeoLocation | null | undefined): boolean {
  return loc?.geoHealth === 'partial';
}

export function hasBrokenGeoChain(loc: GeoLocation | null | undefined): boolean {
  const h = loc?.geoHealth;
  return h === 'broken' || h === 'stale_name';
}

/** Soft / semantic review (coords-name mismatch, no_match, llm_unverifiable). */
export function hasReviewFailure(loc: GeoLocation | null | undefined): boolean {
  return getEnrichmentFailureBucket(loc) === 'review';
}

/** Hard / infrastructure failure (timeout, rate limit, network, etc). */
export function hasHardError(loc: GeoLocation | null | undefined): boolean {
  return getEnrichmentFailureBucket(loc) === 'hardError';
}

/**
 * Compatibilidad: el helper antiguo `hasEmptyContent` quedaba ligado al
 * estado base `empty`. En v2 el ring `empty` desaparece (el estado vacío
 * ya se ve en el `fill_color` naranja del marker base). Lo dejamos aquí
 * como utilidad para tests/legacy lookups, pero NO genera ya un ring.
 */
export function hasEmptyContent(loc: GeoLocation | null | undefined): boolean {
  if (!loc) return false;
  return getPointVisualState(loc) === 'empty';
}

/**
 * Returns the health rings that apply to this point, ordered from INNER
 * to OUTER. Empty array if the point is fully healthy.
 */
export function getPointHealthRings(loc: GeoLocation | null | undefined): HealthRing[] {
  if (!loc) return [];
  const rings: HealthRing[] = [];
  if (hasPartialGeo(loc)) rings.push('partial');
  if (hasBrokenGeoChain(loc)) rings.push('chain');
  const failureBucket = getEnrichmentFailureBucket(loc);
  if (failureBucket === 'review') rings.push('review');
  else if (failureBucket === 'hardError') rings.push('hardError');
  // Already in canonical inner→outer order by construction.
  return rings.sort((a, b) => RING_ORDER.indexOf(a) - RING_ORDER.indexOf(b));
}

// ── Coherence glyph overlay (rich mode only) ───────────────────────────

export type CoherenceGlyph = 'coordinate' | 'name';

/**
 * Returns the glyph variant for the polaroid corner overlay.
 * - Only fires when bucket is `review` AND original kind is `coherence`
 *   AND `mismatchKind` is set.
 * - `llm_unverifiable` and `no_match` do NOT trigger a glyph (they share
 *   the magenta `review` ring but no fine-grained sub-state).
 * Returns `null` for everything else.
 */
export function getCoherenceGlyph(
  loc: GeoLocation | null | undefined,
): CoherenceGlyph | null {
  return getCoherenceMismatchKind(loc);
}

/**
 * Lucide path data — embedded as static strings so the divIcon HTML can
 * inline them without instantiating React components per marker.
 *
 * Sources (Lucide v0.462+):
 *  - MapPin: pin / coordinate-mismatch glyph.
 *  - Type:   "Aa" / name-mismatch glyph.
 */
export const COHERENCE_GLYPH_PATH_COORDINATE = `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>`;

export const COHERENCE_GLYPH_PATH_NAME = `<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>`;

export function getCoherenceGlyphPath(g: CoherenceGlyph): string {
  return g === 'coordinate' ? COHERENCE_GLYPH_PATH_COORDINATE : COHERENCE_GLYPH_PATH_NAME;
}
