/**
 * filter-presets — API ÚNICA y transversal para resetear/contar filtros.
 *
 * NORMA "filter axes" (multiusuario, sin parches por componente):
 *
 *   UNIVERSO = todos los puntos del usuario
 *      |
 *      +-- Clasificación  (Geo / Tipo / Tags / Legacy + classificationCode)
 *      |   Pestañas. Combinables con todo. NO se tocan al "limpiar filtros".
 *      |
 *      +-- Estado  (chips deseleccionables, AND, todos opcionales)
 *      |     Visita        : visitedFilter            ('visited' | 'pending')
 *      |     Enriquecimiento: visualState             ('enriched' | 'imported' | 'empty')
 *      |     Verificado    : verified                 (boolean)
 *      |
 *      +-- Búsqueda / IA  (searchTerm, semanticResultIds)
 *
 * "Todos" NO es un filtro: es la ausencia de filtros de Estado/Búsqueda.
 *
 * Reglas:
 *   - Cualquier UI que limpie filtros DEBE usar uno de los helpers exportados.
 *   - Nunca limpiar inline con `setFilters({ ...filters, X: undefined })`
 *     cuando el reset cubra varios campos del mismo eje.
 *   - Las claves de Clasificación (geo, type, tag, classificationCode) NO se
 *     resetean salvo que se llame explícitamente `clearClassificationFilters`.
 */
import type { FilterCriteria } from '@/types/location';

/** Claves del eje "Estado" + búsqueda. Estas son las que limpia "Todos". */
const STATE_KEYS = [
  'searchTerm',
  'onlyEnriched',
  'verified',
  'enrichmentStatus',
  'visualState',
  'visitedFilter',
  'semanticResultIds',
] as const;

/** Claves del eje "Clasificación" (NO se tocan en resetAllFilters). */
const CLASSIFICATION_KEYS = [
  'placeType',
  'tag',
  'tags',
  'classificationCode',
] as const;

/** Claves del eje "Geografía" (breadcrumbs). NO se tocan en resetAllFilters. */
const GEOGRAPHY_KEYS = [
  'continent',
  'country',
  'region',
  'zone',
  'comarca',
  'localidad',
  'sublocalidad',
  'street',
] as const;

function deleteKeys(filters: FilterCriteria, keys: readonly string[]): FilterCriteria {
  const next: FilterCriteria = { ...filters };
  for (const key of keys) {
    delete (next as Record<string, unknown>)[key];
  }
  return next;
}

/**
 * Resetea TODOS los filtros de Estado + Búsqueda. Devuelve al "Universo Todos"
 * dentro de la clasificación y geografía actuales (que se mantienen intactas).
 *
 * Este es el helper que debe llamar el botón "Quitar filtros" de la barra.
 */
export function resetAllFilters(filters: FilterCriteria): FilterCriteria {
  const next = deleteKeys(filters, STATE_KEYS);
  // Forzar `visitedFilter` a 'all' por compatibilidad con código legacy que
  // todavía espera el literal en lugar de undefined.
  next.visitedFilter = 'all';
  return next;
}

/** Limpia solo el eje "Estado" (visita + enriquecimiento + verificado). */
export function clearStatusFilters(filters: FilterCriteria): FilterCriteria {
  const next = deleteKeys(filters, [
    'onlyEnriched',
    'verified',
    'enrichmentStatus',
    'visualState',
    'visitedFilter',
  ]);
  next.visitedFilter = 'all';
  return next;
}

/** Limpia solo el sub-eje "visita". */
export function clearVisitFilter(filters: FilterCriteria): FilterCriteria {
  const next: FilterCriteria = { ...filters };
  delete (next as Record<string, unknown>).visitedFilter;
  next.visitedFilter = 'all';
  return next;
}

/** Limpia solo el sub-eje "enriquecimiento" (visualState + flags legacy). */
export function clearEnrichmentFilter(filters: FilterCriteria): FilterCriteria {
  return deleteKeys(filters, [
    'visualState',
    'onlyEnriched',
    'verified',
    'enrichmentStatus',
  ]);
}

/** Limpia el eje "Clasificación" (raro: solo si la UI lo pide explícitamente). */
export function clearClassificationFilters(filters: FilterCriteria): FilterCriteria {
  return deleteKeys(filters, CLASSIFICATION_KEYS);
}

/** Limpia el eje "Geografía" (breadcrumbs). */
export function clearGeographyFilters(filters: FilterCriteria): FilterCriteria {
  return deleteKeys(filters, GEOGRAPHY_KEYS);
}

/**
 * Cuenta cuántos filtros de Estado + Búsqueda están activos.
 * Útil para el contador del botón "Quitar filtros (N)".
 */
