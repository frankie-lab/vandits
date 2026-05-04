/**
 * Filter presets — helpers ÚNICOS para resetear/normalizar `FilterCriteria`.
 *
 * Regla transversal: cualquier botón "Todos" / "Limpiar exploración" en la
 * UI debe pasar SIEMPRE por `resetExplorationFilters`. No reimplementar el
 * reseteo inline en componentes.
 *
 * Convención semántica:
 *   - "Exploration filters"  = lo que el usuario percibe como filtrado activo
 *     sobre el catálogo: search, placeType, tag(s), enrichment, verified,
 *     visited y resultados de búsqueda semántica.
 *   - NO se tocan: breadcrumbs geo (continent/country/...), classificationCode,
 *     ownership, hiddenFollowedUserIds, filterByUserId/DocumentId, sortMode.
 *     Esos son contexto de navegación, no filtros activos.
 */
import type { FilterCriteria } from '@/types/location';

const EXPLORATION_KEYS = [
  'searchTerm',
  'placeType',
  'tag',
  'tags',
  'onlyEnriched',
  'verified',
  'enrichmentStatus',
  'semanticResultIds',
] as const;

/**
 * Devuelve los filtros con todas las claves de "exploración" reseteadas.
 * `visitedFilter` se fuerza a 'all'.
 */
export function resetExplorationFilters(filters: FilterCriteria): FilterCriteria {
  const next: FilterCriteria = { ...filters };
  for (const key of EXPLORATION_KEYS) {
    delete (next as Record<string, unknown>)[key];
  }
  next.visitedFilter = 'all';
  return next;
}

/**
 * Cuenta cuántos filtros de exploración están activos (excluyendo
 * `visitedFilter`, que tiene su propia UI de toggle group).
 */
export function countActiveExplorationFilters(filters: FilterCriteria): number {
  let count = 0;
  if (filters.searchTerm) count++;
  if (filters.placeType) count++;
  if (filters.tag) count++;
  if (filters.tags && filters.tags.length > 0) count++;
  if (filters.onlyEnriched) count++;
  if (filters.verified !== undefined) count++;
  if (filters.enrichmentStatus) count++;
  if (filters.semanticResultIds && filters.semanticResultIds.length > 0) count++;
  return count;
}
