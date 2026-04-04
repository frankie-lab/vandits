import { corsHeaders } from '@supabase/supabase-js/cors'

interface Waypoint {
  lat: number;
  lng: number;
  transportMode: 'walking' | 'driving' | 'flight' | 'ferry';
}

interface SegmentResult {
  geometry: { type: string; coordinates: number[][] };
  distance: number; // meters
  duration: number; // seconds
  transportMode: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { waypoints } = await req.json() as { waypoints: Waypoint[] };

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
      // Transport mode is on the "from" waypoint (how to get to the next)
      const mode = from.transportMode || 'driving';

      if (mode === 'flight' || mode === 'ferry') {
        // For flight/ferry: generate a great circle arc
        const arcCoords = generateArc(from.lat, from.lng, to.lat, to.lng, mode === 'flight' ? 50 : 20);
        const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
        // Rough speed estimates
        const speed = mode === 'flight' ? 800 * 1000 / 3600 : 30 * 1000 / 3600; // m/s
        const duration = distance / speed;

        segments.push({
          geometry: { type: 'LineString', coordinates: arcCoords },
          distance,
          duration,
          transportMode: mode,
        });
      } else {
        // Use OSRM for walking/driving
        const profile = mode === 'walking' ? 'foot' : 'car';
        const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

        const response = await fetch(osrmUrl);
        
        if (!response.ok) {
          // Fallback to straight line if OSRM fails
          segments.push({
            geometry: {
              type: 'LineString',
              coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
            },
            distance: haversineDistance(from.lat, from.lng, to.lat, to.lng),
            duration: 0,
            transportMode: mode,
          });
          continue;
        }

        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          segments.push({
            geometry: route.geometry,
            distance: route.distance,
            duration: route.duration,
            transportMode: mode,
          });
        } else {
          // Fallback
          segments.push({
            geometry: {
              type: 'LineString',
              coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
            },
            distance: haversineDistance(from.lat, from.lng, to.lat, to.lng),
            duration: 0,
            transportMode: mode,
          });
        }
      }
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
  numPoints: number
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
