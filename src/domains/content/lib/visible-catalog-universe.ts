// Domain: Content — getVisibleCatalogUniverse (SoT del "catálogo visible").
//
// Canon: `docs/contracts/poi-counts-canon.md` §3.A — fuente A
// `catalogVisibleUniverse`. Esta es la ÚNICA fuente para contadores de
// catálogo en la UI operativa (FloatingToolbar verde/azul, FilterBar en
// modo Explorar, ownershipRatios T/Tm/Ts, subtab counts de Mantener…).
//
// Regla canónica:
//   catálogo visible = locations cuyo `getLocationBucket` ∈ {myCatalog,
//   followedCatalog}. Es decir, propios aprobados + seguidos aprobados.
//
// NO incluye:
//   - workspaces ajenos no aprobados,
//   - detached visibles (`detachedVisibleLocations`) — esos viven SOLO en
//     `getVisibleUniverseLocations()` (fuente B, mapa visible).
//
// Si necesitas el universo de mapa (markers / render), usa
// `getVisibleUniverseLocations` del store. Para contadores de catálogo,
// usa este helper. Ver canon §4 (etiquetas obligatorias).

import { getLocationBucket, type BucketableLocation } from './location-bucket';

export function getVisibleCatalogUniverse<T extends BucketableLocation>(
  locations: T[],
  currentUserId?: string | null,
): T[] {
  const out: T[] = [];
  for (const loc of locations) {
    const bucket = getLocationBucket(loc, currentUserId);
    if (bucket === 'myCatalog' || bucket === 'followedCatalog') {
      out.push(loc);
    }
  }
  return out;
}
