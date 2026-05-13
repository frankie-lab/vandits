/**
 * Single Source of Truth: Catálogo vs Mesa de trabajo
 *
 * `location.isApproved` es el ÚNICO decisor de Catálogo.
 * `documents.status` es metadato editorial puro y NO afecta a esta clasificación.
 *
 * Cada punto cae en exactamente uno de estos 4 buckets, en función de
 * 1) si pertenece al usuario actual y 2) su flag isApproved.
 *
 * PR-1 curated sharing (2026-05-13): el bucket antes llamado
 * `followedWorkspace` se renombra a `followedShared`. Tras la curated-only
 * boundary, los seguidos solo entran al pipeline si pasan `isShareablePoi`,
 * por lo que "workspace ajeno" ya no es un dominio que el follower vea —
 * es contenido publicado/curado del owner. Ver
 * `mem://logic/sharing/curated-only-rule`.
 */

export type LocationBucket =
  | 'myCatalog'
  | 'myWorkspace'
  | 'followedCatalog'
  | 'followedShared';

export interface BucketableLocation {
  isApproved?: boolean;
  ownerUserId?: string | null;
  _docUserId?: string | null;
}

export interface BucketStats {
  myCatalog: number;
  myWorkspace: number;
  followedCatalog: number;
  followedShared: number;
  /** myCatalog + followedCatalog */
  catalogTotal: number;
  /** myWorkspace + followedShared */
  workspaceTotal: number;
  /** myCatalog + myWorkspace */
  myTotal: number;
  /** followedCatalog + followedShared */
  followedTotal: number;
  total: number;
}

export function isOwnLocation(
  loc: BucketableLocation,
  currentUserId?: string | null,
): boolean {
  if (!currentUserId) return false;
  return (
    loc.ownerUserId === currentUserId ||
    loc._docUserId === currentUserId
  );
}

export function getLocationBucket(
  loc: BucketableLocation,
  currentUserId?: string | null,
): LocationBucket {
  const own = isOwnLocation(loc, currentUserId);
  const approved = !!loc.isApproved;
  if (own) return approved ? 'myCatalog' : 'myWorkspace';
  return approved ? 'followedCatalog' : 'followedShared';
}

export function getBucketStats(
  locations: BucketableLocation[],
  currentUserId?: string | null,
): BucketStats {
  const stats = {
    myCatalog: 0,
    myWorkspace: 0,
    followedCatalog: 0,
    followedShared: 0,
  };
  for (const loc of locations) {
    stats[getLocationBucket(loc, currentUserId)] += 1;
  }
  const catalogTotal = stats.myCatalog + stats.followedCatalog;
  const workspaceTotal = stats.myWorkspace + stats.followedShared;
  const myTotal = stats.myCatalog + stats.myWorkspace;
  const followedTotal = stats.followedCatalog + stats.followedShared;
  return {
    ...stats,
    catalogTotal,
    workspaceTotal,
    myTotal,
    followedTotal,
    total: catalogTotal + workspaceTotal,
  };
}
