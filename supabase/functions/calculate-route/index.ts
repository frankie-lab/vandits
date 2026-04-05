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

// OpenRouteService profile mapping
// Each mode uses a completely different road network in OSM
const ORS_PROFILES: Record<string, string> = {
  walking: 'foot-walking',
  driving: 'driving-car',
};

// Fallback speeds for arc-based modes (m/s)
const ARC_SPEEDS: Record<string, number> = {
  flight: 800 * 1000 / 3600,   // 800 km/h
  ferry: 30 * 1000 / 3600,     // 30 km/h
};

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
    if (!apiKey) {
      throw new Error('OPENROUTESERVICE_API_KEY not configured');
    }

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
          segment = await calculateORSSegment(apiKey, from, to, 'walking', roadPreference);
          break;
        case 'driving':
        default:
          segment = await calculateORSSegment(apiKey, from, to, 'driving', roadPreference);
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
    console.error('calculate-route error:', error);
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
  const speed = ARC_SPEEDS[mode];
  const duration = distance / speed;

  return {
    geometry: { type: 'LineString', coordinates: arcCoords },
    distance,
    duration,
    transportMode: mode,
  };
}

// ─── OpenRouteService routing ───────────────────────────────────────────
// Uses real differentiated profiles:
// - foot-walking: sidewalks, pedestrian paths, unpaved trails, shortcuts
// - driving-car: roads, highways, motorways
//
// Preference mapping:
// - fastest → ORS preference=fastest
// - scenic (driving) → ORS preference=recommended + avoid highways
// - scenic (walking) → ORS preference=recommended (prefers scenic paths)

async function calculateORSSegment(
  apiKey: string,
  from: Waypoint,
  to: Waypoint,
  mode: 'walking' | 'driving',
  roadPreference: RoadPreference,
): Promise<SegmentResult> {
  const profile = ORS_PROFILES[mode];
  const url = `${ORS_BASE}/${profile}/geojson`;

  // Build request body
  const body: Record<string, unknown> = {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    preference: roadPreference === 'scenic' ? 'recommended' : 'fastest',
    units: 'm',
    geometry: true,
    instructions: false,
  };

  // For scenic driving: avoid highways/tollways
  if (roadPreference === 'scenic' && mode === 'driving') {
    body.options = {
      avoid_features: ['highways', 'tollways'],
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, application/geo+json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ORS error (${response.status}):`, errorText);
      // Fall back to straight line
      return straightLineFallback(from, to, mode);
    }

    const data = await response.json();

    // ORS GeoJSON response: features[0].geometry + properties.summary
    if (data.features?.length > 0) {
      const feature = data.features[0];
      const summary = feature.properties?.summary || {};
      
      return {
        geometry: feature.geometry,
        distance: summary.distance || 0,
        duration: summary.duration || 0,
        transportMode: mode,
      };
    }

    return straightLineFallback(from, to, mode);
  } catch (error) {
    console.error('ORS request failed:', error);
    return straightLineFallback(from, to, mode);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function straightLineFallback(from: Waypoint, to: Waypoint, mode: string): SegmentResult {
  const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const walkingSpeed = 5 * 1000 / 3600; // 5 km/h
  const drivingSpeed = 80 * 1000 / 3600; // 80 km/h
  const speed = mode === 'walking' ? walkingSpeed : drivingSpeed;
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
