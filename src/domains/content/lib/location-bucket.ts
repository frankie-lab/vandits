/**
 * Single Source of Truth: Catálogo vs Mesa de trabajo
 *
 * `location.isApproved` es el ÚNICO decisor de Catálogo.
 * `documents.status` es metadato editorial puro y NO afecta a esta clasificación.
 *
 * Cada punto cae en exactamente uno de estos 4 buckets, en función de
 * 1) si pertenece al usuario actual y 2) su flag isApproved.
 */

export type LocationBucket =
  | 'myCatalog'
  | 'myWorkspace'
  | 'followedCatalog'
  | 'followedWorkspace';

export interface BucketableLocation {
  isApproved?: boolean;
  ownerUserId?: string | null;
  _docUserId?: string | null;
}

export interface BucketStats {
  myCatalog: number;
  myWorkspace: number;
  followedCatalog: number;
  followedWorkspace: number;
  /** myCatalog + followedCatalog */
  catalogTotal: number;
  /** myWorkspace + followedWorkspace */
  workspaceTotal: number;
  /** myCatalog + myWorkspace */
  myTotal: number;
  /** followedCatalog + followedWorkspace */
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
  return approved ? 'followedCatalog' : 'followedWorkspace';
}

export function getBucketStats(
  locations: BucketableLocation[],
  currentUserId?: string | null,
): BucketStats {
  const stats = {
    myCatalog: 0,
    myWorkspace: 0,
    followedCatalog: 0,
    followedWorkspace: 0,
  };
  for (const loc of locations) {
    stats[getLocationBucket(loc, currentUserId)] += 1;
  }
  const catalogTotal = stats.myCatalog + stats.followedCatalog;
  const workspaceTotal = stats.myWorkspace + stats.followedWorkspace;
  const myTotal = stats.myCatalog + stats.myWorkspace;
  const followedTotal = stats.followedCatalog + stats.followedWorkspace;
  return {
    ...stats,
    catalogTotal,
    workspaceTotal,
    myTotal,
    followedTotal,
    total: catalogTotal + workspaceTotal,
  };
}
