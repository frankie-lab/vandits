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
 *   5. rootStatus D + filter ∈ {hardError, review} → `nonRepairableByType`.
 *
 *   Modo agregado (`filter = 'debt'`, fix de wiring "Resolver deuda"):
 *     - rootStatus D con ring `partial` o `chain` → `repairable`.
 *       Se splittea por bucket REAL en `repairablePartialIds` /
 *       `repairableChainIds` para que el RPC reciba el `_action` correcto.
 *       Partial gana si coexisten (evita doble enqueue).
 *     - rootStatus D con sólo `review`/`hardError`/sin rings →
 *       `nonRepairableByType` (no entra a RPC).
 *
 * Invariantes (cubiertas por tests):
 *   - `repairableIds` SOLO contiene D ∩ {partial, chain}.
 *   - A/B/C nunca aparecen en `repairableIds`, sea cual sea el filter.
 *   - filter ∈ {hardError, review} nunca produce repairableIds.
 *   - En modo `'debt'`, `repairableIds = repairablePartialIds ∪ repairableChainIds`
 *     y ningún id aparece en ambos (partial gana).
 *   - La suma de los 5 grupos == scope.total (partición sin solapes).
 *   - El helper NO toca marker fill ni POI-N.
 *
 * Consumido por `HealthRepairPreviewDialog`. NO lo usa el RPC: el filtrado
 * defensivo del lado server (`enqueue_health_repair`) sigue siendo SoT.
 */
import type { GeoLocation, HealthFilter } from '@/types/location';
import { classifyPoiRootStatusForLocation } from '@/domains/content/lib/poi-identity-root-status-client';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';

export type RepairGroupKey =
  | 'repairable'
  | 'systemDebt'
  | 'review'
  | 'identityIncomplete'
  | 'nonRepairableByType';

/**
 * Modo agregado del modal "Resolver deuda" (no es un HealthFilter real).
 * Se mapea per-loc a partial/chain según rings reales del POI.
 */
export type RepairFilterMode = HealthFilter | 'debt';

export interface RepairPartition {
  repairable: GeoLocation[];
  systemDebt: GeoLocation[];
  review: GeoLocation[];
  identityIncomplete: GeoLocation[];
  nonRepairableByType: GeoLocation[];
  /** D ∩ {partial, chain} — único conjunto que llega al RPC. */
  repairableIds: string[];
  /**
   * Subdivisión por bucket real del ring. En modos puntuales partial/chain
   * uno de los dos coincide con `repairableIds` y el otro queda vacío. En
   * modos hardError/review/debt-sin-rings ambos quedan vacíos.
   */
  repairablePartialIds: string[];
  repairableChainIds: string[];
  total: number;
}

const REPAIRABLE_FILTERS: ReadonlySet<HealthFilter> = new Set<HealthFilter>([
  'partial',
  'chain',
]);

export function partitionRepairScopeByRootStatus(
  locations: GeoLocation[],
  filter: RepairFilterMode,
): RepairPartition {
  const repairable: GeoLocation[] = [];
  const systemDebt: GeoLocation[] = [];
  const review: GeoLocation[] = [];
  const identityIncomplete: GeoLocation[] = [];
  const nonRepairableByType: GeoLocation[] = [];
  const repairablePartialIds: string[] = [];
  const repairableChainIds: string[] = [];

  const isDebtMode = filter === 'debt';
  const filterIsRepairable =
    !isDebtMode && REPAIRABLE_FILTERS.has(filter as HealthFilter);

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
      if (isDebtMode) {
        const rings = getPointHealthRings(loc);
        const isPartial = rings.includes('partial');
        const isChain = rings.includes('chain');
        if (isPartial || isChain) {
          repairable.push(loc);
          // Partial gana si coexiste — evita doble encolado del mismo id.
          if (isPartial) repairablePartialIds.push(loc.id);
          else repairableChainIds.push(loc.id);
        } else {
          nonRepairableByType.push(loc);
        }
      } else if (filterIsRepairable) {
        repairable.push(loc);
        if (filter === 'partial') repairablePartialIds.push(loc.id);
        else repairableChainIds.push(loc.id);
      } else {
        nonRepairableByType.push(loc);
      }
    }
  }

  return {
    repairable,
    systemDebt,
    review,
    identityIncomplete,
    nonRepairableByType,
    repairableIds: repairable.map((l) => l.id),
    repairablePartialIds,
    repairableChainIds,
    total: locations.length,
  };
}
