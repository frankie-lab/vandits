/**
 * VANDITS V2 — Flag-aware Data Loaders
 * 
 * Each loader reads from V2 tables when the corresponding flag is active,
 * or falls back to legacy sources. Services/hooks call these instead of
 * touching repositories directly.
 */

import type { V2FeatureFlags, Place, Waypoint, UserPlace, MapMode } from './types';
import { placeRepository } from '@/repositories/place.repository';
import { waypointRepository } from '@/repositories/waypoint.repository';
import { userPlaceRepository } from '@/repositories/user-place.repository';

// ── Place Loader ──────────────────────────────────────────────

export async function loadPlaces(
  userId: string,
  flags: V2FeatureFlags,
): Promise<Place[]> {
  if (!flags.v2DataReadPlaces) return [];
  return placeRepository.findByCreator(userId);
}

// ── Waypoint Loader ───────────────────────────────────────────

export async function loadWaypoints(
  documentId: string,
  flags: V2FeatureFlags,
): Promise<Waypoint[]> {
  if (!flags.v2DataReadPlaces) return [];
  return waypointRepository.findByDocument(documentId);
}

export async function loadUnresolvedWaypoints(
  documentId: string,
  flags: V2FeatureFlags,
): Promise<Waypoint[]> {
  if (!flags.v2DataReadPlaces) return [];
  return waypointRepository.findByStatus(documentId, 'pending');
}

// ── UserPlace Loader ──────────────────────────────────────────

export async function loadUserPlaces(
  userId: string,
  flags: V2FeatureFlags,
): Promise<UserPlace[]> {
  if (!flags.v2DataReadUserPlaces) return [];
  return userPlaceRepository.findByUser(userId);
}

export async function loadFavorites(
  userId: string,
  flags: V2FeatureFlags,
): Promise<UserPlace[]> {
  if (!flags.v2DataReadUserPlaces) return [];
  return userPlaceRepository.findFavorites(userId);
}

export async function loadVisited(
  userId: string,
  flags: V2FeatureFlags,
): Promise<UserPlace[]> {
  if (!flags.v2DataReadUserPlaces) return [];
  return userPlaceRepository.findByUser(userId).then(ups => ups.filter(up => up.visitStatus === 'visited'));
}

// ── Mode-aware Composite Loader ───────────────────────────────

export interface LoadedMapData {
  places: Place[];
  waypoints: Waypoint[];
  userPlaces: UserPlace[];
}

/**
 * Loads all V2 data needed for a given map mode.
 * Returns empty arrays for disabled flags — callers should
 * fall back to legacy data when arrays are empty.
 */
export async function loadMapData(
  userId: string,
  mode: MapMode,
  documentId: string | null,
  flags: V2FeatureFlags,
): Promise<LoadedMapData> {
  const result: LoadedMapData = {
    places: [],
    waypoints: [],
    userPlaces: [],
  };

  // Always load user places if flag is on
  if (flags.v2DataReadUserPlaces) {
    result.userPlaces = await userPlaceRepository.findByUser(userId);
  }

  switch (mode) {
    case 'personal':
      if (flags.v2DataReadPlaces) {
        result.places = await placeRepository.findByCreator(userId);
      }
      break;

    case 'document':
      if (flags.v2DataReadPlaces && documentId) {
        result.waypoints = await waypointRepository.findByDocument(documentId);
        // Also load resolved places for cross-reference
        const placeIds = result.waypoints
          .filter(w => w.placeId)
          .map(w => w.placeId!);
        if (placeIds.length > 0) {
          result.places = await placeRepository.findByIds(placeIds);
        }
      }
      break;

    case 'social':
      // Social mode loads followed users' places — handled separately
      break;
  }

  return result;
}
