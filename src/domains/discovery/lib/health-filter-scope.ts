/**
 * health-filter-scope — Helper único para resolver el subconjunto sobre el
 * que actuará el CTA contextual del eje "Salud" en FilterBar.
 *
 * PR-3A: sólo lectura. El subconjunto se usa para previsualizar (lista de
 * los 10 primeros + total). NUNCA escribe en BD.
 *
 * Reglas (precedencia):
 *   1. selectedLocations no vacío  → mode='selection', ids = sel ∩ filtered
 *   2. onlyVisible === true        → mode='viewport',  ids = vis ∩ filtered
 *   3. default                     → mode='filtered',  ids = filtered (que pasen healthFilter)
 *   4. healthFilter null           → ids vacío (CTA oculto)
 *
 * Garantías estructurales:
 *   - Scope NUNCA cae en `markerLocations` salvo opt-in explícito vía toggle.
 *   - Verde nunca aparece en review/hardError porque getPointHealthRings
 *     ya lo excluye (consecuencia, no regla del filtro).
 *
 * Ver `mem://logic/discovery/health-filter-axis`.
 */

import type { GeoLocation, HealthFilter } from '@/types/location';
import {
  getPointHealthRings,
  isHealthRingRepairableByCaller,
} from '@/domains/content/lib/point-health-rings';

export type ScopeMode = 'filtered' | 'selection' | 'viewport';

export interface HealthScopeCtx {
  filteredLocations: GeoLocation[];
  selectedLocationIds: Set<string>;
  visibleLocationIds: Set<string>;
  healthFilter: HealthFilter | null | undefined;
  onlyVisible: boolean;
  /**
   * Caller actual. Necesario para distinguir "salud visible" (todos) de
   * "reparable por mí" (sólo propios). Si es null/undefined, `repairableIds`
   * sale vacío.
   */
  currentUserId?: string | null;
}

export interface HealthScopeResult {
  /** Universo del subconjunto (incluye seguidos). "Salud visible". */
  ids: string[];
  total: number;
  mode: ScopeMode;
  /** Subconjunto materializado (mismo orden que filteredLocations). */
  locations: GeoLocation[];
  /**
   * Subconjunto realmente accionable por el caller (propios + ring partial/chain).
   * Lo que se envía al RPC. Para `review`/`hardError` siempre es vacío
   * (van por flujo per-POI).
   */
  repairableIds: string[];
  repairableCount: number;
}

const EMPTY: HealthScopeResult = {
  ids: [],
  total: 0,
  mode: 'filtered',
  locations: [],
  repairableIds: [],
  repairableCount: 0,
};

export function getHealthFilterScopeIds(ctx: HealthScopeCtx): HealthScopeResult {
  const hf = ctx.healthFilter ?? null;
  if (!hf) return EMPTY;

  // 1. Universo lógico: filteredLocations cuyo health rings incluya hf.
  //    Verde se excluye automáticamente de review/hardError vía helper.
  const matching = ctx.filteredLocations.filter((loc) =>
    getPointHealthRings(loc).includes(hf),
  );

  // 2. Resolución de modo (precedencia: selection > viewport > filtered).
  let mode: ScopeMode = 'filtered';
  let subset = matching;

  if (ctx.selectedLocationIds.size > 0) {
    mode = 'selection';
    subset = matching.filter((l) => ctx.selectedLocationIds.has(l.id));
  } else if (ctx.onlyVisible) {
    mode = 'viewport';
    subset = matching.filter((l) => ctx.visibleLocationIds.has(l.id));
  }

  // 3. Subconjunto reparable por el caller (propios + partial|chain).
  const repairable =
    hf === 'partial' || hf === 'chain'
      ? subset.filter((l) => isHealthRingRepairableByCaller(l, ctx.currentUserId))
      : [];

  return {
    ids: subset.map((l) => l.id),
    total: subset.length,
    mode,
    locations: subset,
    repairableIds: repairable.map((l) => l.id),
    repairableCount: repairable.length,
  };
}

/** Etiqueta de modo para UI (sin emojis, sin tokens duros). */
export function scopeModeLabel(mode: ScopeMode): string {
  switch (mode) {
    case 'selection': return 'selección manual';
    case 'viewport':  return 'sólo visibles';
    case 'filtered':
    default:          return 'filtro activo';
  }
}
