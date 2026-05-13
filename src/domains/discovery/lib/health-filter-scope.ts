/**
 * health-filter-scope — Helper único para resolver el subconjunto sobre el
 * que actuará el CTA contextual del eje "Salud" en FilterBar.
 *
 * Sólo lectura: el subconjunto se usa para previsualizar (lista + total).
 * NUNCA escribe en BD.
 *
 * Reglas (precedencia):
 *   1. selectedLocations no vacío  → mode='selection', ids = sel ∩ filtered
 *   2. onlyVisible === true        → mode='viewport',  ids = vis ∩ filtered
 *   3. default                     → mode='filtered',  ids = filtered (que pasen healthFilter)
 *   4. healthFilter null           → ids vacío (CTA oculto)
 *
 * PR-1 curated sharing (2026-05-13): la noción de "repairableIds" desaparece.
 * Tras la curated boundary, los seguidos sólo entran al pipeline si pasan
 * `isShareablePoi` (incluye `geo_health = 'ok'`), por lo que NUNCA pueden
 * tener rings `partial`/`chain`. Para `review`/`hardError`, el helper
 * `getPointHealthRings(loc, currentUserId)` ya excluye seguidos. Resultado:
 * todo lo que aparezca en `ids` es propio y reparable. Ver
 * `mem://logic/sharing/curated-only-rule`.
 *
 * Garantías estructurales:
 *   - Scope NUNCA cae en `markerLocations` salvo opt-in explícito vía toggle.
 *   - Verde nunca aparece en review/hardError porque getPointHealthRings
 *     ya lo excluye (consecuencia, no regla del filtro).
 *
 * Ver `mem://logic/discovery/health-filter-axis`.
 */

import type { GeoLocation, HealthFilter } from '@/types/location';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';

export type ScopeMode = 'filtered' | 'selection' | 'viewport';

export interface HealthScopeCtx {
  filteredLocations: GeoLocation[];
  selectedLocationIds: Set<string>;
  visibleLocationIds: Set<string>;
  healthFilter: HealthFilter | null | undefined;
  onlyVisible: boolean;
  /**
   * Caller actual. Se propaga a `getPointHealthRings` para que los rings
   * de seguidos no aparezcan (curated-only boundary). No se usa para
   * distinguir reparable vs no — esa distinción ya no existe.
   */
  currentUserId?: string | null;
}

export interface HealthScopeResult {
  /** Universo del subconjunto. Tras curated boundary = todo es propio. */
  ids: string[];
  total: number;
  mode: ScopeMode;
  /** Subconjunto materializado (mismo orden que filteredLocations). */
  locations: GeoLocation[];
}

const EMPTY: HealthScopeResult = {
  ids: [],
  total: 0,
  mode: 'filtered',
  locations: [],
};

export function getHealthFilterScopeIds(ctx: HealthScopeCtx): HealthScopeResult {
  const hf = ctx.healthFilter ?? null;
  if (!hf) return EMPTY;

  // Universo lógico: filteredLocations cuyo health rings (con guard de
  // ownership) incluya hf. Verde se excluye automáticamente vía helper.
  const matching = ctx.filteredLocations.filter((loc) =>
    getPointHealthRings(loc, ctx.currentUserId).includes(hf),
  );

  // Resolución de modo (precedencia: selection > viewport > filtered).
  let mode: ScopeMode = 'filtered';
  let subset = matching;

  if (ctx.selectedLocationIds.size > 0) {
    mode = 'selection';
    subset = matching.filter((l) => ctx.selectedLocationIds.has(l.id));
  } else if (ctx.onlyVisible) {
    mode = 'viewport';
    subset = matching.filter((l) => ctx.visibleLocationIds.has(l.id));
  }

  return {
    ids: subset.map((l) => l.id),
    total: subset.length,
    mode,
    locations: subset,
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