export function countActiveStateFilters(filters: FilterCriteria): number {
  let count = 0;
  if (filters.searchTerm) count++;
  if (filters.visualState) count++;
  if (filters.onlyEnriched) count++;
  if (filters.verified !== undefined) count++;
  if (filters.enrichmentStatus) count++;
  if (filters.visitedFilter && filters.visitedFilter !== 'all') count++;
  if (filters.semanticResultIds && filters.semanticResultIds.length > 0) count++;
  return count;
}

// ============================================================================
// Aliases legacy (deprecated) — mantener hasta migrar todos los callers.
// ============================================================================

/** @deprecated Usa `resetAllFilters`. */
export const resetExplorationFilters = resetAllFilters;

/** @deprecated Usa `countActiveStateFilters`. */
export const countActiveExplorationFilters = countActiveStateFilters;

// ============================================================================
// Active filter chips — fuente única para la barra "Filtros activos".
// Cualquier eje (Geo / Tipo / Tags / Legacy / Búsqueda) se renderiza desde aquí.
// Añadir un nuevo eje = añadir una entrada en getActiveFilterChips + un caso
// en removeFilterChip. Nada más se toca en la UI.
// ============================================================================

export type FilterAxis = 'geography' | 'placeType' | 'tag' | 'classification' | 'search';

export type ActiveFilterChip = {
  /** Eje al que pertenece (controla color/icono en la UI). */
  axis: FilterAxis;
  /** Identificador estable (axis + valor). Útil como React key. */
  id: string;
  /** Texto visible en el chip. */
  label: string;
  /** Estado resultante al hacer clic en la X. */
  remove: (filters: FilterCriteria) => FilterCriteria;
};

/**
 * Devuelve los chips activos en orden canónico (Geo → Tipo → Tags → Legacy → Búsqueda).
 * `placeTypeLabel` y `classificationLabel` se pasan desde fuera para evitar
 * que este helper dependa de catálogos de etiquetas.
 */
export function getActiveFilterChips(
  filters: FilterCriteria,
  options: {
    placeTypeLabel?: (code: string) => string;
    classificationLabel?: (code: string) => string;
  } = {}
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  // Geo (un único chip que resume el breadcrumb)
  const geoParts = [
    filters.continent,
    filters.country,
    filters.region,
    filters.zone,
    filters.comarca,
    filters.localidad,
    filters.sublocalidad,
    filters.street,
  ].filter(Boolean) as string[];
  if (geoParts.length > 0) {
    chips.push({
      axis: 'geography',
      id: 'geography',
      label: geoParts.slice(-2).join(' › '),
      remove: clearGeographyFilters,
    });
  }

  // Tipo
  if (filters.placeType) {
    const code = filters.placeType;
    chips.push({
      axis: 'placeType',
      id: `placeType:${code}`,
      label: options.placeTypeLabel?.(code) ?? code,
      remove: (f) => {
        const next = { ...f };
        delete (next as Record<string, unknown>).placeType;
        return next;
      },
    });
  }

  // Tags — soporta `tag` (legacy single) y `tags[]` (multi)
  const tagsList: string[] = [];
  if (filters.tag) tagsList.push(filters.tag);
  if (Array.isArray(filters.tags)) {
    for (const t of filters.tags) if (t && !tagsList.includes(t)) tagsList.push(t);
  }
  for (const t of tagsList) {
    chips.push({
      axis: 'tag',
      id: `tag:${t}`,
      label: `#${t}`,
      remove: (f) => {
        const next = { ...f };
        if (next.tag === t) delete (next as Record<string, unknown>).tag;
        if (Array.isArray(next.tags)) {
          const filtered = next.tags.filter((x) => x !== t);
          if (filtered.length > 0) next.tags = filtered;
          else delete (next as Record<string, unknown>).tags;
        }
        return next;
      },
    });
  }

  // Legacy (classificationCode)
  if (filters.classificationCode) {
    const code = filters.classificationCode;
    chips.push({
      axis: 'classification',
      id: `classification:${code}`,
      label: options.classificationLabel?.(code) ?? code,
      remove: (f) => {
        const next = { ...f };
        delete (next as Record<string, unknown>).classificationCode;
        return next;
      },
    });
  }

  // Búsqueda
  if (filters.searchTerm) {
    const term = filters.searchTerm;
    chips.push({
      axis: 'search',
      id: 'search',
      label: `"${term}"`,
      remove: (f) => {
        const next = { ...f };
        delete (next as Record<string, unknown>).searchTerm;
        return next;
      },
    });
  }

  return chips;
}
