// Domain: Content — enrichment criteria evaluation helpers
//
// Las preguntas "¿está enriquecido?" / "¿tiene description importada?"
// se delegan al helper canónico (`enrichment-state.ts`) para que TODA la app
// use la misma definición. Aquí solo añadimos la dimensión temporal
// (`current` vs `previous`) basada en el timestamp de criterios.
import { GeoLocation, EnrichmentStatusFilter } from '@/types/location';
import {
  hasRealEnrichment,
  hasImportedDescription,
} from '@/domains/content/lib/enrichment-state';

function loadCriteriaTimestamp(): number {
  try {
    const stored = localStorage.getItem('geodata-enrichment-criteria');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed._updatedAt || 0;
    }
  } catch (e) {}
  return 0;
}

export function meetsCriteria(loc: GeoLocation): boolean {
  if (!hasRealEnrichment(loc)) return false;

  const criteriaTimestamp = loadCriteriaTimestamp();
  if (criteriaTimestamp === 0) return true;

  const locationUpdatedAt = loc.updatedAt instanceof Date
    ? loc.updatedAt.getTime()
    : new Date(loc.updatedAt).getTime();

  return locationUpdatedAt >= criteriaTimestamp;
}

export function getLocationEnrichmentStatus(loc: GeoLocation): EnrichmentStatusFilter {
  if (hasRealEnrichment(loc) && meetsCriteria(loc)) return 'current';
  if (hasRealEnrichment(loc)) return 'previous';
  if (hasImportedDescription(loc)) return 'unknown';
  return 'new';
}
