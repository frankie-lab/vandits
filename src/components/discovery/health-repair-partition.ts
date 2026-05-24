/**
 * health-repair-partition — Helper único de partición del scope de reparación
 * por Root Status A/B/C/D (PR-FILTER-ROOTSTATUS-2.1).
 *
 * Reglas (orden de precedencia):
 *   1. rootStatus A → `identityIncomplete` (completar identidad manual).
 *   2. rootStatus B → `systemDebt` (canon/backfill por sistema).
 *   3. rootStatus C → `review` (revisar manualmente).
 *   4. rootStatus D + filter ∈ {partial, chain} → `repairable`
 *      (UNICO grupo que entra en `enqueue_health_repair`).
 *   5. rootStatus D + filter ∈ {hardError, review} → `nonRepairableByType`
 *      (no se encolan; van por flujo per-POI).
 *
 * Invariantes (cubiertas por tests):
 *   - `repairableIds` SOLO contiene D ∩ {partial, chain}.
 *   - A/B/C nunca aparecen en `repairableIds`, sea cual sea el filter.
 *   - filter ∈ {hardError, review} nunca produce repairableIds.
 *   - La suma de los 5 grupos == scope.total (partición sin solapes).
 *   - El helper NO toca marker fill ni POI-N.
 *
 * Consumido por `HealthRepairPreviewDialog`. NO lo usa el RPC: el filtrado
 * defensivo del lado server (`enqueue_health_repair`) sigue siendo SoT.
 */
import type { GeoLocation, HealthFilter } from '@/types/location';
import { classifyPoiRootStatusForLocation } from '@/domains/content/lib/poi-identity-root-status-client';

export type RepairGroupKey =
  | 'repairable'
  | 'systemDebt'
  | 'review'
  | 'identityIncomplete'
  | 'nonRepairableByType';

export interface RepairPartition {
  repairable: GeoLocation[];
  systemDebt: GeoLocation[];
  review: GeoLocation[];
  identityIncomplete: GeoLocation[];
  nonRepairableByType: GeoLocation[];
  repairableIds: string[];
  total: number;
}

const REPAIRABLE_FILTERS: ReadonlySet<HealthFilter> = new Set<HealthFilter>([
  'partial',
  'chain',
]);

export function partitionRepairScopeByRootStatus(
  locations: GeoLocation[],
  filter: HealthFilter,
): RepairPartition {
  const repairable: GeoLocation[] = [];
  const systemDebt: GeoLocation[] = [];
  const review: GeoLocation[] = [];
  const identityIncomplete: GeoLocation[] = [];
  const nonRepairableByType: GeoLocation[] = [];

  const filterIsRepairable = REPAIRABLE_FILTERS.has(filter);

  for (const loc of locations) {
    const { rootStatus } = classifyPoiRootStatusForLocation(loc);
    if (rootStatus === 'A') {
      identityIncomplete.push(loc);
    } else if (rootStatus === 'B') {
      systemDebt.push(loc);
    } else if (rootStatus === 'C') {
      review.push(loc);
    } else {
      // rootStatus === 'D'
      if (filterIsRepairable) repairable.push(loc);
      else nonRepairableByType.push(loc);
    }
  }

  return {
    repairable,
    systemDebt,
    review,
    identityIncomplete,
    nonRepairableByType,
    repairableIds: repairable.map((l) => l.id),
    total: locations.length,
  };
}
