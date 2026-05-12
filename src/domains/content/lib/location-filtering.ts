import type { FilterCriteria, GeoLocation } from '@/types/location';
import { getEffectivePlaceType } from '@/domains/content/lib/effective-place-type';
import { getLocationHierarchy, isPlaceholderValue } from '@/shared/geography/hierarchy';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';

/**
 * Matcher ÚNICO para filtros de exploración/navegación sobre un punto.
 *
 * Regla transversal multiusuario: mapa, lista y paneles de filtros deben
 * delegar SIEMPRE aquí para decidir si un punto entra o no en un subconjunto.
 * Nunca reimplementar checks inline por componente.
 *
 * Ejes activos: clasificación (geo, tipo, tags, código), búsqueda y
 * resultados semánticos. Los ejes de estado (visitado, enriquecido,
 * importado, vacío) fueron retirados — "Todos" muestra el universo completo.
 */

function matchesSearchTerm(loc: GeoLocation, searchTerm?: string): boolean {
  if (!searchTerm) return true;
  const search = searchTerm.toLowerCase();
  return !!(
    loc.name.toLowerCase().includes(search) ||
    loc.description?.toLowerCase().includes(search) ||
    loc.enrichedData?.nombre_lugar?.toLowerCase().includes(search) ||
    loc.enrichedData?.descripcion?.toLowerCase().includes(search) ||
    loc.enrichedData?.punto_destacado?.toLowerCase().includes(search) ||
    loc.enrichedData?.etiquetas?.some((t) => t.toLowerCase().includes(search)) ||
    loc.enrichedData?.datos_clave?.tipo?.toLowerCase().includes(search)
  );
}

function matchesTags(loc: GeoLocation, tags: string[]): boolean {
  if (tags.length === 0) return true;
  if (!loc.enrichedData?.etiquetas) return false;
  const locTags = loc.enrichedData.etiquetas.map((t) => t.toLowerCase().replace('#', ''));
  return tags.every((filterTag) =>
    locTags.some((locTag) => locTag === filterTag.toLowerCase().replace('#', '')),
  );
}

export function matchesLocationFilters(
  loc: GeoLocation,
  filters: FilterCriteria,
  options?: {
    includeGeo?: boolean;
    includeClassification?: boolean;
    includeExploration?: boolean;
    includeSemanticResults?: boolean;
    includeVisited?: boolean;
    /** Sub-eje de exploración: aplicar el filtro `placeType`. Default true. */
    includePlaceType?: boolean;
    /** Sub-eje de exploración: aplicar el filtro `tag`/`tags`. Default true. */
    includeTags?: boolean;
    /** Aplicar el eje de Salud operativa (Health Rings v2). Default true.
     *  Los chips del eje Salud lo desactivan para calcular sus counts sobre
     *  el universo SIN healthFilter (evita que se canibalicen entre sí). */
    includeHealth?: boolean;
  },
): boolean {
  const {
    includeGeo = true,
    includeClassification = true,
    includeExploration = true,
    includeSemanticResults = true,
    includePlaceType = true,
    includeTags = true,
    includeHealth = true,
  } = options ?? {};

  const {
    continent,
    country,
    region,
    zone,
    comarca,
    localidad,
    sublocalidad,
    street,
    classificationCode,
    searchTerm,
    placeType,
    tag,
    tags,
    semanticResultIds,
  } = filters;

  // NORMA TRANSVERSAL: los ejes de estado (visitedFilter, visualState,
  // enrichmentStatus, onlyEnriched, verified) han sido eliminados de la UI
  // y NO se aplican como filtro. "Todos" = universo completo de puntos.

  if (includeExploration) {
    if (includePlaceType && placeType && getEffectivePlaceType(loc) !== placeType) return false;
    if (includeTags) {
      const activeTags = tag ? [tag] : tags || [];
      if (!matchesTags(loc, activeTags)) return false;
    }
    if (!matchesSearchTerm(loc, searchTerm)) return false;
  }

  if (includeSemanticResults && semanticResultIds && semanticResultIds.length > 0) {
    if (!semanticResultIds.includes(loc.id)) return false;
  }

  if (includeGeo) {
    const hierarchy = getLocationHierarchy(loc);
    // Match-helper: si el filtro es un placeholder `(sin ...)`, machea
    // cualquier valor ausente (NULL o el propio placeholder en BD).
    const matchLevel = (filterVal: string | undefined, locVal: string | undefined) => {
      if (!filterVal) return true;
      if (isPlaceholderValue(filterVal)) return locVal == null;
      return locVal === filterVal;
    };
    if (continent === '__unclassified__') {
      if (hierarchy.continent && hierarchy.country) return false;
    } else {
      if (!matchLevel(continent, hierarchy.continent)) return false;
      if (!matchLevel(country, hierarchy.country)) return false;
      if (!matchLevel(region, hierarchy.region)) return false;
      if (!matchLevel(zone, hierarchy.zone)) return false;
    }
    if (!matchLevel(comarca, hierarchy.admin_level_3)) return false;
    if (!matchLevel(localidad, hierarchy.locality)) return false;
    if (!matchLevel(sublocalidad, hierarchy.sublocality)) return false;
    if (!matchLevel(street, hierarchy.street)) return false;
  }

  if (includeClassification && classificationCode) {
    const locCode = loc.enrichedData?.clasificacion?.codigo;
    if (classificationCode === '__unclassified__') {
      if (!loc.enrichedData || locCode) return false;
    } else if (!locCode || !locCode.startsWith(classificationCode)) {
      return false;
    }
  }

  // Eje "Salud operativa" (Health Rings v2). Delega 100% en
  // getPointHealthRings(loc). NO duplicamos predicados aquí: si un POI
  // enriquecido no marca review/hardError es porque el helper no lo
  // devuelve, no porque el filtro lo bloquee.
  if (filters.healthFilter) {
    const rings = getPointHealthRings(loc);
    if (!rings.includes(filters.healthFilter)) return false;
  }

  return true;
}