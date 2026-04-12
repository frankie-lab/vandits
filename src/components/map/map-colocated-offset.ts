// Micro-offset for co-located markers (same coordinates)
// Offsets are purely visual (~3m) so all stacked markers are clickable

import { GeoLocation } from '@/types/location';

interface OffsetCoordinates {
  lat: number;
  lng: number;
}

/**
 * Groups locations by exact coordinates and applies a small circular offset
 * so overlapping markers become individually clickable on the map.
 * 
 * The offset is ~3 meters — invisible at low zoom but enough to separate
 * markers at high zoom levels where overlap is a problem.
 * 
 * @returns Map from location ID to offset coordinates
 */
export function computeColocatedOffsets(
  locations: GeoLocation[]
): Map<string, OffsetCoordinates> {
  const offsets = new Map<string, OffsetCoordinates>();
  
  // Group by rounded coordinates (within ~1m precision)
  const groups = new Map<string, GeoLocation[]>();
  
  for (const loc of locations) {
    // Round to 5 decimal places (~1.1m precision at equator)
    const key = `${loc.coordinates.lat.toFixed(5)},${loc.coordinates.lng.toFixed(5)}`;
    const group = groups.get(key) || [];
    group.push(loc);
    groups.set(key, group);
  }
  
  // Only process groups with 2+ markers
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    
    // Offset ~3 meters in a circle pattern
    const offsetMeters = 3;
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(group[0].coordinates.lat * Math.PI / 180);
    
    const deltaLat = offsetMeters / metersPerDegreeLat;
    const deltaLng = offsetMeters / metersPerDegreeLng;
    
    group.forEach((loc, index) => {
      if (index === 0) return; // First marker stays in place
      
      const angle = (2 * Math.PI * index) / group.length;
      offsets.set(loc.id, {
        lat: loc.coordinates.lat + deltaLat * Math.sin(angle),
        lng: loc.coordinates.lng + deltaLng * Math.cos(angle),
      });
    });
  }
  
  return offsets;
}
