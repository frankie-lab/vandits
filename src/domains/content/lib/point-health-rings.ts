/**
 * point-health-rings — UNIQUE source of truth for the "health outline"
 * modifiers that decorate a marker on top of its base palette.
 *
 * Tres anillos concéntricos de 5px, apilados POR FUERA del marker base y del
 * `collection-tint-ring` (color de colección/grado de catálogo). Nunca
 * sustituyen al stroke blanco interior ni al tinte de colección — son una
 * capa puramente aditiva que desaparece cuando el problema se ha resuelto.
 *
 *   error  → rojo    `#dc2626`  · `hasEnrichmentFailure(loc)` (job reciente
 *                                  marcó este id en `error_ids` y el punto
 *                                  no está enriquecido).
 *   chain  → amarillo `#eab308`  · `loc.geoHealth ∈ {'broken','stale_name'}`.
 *                                  Aplica también a verdes: un punto
 *                                  enriquecido puede seguir con la cadena
 *                                  admin rota hasta que pase `repair`.
 *   empty  → naranja `#f97316`  · `getPointVisualState(loc) === 'empty'`
 *                                  (sin descripción ni enriquecimiento).
 *
 * Orden devuelto: de DENTRO hacia FUERA → `['empty','chain','error']`
 * filtrado. El renderer dibuja los anillos en ese orden, dejando el más
 * severo (rojo) en el aro más externo.
 *
 * Ver `mem://style/map/health-rings-rule`.
 */

import { GeoLocation } from '@/types/location';
import { hasEnrichmentFailure } from './enrichment-failure-state';
import { getPointVisualState } from './point-visual-state';

export type HealthRing = 'empty' | 'chain' | 'error';

export const RING_COLORS: Record<HealthRing, string> = {
  empty: '#f97316',
  chain: '#eab308',
  error: '#dc2626',
};

export const RING_WIDTH = 5;

export function hasBrokenGeoChain(loc: GeoLocation | null | undefined): boolean {
  const h = loc?.geoHealth;
  return h === 'broken' || h === 'stale_name';
}

export function hasEmptyContent(loc: GeoLocation | null | undefined): boolean {
  if (!loc) return false;
  return getPointVisualState(loc) === 'empty';
}

/**
 * Returns the health rings that apply to this point, ordered from INNER to
 * OUTER. Empty array if the point is fully healthy.
 */
export function getPointHealthRings(loc: GeoLocation | null | undefined): HealthRing[] {
  if (!loc) return [];
  const rings: HealthRing[] = [];
  if (hasEmptyContent(loc)) rings.push('empty');
  if (hasBrokenGeoChain(loc)) rings.push('chain');
  if (hasEnrichmentFailure(loc)) rings.push('error');
  return rings;
}
