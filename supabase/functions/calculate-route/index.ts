import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const ORS_PROFILES: Record<string, string> = {
  walking: 'foot-walking',
  driving: 'driving-car',
};

const ARC_SPEEDS: Record<string, number> = {
  flight: 800 * 1000 / 3600,
  ferry: 30 * 1000 / 3600,
};

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
    if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY not configured');

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

      if (mode === 'flight') {
        const flightSegments = await buildFlightRoute(apiKey, from, to, roadPreference);
        segments.push(...flightSegments);
      } else if (mode === 'ferry') {
        segments.push(calculateArcSegment(from, to, mode));
      } else {
        // For driving/walking, check if ORS can actually route it
        const result = await calculateORSSegment(apiKey, from, to, mode as 'walking' | 'driving', roadPreference);
        
        // Detect impossible route: ORS returned a straight-line fallback on a long distance
        if (result._isFallback) {
          const directDistKm = haversineDistance(from.lat, from.lng, to.lat, to.lng) / 1000;
          if (directDistKm > 50) {
            // Route is impossible by land — suggest alternatives
            return new Response(
              JSON.stringify({
                routeImpossible: true,
                reason: directDistKm > 300 ? 'ocean_or_continent_crossing' : 'no_road_connection',
                directDistanceKm: Math.round(directDistKm),
                suggestedModes: directDistKm > 300
                  ? ['flight', 'ferry']
                  : ['ferry'],
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        segments.push(result);
      }
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

// ─── Flight: origin → nearest airport → destination airport → destination ──

async function buildFlightRoute(
  orsKey: string,
  from: Waypoint,
  to: Waypoint,
  roadPreference: RoadPreference,
): Promise<SegmentResult[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  // Find nearest airports to origin and destination
  const [originAirport, destAirport] = await Promise.all([
    findNearestAirport(sb, from.lat, from.lng),
    findNearestAirport(sb, to.lat, to.lng),
  ]);

  if (!originAirport || !destAirport) {
    // Fallback: direct arc if no airports found
    console.warn('No airports found, falling back to direct arc');
    return [calculateArcSegment(from, to, 'flight')];
  }

  // If same airport, just do ground route
  if (originAirport.id === destAirport.id) {
    return [await calculateORSSegment(orsKey, from, to, 'driving', roadPreference)];
  }

  const segments: SegmentResult[] = [];

  // Segment 1: Drive from origin to departure airport (if > 1km)
  const distToOriginAirport = haversineDistance(from.lat, from.lng, originAirport.latitude, originAirport.longitude);
  if (distToOriginAirport > 1000) {
    const airportWp: Waypoint = { lat: originAirport.latitude, lng: originAirport.longitude, transportMode: 'driving' };
    segments.push(await calculateORSSegment(orsKey, from, airportWp, 'driving', roadPreference));
  }

  // Segment 2: Flight between airports
  const apFrom: Waypoint = { lat: originAirport.latitude, lng: originAirport.longitude, transportMode: 'flight' };
  const apTo: Waypoint = { lat: destAirport.latitude, lng: destAirport.longitude, transportMode: 'flight' };
  const flightSeg = calculateArcSegment(apFrom, apTo, 'flight');
  // Add airport names to metadata
  (flightSeg as any).originAirport = { name: originAirport.name, iata: originAirport.iata_code };
  (flightSeg as any).destinationAirport = { name: destAirport.name, iata: destAirport.iata_code };
  segments.push(flightSeg);

  // Segment 3: Drive from arrival airport to destination (if > 1km)
  const distFromDestAirport = haversineDistance(destAirport.latitude, destAirport.longitude, to.lat, to.lng);
  if (distFromDestAirport > 1000) {
    const airportWp: Waypoint = { lat: destAirport.latitude, lng: destAirport.longitude, transportMode: 'driving' };
    segments.push(await calculateORSSegment(orsKey, airportWp, to, 'driving', roadPreference));
  }

  return segments;
}

async function findNearestAirport(
  sb: any,
  lat: number,
  lng: number,
): Promise<{ id: string; name: string; iata_code: string; latitude: number; longitude: number } | null> {
  // Search within ~3 degrees (~300km) bounding box for performance
  const delta = 3;
  const { data, error } = await sb
    .from('airports')
    .select('id, name, iata_code, latitude, longitude')
    .gte('latitude', lat - delta)
    .lte('latitude', lat + delta)
    .gte('longitude', lng - delta)
    .lte('longitude', lng + delta)
    .in('type', ['large_airport', 'medium_airport'])
    .eq('scheduled_service', true)
    .not('iata_code', 'is', null)
    .limit(50);

  if (error || !data?.length) {
    console.error('Airport search error:', error);
    return null;
  }

  // Find closest by haversine distance
  let closest = data[0];
  let minDist = haversineDistance(lat, lng, closest.latitude, closest.longitude);

  for (let i = 1; i < data.length; i++) {
    const d = haversineDistance(lat, lng, data[i].latitude, data[i].longitude);
    if (d < minDist) {
      minDist = d;
      closest = data[i];
    }
  }

  return closest;
}

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

async function calculateORSSegment(
  apiKey: string,
  from: Waypoint,
  to: Waypoint,
  mode: 'walking' | 'driving',
  roadPreference: RoadPreference,
): Promise<SegmentResult> {
  const profile = ORS_PROFILES[mode];
  const url = `${ORS_BASE}/${profile}/geojson`;

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

  if (roadPreference === 'scenic' && mode === 'driving') {
    body.options = { avoid_features: ['highways', 'tollways'] };
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
      return straightLineFallback(from, to, mode);
    }

    const data = await response.json();
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

function straightLineFallback(from: Waypoint, to: Waypoint, mode: string): SegmentResult & { _isFallback?: boolean } {
  const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const speed = mode === 'walking' ? 5 * 1000 / 3600 : 80 * 1000 / 3600;
  return {
    geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
    distance,
    duration: distance / speed,
    transportMode: mode,
    _isFallback: true,
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
