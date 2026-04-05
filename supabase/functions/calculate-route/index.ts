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

// Realistic average speeds (m/s) for duration corrections
const AVG_SPEEDS: Record<string, number> = {
  walking: 5 * 1000 / 3600,     // 5 km/h
  driving: 0,                    // use OSRM's calculated duration
  flight: 800 * 1000 / 3600,    // 800 km/h
  ferry: 30 * 1000 / 3600,      // 30 km/h
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

      let segment: SegmentResult;

      switch (mode) {
        case 'flight':
        case 'ferry':
          segment = calculateArcSegment(from, to, mode);
          break;
        case 'walking':
          segment = await calculateWalkingSegment(from, to, roadPreference);
          break;
        case 'driving':
        default:
          segment = await calculateDrivingSegment(from, to, roadPreference);
          break;
      }

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

// ─── Flight & Ferry: great-circle arc ───────────────────────────────────

function calculateArcSegment(from: Waypoint, to: Waypoint, mode: string): SegmentResult {
  const numPoints = mode === 'flight' ? 50 : 20;
  const arcCoords = generateArc(from.lat, from.lng, to.lat, to.lng, numPoints);
  const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const speed = AVG_SPEEDS[mode];
  const duration = distance / speed;

  return {
    geometry: { type: 'LineString', coordinates: arcCoords },
    distance,
    duration,
    transportMode: mode,
  };
}

// ─── Walking: OSRM foot profile + realistic duration ────────────────────
// The OSRM demo server may return car-like results for foot profile.
// We use foot profile for geometry (it may use pedestrian paths where available)
// but always recalculate duration at walking speed (5 km/h) for realistic estimates.
// For scenic preference: request alternatives and pick the longest route.

async function calculateWalkingSegment(
  from: Waypoint,
  to: Waypoint,
  roadPreference: RoadPreference,
): Promise<SegmentResult> {
  // Try foot profile first, fall back to car if it fails
  const profiles = ['foot', 'car'];
  
  for (const profile of profiles) {
    const baseUrl = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

    try {
      const url = roadPreference === 'scenic' ? `${baseUrl}&alternatives=true` : baseUrl;
      const response = await fetch(url);
      
      if (!response.ok) continue;
      
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes?.length) continue;

      // For scenic: pick the longest route (more detours, secondary paths)
      const route = roadPreference === 'scenic' && data.routes.length > 1
        ? pickLongestRoute(data.routes)
        : data.routes[0];

      // Always recalculate duration at walking speed (5 km/h)
      const walkingDuration = route.distance / AVG_SPEEDS.walking;

      return {
        geometry: route.geometry,
        distance: route.distance,
        duration: walkingDuration,
        transportMode: 'walking',
      };
    } catch {
      continue;
    }
  }

  return straightLineFallback(from, to, 'walking');
}

// ─── Driving: OSRM car profile with scenic logic ────────────────────────
// For fastest: standard OSRM car route (uses highways/motorways).
// For scenic: exclude motorways first, then pick slowest alternative
// (secondary roads, more interesting landscape).

async function calculateDrivingSegment(
  from: Waypoint,
  to: Waypoint,
  roadPreference: RoadPreference,
): Promise<SegmentResult> {
  const baseUrl = `https://router.project-osrm.org/route/v1/car/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  if (roadPreference === 'scenic') {
    // Strategy: try exclude=motorway first for truly scenic routes
    try {
      const scenicResponse = await fetch(`${baseUrl}&exclude=motorway&alternatives=true`);
      if (scenicResponse.ok) {
        const data = await scenicResponse.json();
        if (data.code === 'Ok' && data.routes?.length > 0) {
          const route = pickSlowestRoute(data.routes);
          return {
            geometry: route.geometry,
            distance: route.distance,
            duration: route.duration,
            transportMode: 'driving',
          };
        }
      }
    } catch {
      // exclude not supported, fall through
    }

    // Fallback: request alternatives and pick slowest
    try {
      const altResponse = await fetch(`${baseUrl}&alternatives=true`);
      if (altResponse.ok) {
        const data = await altResponse.json();
        if (data.code === 'Ok' && data.routes?.length > 1) {
          const route = pickSlowestRoute(data.routes);
          return {
            geometry: route.geometry,
            distance: route.distance,
            duration: route.duration,
            transportMode: 'driving',
          };
        }
      }
    } catch {
      // fall through to standard
    }
  }

  // Standard fastest route
  try {
    const response = await fetch(baseUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && data.routes?.length > 0) {
        const route = data.routes[0];
        return {
          geometry: route.geometry,
          distance: route.distance,
          duration: route.duration,
          transportMode: 'driving',
        };
      }
    }
  } catch {
    // fall through
  }

  return straightLineFallback(from, to, 'driving');
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Pick the route with the longest distance (more scenic detours) */
function pickLongestRoute(routes: any[]): any {
  let best = routes[0];
  for (const r of routes) {
    if (r.distance > best.distance) best = r;
  }
  return best;
}

/** Pick the route with the longest duration (slower = secondary roads) */
function pickSlowestRoute(routes: any[]): any {
  let best = routes[0];
  for (const r of routes) {
    if (r.duration > best.duration) best = r;
  }
  return best;
}

/** Straight-line fallback with realistic duration per mode */
function straightLineFallback(from: Waypoint, to: Waypoint, mode: string): SegmentResult {
  const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const speed = AVG_SPEEDS[mode] || AVG_SPEEDS.walking;
  return {
    geometry: {
      type: 'LineString',
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
    },
    distance,
    duration: distance / speed,
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
