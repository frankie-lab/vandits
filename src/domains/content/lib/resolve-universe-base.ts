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

export type ActiveModeUniverse = 'all' | 'debt' | 'unenriched';

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

export function resolveUniverseBase(
  mode: ActiveModeUniverse,
  locations: GeoLocation[],
): GeoLocation[] {
  if (mode === 'all') return locations;
  if (mode === 'debt') return locations.filter(isLocationInDebtUniverse);
  if (mode === 'unenriched') return locations.filter(isLocationInUnenrichedUniverse);
  return locations;
}

/** Etiqueta corta del universo activo (para sufijo del contador superior). */
export function getUniverseBaseLabel(mode: ActiveModeUniverse): string | null {
  if (mode === 'debt') return 'con deuda';
  if (mode === 'unenriched') return 'sin enriquecer';
  return null;
}
