// Domain: Content — enrichment criteria evaluation helpers
import { GeoLocation, EnrichmentStatusFilter } from '@/types/location';

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
  if (!loc.enrichedData?.descripcion) return false;

  const criteriaTimestamp = loadCriteriaTimestamp();
  if (criteriaTimestamp === 0) return true;

  const locationUpdatedAt = loc.updatedAt instanceof Date
    ? loc.updatedAt.getTime()
    : new Date(loc.updatedAt).getTime();

  return locationUpdatedAt >= criteriaTimestamp;
}

export function getLocationEnrichmentStatus(loc: GeoLocation): EnrichmentStatusFilter {
  if (loc.enrichedData?.descripcion && meetsCriteria(loc)) return 'current';
  if (loc.enrichedData?.descripcion) return 'previous';
  if (loc.description && loc.description.trim().length > 0) return 'unknown';
  return 'new';
}
