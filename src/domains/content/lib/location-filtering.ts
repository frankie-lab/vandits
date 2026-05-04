import type { FilterCriteria, GeoLocation } from '@/types/location';
import { getEffectivePlaceType } from '@/domains/content/lib/effective-place-type';
import { getLocationEnrichmentStatus } from '@/domains/content/store/enrichment-helpers';
import { getLocationHierarchy } from '@/shared/geography/hierarchy';
import { getPointVisualState } from '@/domains/content/lib/point-visual-state';

/**
 * Matcher ÚNICO para filtros de exploración/navegación sobre un punto.
 *
 * Regla transversal multiusuario: mapa, lista y paneles de filtros deben
 * delegar SIEMPRE aquí para decidir si un punto entra o no en un subconjunto.
 * Nunca reimplementar checks inline por componente.
 */

function hasVisited(loc: GeoLocation): boolean {
  const visitedValue = loc.customData?.visited;
  return visitedValue === 'true' || String(visitedValue) === 'true';
}

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
  },
): boolean {
  const {
    includeGeo = true,
    includeClassification = true,
    includeExploration = true,
    includeSemanticResults = true,
    includeVisited = true,
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
  // Mantener su lectura aquí provocaría filtros fantasma si quedaran valores
  // residuales en el store. Se ignoran a propósito.

  if (includeExploration) {
    if (placeType && getEffectivePlaceType(loc) !== placeType) return false;
    const activeTags = tag ? [tag] : tags || [];
    if (!matchesTags(loc, activeTags)) return false;
    if (!matchesSearchTerm(loc, searchTerm)) return false;
  }

  if (includeSemanticResults && semanticResultIds && semanticResultIds.length > 0) {
    if (!semanticResultIds.includes(loc.id)) return false;
  }

  if (includeGeo) {
    const hierarchy = getLocationHierarchy(loc);
    if (continent === '__unclassified__') {
      if (hierarchy.continent && hierarchy.country) return false;
    } else {
      if (continent && hierarchy.continent !== continent) return false;
      if (country && hierarchy.country !== country) return false;
      if (region && hierarchy.region !== region) return false;
      if (zone && hierarchy.zone !== zone) return false;
    }
    if (comarca && hierarchy.admin_level_3 !== comarca) return false;
    if (localidad && hierarchy.locality !== localidad) return false;
    if (sublocalidad && hierarchy.sublocality !== sublocalidad) return false;
    if (street && hierarchy.street !== street) return false;
  }

  if (includeClassification && classificationCode) {
    const locCode = loc.enrichedData?.clasificacion?.codigo;
    if (classificationCode === '__unclassified__') {
      if (!loc.enrichedData || locCode) return false;
    } else if (!locCode || !locCode.startsWith(classificationCode)) {
      return false;
    }
  }

  return true;
}