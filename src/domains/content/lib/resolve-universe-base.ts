// Domain: Content — resolveUniverseBase (SoT del universo activo del panel
// "Buscar y Filtrar" cuando el modo es Explorar / Con deuda / Sin enriquecer).
//
// Ver `docs/audits/search-filter-maintain-tree-universe-plan.md`.
//
// Regla canónica:
//   - 'all'         → universo completo (sin recortar). Coincide con el
//                     comportamiento previo de Explorar.
//   - 'debt'        → POIs con deuda objetiva (helper único `getPointHealthRings`
//                     no vacío, o `geoHealth ∈ {partial, stale_name, empty}`).
//   - 'unenriched'  → POIs importados sin enriquecer (`!isPointEnriched` y
//                     origen = importado, según `sourceKind` / `_isImported`).
//
// No reimplementa predicados: delega 100% en los helpers canónicos para
// preservar la regla DURA "salud objetiva ≠ estado personal" (P-POI-CURATION-1).

import type { GeoLocation } from '@/types/location';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';
import { isPointEnriched } from '@/domains/content/lib/point-visual-state';
import { classifyPoiRootStatusForLocation } from '@/domains/content/lib/poi-identity-root-status-client';

export type ActiveModeUniverse = 'all' | 'debt' | 'unenriched' | 'user-action';

export function isLocationInDebtUniverse(loc: GeoLocation): boolean {
  const rings = getPointHealthRings(loc);
  if (rings.length > 0) return true;
  const geo = (loc as any).geoHealth as string | undefined;
  return geo === 'partial' || geo === 'stale_name' || geo === 'empty';
}

export function isLocationInUnenrichedUniverse(loc: GeoLocation): boolean {
  if (isPointEnriched(loc)) return false;
  // Origen importado: heredamos el criterio usado hoy por el matcher / curation
  // levels (POI-0/1 = imported sin IA). `sourceKind` puede no estar poblado en
  // POIs legacy; en ese caso, cualquier POI no enriquecido cuenta.
  const a = loc as GeoLocation & {
    sourceKind?: string | null;
    source_kind?: string | null;
  };
  const sourceKind = a.sourceKind ?? a.source_kind ?? null;
  if (sourceKind === 'app' || sourceKind === 'external') return false;
  return true;
}

/**
 * PR-MAINTAIN-USER-ACTION-1 — Helper canónico.
 *
 * "POI que requiere intervención del usuario" = tiene deuda objetiva
 * (mismo criterio que `isLocationInDebtUniverse`) Y su Root Status de
 * identidad ∈ {A, C}:
 *   - A (Incompleto)  → falta nombre o coordenadas. Sólo el usuario puede
 *                       completarlo (catálogo, foto, edición manual).
 *   - C (Revisar)     → nombre/coordenadas sospechosos. Requiere juicio
 *                       humano para confirmar o corregir.
 *
 * Se EXCLUYEN explícitamente:
 *   - B (Falta canon) → backfill geográfico automático del sistema.
 *   - D (Auto)        → reparación automática vía `enqueue_health_repair`.
 *
 * Regla de producto: el panel "Mantener" es la **cola de trabajo del
 * usuario**. Todo lo que el sistema puede resolver solo NO debe aparecer
 * aquí; corre en background y se reporta en la consola admin. Esto evita
 * que el usuario sienta que tiene deuda que en realidad no requiere su
 * tiempo.
 */
export function isLocationRequiringUserAction(loc: GeoLocation): boolean {
  if (!isLocationInDebtUniverse(loc)) return false;
  const { rootStatus } = classifyPoiRootStatusForLocation(loc as never);
  return rootStatus === 'A' || rootStatus === 'C';
}

export function resolveUniverseBase(
  mode: ActiveModeUniverse,
  locations: GeoLocation[],
): GeoLocation[] {
  if (mode === 'all') return locations;
  if (mode === 'debt') return locations.filter(isLocationInDebtUniverse);
  if (mode === 'unenriched') return locations.filter(isLocationInUnenrichedUniverse);
  if (mode === 'user-action') return locations.filter(isLocationRequiringUserAction);
  return locations;
}

/** Etiqueta corta del universo activo (para sufijo del contador superior). */
export function getUniverseBaseLabel(mode: ActiveModeUniverse): string | null {
  if (mode === 'debt') return 'con deuda';
  if (mode === 'unenriched') return 'sin enriquecer';
  if (mode === 'user-action') return 'requieren tu revisión';
  return null;
}
