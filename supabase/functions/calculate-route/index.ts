const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Waypoint {
  lat: number;
  lng: number;
  transportMode: 'walking' | 'driving' | 'flight' | 'ferry';
}

type RoadPreference = 'fastest' | 'scenic';

interface SegmentResult {
  geometry: { type: string; coordinates: number[][] };
  distance: number;
  duration: number;
  transportMode: string;
}

// OSRM profiles per transport mode
// - car: roads including highways, motorways
// - foot: pedestrian paths, sidewalks, trails, unpaved roads — avoids highways
// - bike: cycle paths, secondary roads — avoids motorways (used as fallback for scenic walking)
const OSRM_PROFILES: Record<string, string> = {
  driving: 'car',
  walking: 'foot',
};

// Average speeds for non-OSRM modes (m/s)
const ARC_SPEEDS: Record<string, number> = {
  flight: 800 * 1000 / 3600,   // 800 km/h → ~222 m/s
  ferry: 30 * 1000 / 3600,     // 30 km/h → ~8.3 m/s
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { waypoints, roadPreference = 'fastest' } = await req.json() as {
      waypoints: Waypoint[];
      roadPreference?: RoadPreference;
    };

    if (!waypoints || waypoints.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 waypoints' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const segments: SegmentResult[] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const mode = from.transportMode || 'driving';

      // Flight & Ferry: use great-circle arc (no road network)
      if (mode === 'flight' || mode === 'ferry') {
        const numPoints = mode === 'flight' ? 50 : 20;
        const arcCoords = generateArc(from.lat, from.lng, to.lat, to.lng, numPoints);
        const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
        const speed = ARC_SPEEDS[mode];
        const duration = distance / speed;

        segments.push({
          geometry: { type: 'LineString', coordinates: arcCoords },
          distance,
          duration,
          transportMode: mode,
        });
        continue;
      }

      // Walking & Driving: use OSRM with appropriate profile
      const segment = await calculateOSRMSegment(from, to, mode, roadPreference);
      segments.push(segment);
    }

    const totalDistance = segments.reduce((sum, s) => sum + s.distance, 0);
    const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

    return new Response(
      JSON.stringify({ segments, totalDistance, totalDuration }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Calculate a route segment using OSRM.
 * 
 * Key differences per mode:
 * - DRIVING uses profile=car (highways, motorways, paved roads)
 *   - scenic: requests alternatives=true, excludes motorways, picks slowest route
 * - WALKING uses profile=foot (footpaths, trails, unpaved tracks, pedestrian zones)
 *   - scenic: requests alternatives=true and picks the longest route (more scenic paths)
 *   - Walking routes are inherently different from driving — OSRM foot profile
 *     routes through pedestrian paths, unpaved trails, and shortcuts that cars can't use
 */
async function calculateOSRMSegment(
  from: Waypoint,
  to: Waypoint,
  mode: string,
  roadPreference: RoadPreference,
): Promise<SegmentResult> {
  const profile = OSRM_PROFILES[mode] || 'car';
  const baseUrl = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  // Strategy per mode + preference:
  // driving + scenic → exclude=motorway, alternatives=true, pick slowest
  // driving + fastest → standard request
  // walking + scenic → alternatives=true, pick longest (more trails/detours)
  // walking + fastest → standard request

  if (roadPreference === 'scenic') {
    const scenicSegment = await fetchScenicRoute(baseUrl, mode);
    if (scenicSegment) {
      return { ...scenicSegment, transportMode: mode };
    }
  }

  // Standard fastest route
  const response = await fetch(baseUrl);
  if (!response.ok) {
    return straightLineFallback(from, to, mode);
  }

  const data = await response.json();
  if (data.code === 'Ok' && data.routes?.length > 0) {
    const route = data.routes[0];
    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      transportMode: mode,
    };
  }

  return straightLineFallback(from, to, mode);
}

/**
 * Fetch scenic route with mode-specific logic:
 * - Driving: try exclude=motorway first, then alternatives
 * - Walking: request alternatives and pick the longest/slowest
 */
async function fetchScenicRoute(
  baseUrl: string,
  mode: string,
): Promise<Omit<SegmentResult, 'transportMode'> | null> {
  // For driving: try excluding motorways first
  if (mode === 'driving') {
    try {
      const scenicResponse = await fetch(`${baseUrl}&exclude=motorway&alternatives=true`);
      if (scenicResponse.ok) {
        const data = await scenicResponse.json();
        if (data.code === 'Ok' && data.routes?.length > 0) {
          // Pick the slowest route (more likely to use secondary roads)
          const route = pickSlowestRoute(data.routes);
          return {
            geometry: route.geometry,
            distance: route.distance,
            duration: route.duration,
          };
        }
      }
    } catch {
      // exclude not supported, fall through
    }
  }

  // For both modes: request alternatives and pick the most scenic (longest/slowest)
  try {
    const altResponse = await fetch(`${baseUrl}&alternatives=true`);
    if (altResponse.ok) {
      const data = await altResponse.json();
      if (data.code === 'Ok' && data.routes?.length > 1) {
        // Pick slowest route — slower usually means secondary roads / trails
        const route = pickSlowestRoute(data.routes);
        return {
          geometry: route.geometry,
          distance: route.distance,
          duration: route.duration,
        };
      }
    }
  } catch {
    // fall through to null
  }

  return null;
}

/** Pick the route with the longest duration (slowest = more scenic roads / trails) */
function pickSlowestRoute(routes: any[]): any {
  let best = routes[0];
  for (const r of routes) {
    if (r.duration > best.duration) {
      best = r;
    }
  }
  return best;
}

/** Straight-line fallback when OSRM fails */
function straightLineFallback(from: Waypoint, to: Waypoint, mode: string): SegmentResult {
  return {
    geometry: {
      type: 'LineString',
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
    },
    distance: haversineDistance(from.lat, from.lng, to.lat, to.lng),
    duration: 0,
    transportMode: mode,
  };
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateArc(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  numPoints: number,
): number[][] {
  const coords: number[][] = [];
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const lam1 = lng1 * Math.PI / 180;
  const lam2 = lng2 * Math.PI / 180;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2
  ));

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    const lat = Math.atan2(z, Math.sqrt(x ** 2 + y ** 2)) * 180 / Math.PI;
    const lng = Math.atan2(y, x) * 180 / Math.PI;
    coords.push([lng, lat]);
  }

  return coords;
}
