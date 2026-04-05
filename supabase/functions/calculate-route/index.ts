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
    let ferryAlternatives: any[] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const mode = from.transportMode || 'driving';

      if (mode === 'flight') {
        const flightSegments = await buildFlightRoute(apiKey, from, to, roadPreference);
        segments.push(...flightSegments);
      } else if (mode === 'ferry') {
        const ferryResult = await buildFerryRouteWithAlternatives(apiKey, from, to, roadPreference);
        segments.push(...ferryResult.primary);
        ferryAlternatives = ferryResult.alternatives;
      } else {
        const result = await calculateORSSegment(apiKey, from, to, mode as 'walking' | 'driving', roadPreference);
        
        if (result._isFallback) {
          const directDistKm = haversineDistance(from.lat, from.lng, to.lat, to.lng) / 1000;
          if (directDistKm > 50) {
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

    const response: any = { segments, totalDistance, totalDuration };
    
    if (ferryAlternatives.length > 0) {
      response.ferryAlternatives = ferryAlternatives;
    }

    return new Response(
      JSON.stringify(response),
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

  // Find nearest airports to origin and destination (multiple candidates for dest)
  const [originAirport, destAirportCandidates] = await Promise.all([
    findNearestAirport(sb, from.lat, from.lng),
    findNearestAirports(sb, to.lat, to.lng, 5),
  ]);

  const destAirport = destAirportCandidates?.[0] ?? null;

  if (!originAirport || !destAirport) {
    console.warn('No airports found, falling back to direct arc');
    return [calculateArcSegment(from, to, 'flight')];
  }

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
  (flightSeg as any).originAirport = { name: originAirport.name, iata: originAirport.iata_code };
  (flightSeg as any).destinationAirport = { name: destAirport.name, iata: destAirport.iata_code };
  // Include candidate destination airports for client-side fallback search
  (flightSeg as any).candidateDestAirports = destAirportCandidates.map((a: any) => ({
    name: a.name, iata: a.iata_code, latitude: a.latitude, longitude: a.longitude,
  }));
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
  const results = await findNearestAirports(sb, lat, lng, 1);
  return results?.[0] ?? null;
}

async function findNearestAirports(
  sb: any,
  lat: number,
  lng: number,
  count: number,
): Promise<{ id: string; name: string; iata_code: string; latitude: number; longitude: number }[]> {
  const delta = 4; // ~400km bounding box
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
    return [];
  }

  // Sort by distance and return top N
  const sorted = data
    .map((a: any) => ({ ...a, _dist: haversineDistance(lat, lng, a.latitude, a.longitude) }))
    .sort((a: any, b: any) => a._dist - b._dist)
    .slice(0, count);

  return sorted;
}

// ─── Ferry: find real OSM ferry route connecting origin/destination ──────

async function buildFerryRouteWithAlternatives(
  orsKey: string,
  from: Waypoint,
  to: Waypoint,
  roadPreference: RoadPreference,
): Promise<{ primary: SegmentResult[]; alternatives: any[] }> {
  const ferryRoutes = await findRealFerryRoutes(from.lat, from.lng, to.lat, to.lng);

  if (ferryRoutes.length === 0) {
    console.warn('No real ferry routes found, falling back to Nominatim port search');
    const fallback = await buildFerryRouteFallback(orsKey, from, to, roadPreference);
    return { primary: fallback, alternatives: [] };
  }

  // ORS route cache to avoid duplicate calls for shared origin→port / port→dest legs
  const orsCache = new Map<string, SegmentResult>();

  async function cachedORSSegment(a: Waypoint, b: Waypoint, mode: 'walking' | 'driving'): Promise<SegmentResult> {
    const key = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}-${b.lat.toFixed(5)},${b.lng.toFixed(5)}-${mode}`;
    if (orsCache.has(key)) return orsCache.get(key)!;
    const result = await calculateORSSegment(orsKey, a, b, mode, roadPreference);
    orsCache.set(key, result);
    return result;
  }

  async function buildCachedFerrySegments(route: FerryRouteResult): Promise<SegmentResult[]> {
    const segments: SegmentResult[] = [];
    const distToPort = haversineDistance(from.lat, from.lng, route.originPort.lat, route.originPort.lng);
    if (distToPort > 1000) {
      const portWp: Waypoint = { lat: route.originPort.lat, lng: route.originPort.lng, transportMode: 'driving' };
      segments.push(await cachedORSSegment(from, portWp, 'driving'));
    }
    const ferryDistance = computePolylineDistance(route.geometry);
    const ferryDuration = (route as any).estimatedDurationMin
      ? (route as any).estimatedDurationMin * 60
      : ferryDistance / (30 * 1000 / 3600);
    segments.push({
      geometry: { type: 'LineString', coordinates: route.geometry },
      distance: ferryDistance,
      duration: ferryDuration,
      transportMode: 'ferry',
      originPort: route.originPort,
      destinationPort: route.destPort,
      routeName: route.name,
      operators: (route as any).operators || [],
      distanceKm: (route as any).distanceKm || Math.round(ferryDistance / 1000),
    } as any);
    const distFromPort = haversineDistance(route.destPort.lat, route.destPort.lng, to.lat, to.lng);
    if (distFromPort > 1000) {
      const portWp: Waypoint = { lat: route.destPort.lat, lng: route.destPort.lng, transportMode: 'driving' };
      segments.push(await cachedORSSegment(portWp, to, 'driving'));
    }
    return segments;
  }

  // Build primary
  const primary = await buildCachedFerrySegments(ferryRoutes[0]);

  // Build alternatives sequentially (2 at a time) to avoid ORS rate limits
  const alternatives: any[] = [];
  const BATCH_SIZE = 2;
  for (let i = 1; i < ferryRoutes.length; i += BATCH_SIZE) {
    const batch = ferryRoutes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (route) => {
      try {
        const segments = await buildCachedFerrySegments(route);
        const totalDist = segments.reduce((s, seg) => s + seg.distance, 0);
        const totalDur = segments.reduce((s, seg) => s + seg.duration, 0);
        return {
          routeName: route.name,
          originPort: route.originPort,
          destPort: route.destPort,
          operators: (route as any).operators || [],
          distanceKm: (route as any).distanceKm || 0,
          estimatedDurationMin: (route as any).estimatedDurationMin || 0,
          segments,
          totalDistance: totalDist,
          totalDuration: totalDur,
        };
      } catch (e) {
        console.error('Alt ferry route failed:', e);
        return null;
      }
    }));
    alternatives.push(...results.filter(Boolean));
    // Small delay between batches to respect ORS rate limits
    if (i + BATCH_SIZE < ferryRoutes.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return { primary, alternatives };
}

async function buildFerrySegments(
  orsKey: string,
  from: Waypoint,
  to: Waypoint,
  ferryRoute: FerryRouteResult,
  roadPreference: RoadPreference,
): Promise<SegmentResult[]> {
  const segments: SegmentResult[] = [];

  // Segment 1: Drive from origin to departure port (if > 1km)
  const distToPort = haversineDistance(from.lat, from.lng, ferryRoute.originPort.lat, ferryRoute.originPort.lng);
  if (distToPort > 1000) {
    const portWp: Waypoint = { lat: ferryRoute.originPort.lat, lng: ferryRoute.originPort.lng, transportMode: 'driving' };
    segments.push(await calculateORSSegment(orsKey, from, portWp, 'driving', roadPreference));
  }

  // Segment 2: Ferry crossing
  const ferryDistance = computePolylineDistance(ferryRoute.geometry);
  const ferryDuration = (ferryRoute as any).estimatedDurationMin 
    ? (ferryRoute as any).estimatedDurationMin * 60  // Use real duration from DB (seconds)
    : ferryDistance / (30 * 1000 / 3600);  // Fallback: estimate at 30 km/h
  segments.push({
    geometry: { type: 'LineString', coordinates: ferryRoute.geometry },
    distance: ferryDistance,
    duration: ferryDuration,
    transportMode: 'ferry',
    originPort: ferryRoute.originPort,
    destinationPort: ferryRoute.destPort,
    routeName: ferryRoute.name,
    operators: (ferryRoute as any).operators || [],
    distanceKm: (ferryRoute as any).distanceKm || Math.round(ferryDistance / 1000),
  } as any);

  // Segment 3: Drive from arrival port to destination (if > 1km)
  const distFromPort = haversineDistance(ferryRoute.destPort.lat, ferryRoute.destPort.lng, to.lat, to.lng);
  if (distFromPort > 1000) {
    const portWp: Waypoint = { lat: ferryRoute.destPort.lat, lng: ferryRoute.destPort.lng, transportMode: 'driving' };
    segments.push(await calculateORSSegment(orsKey, portWp, to, 'driving', roadPreference));
  }

  return segments;
}

// Fallback: Nominatim-based port search (legacy)
async function buildFerryRouteFallback(
  orsKey: string,
  from: Waypoint,
  to: Waypoint,
  roadPreference: RoadPreference,
): Promise<SegmentResult[]> {
  const [originPort, destPort] = await Promise.all([
    findNearestFerryPort(from.lat, from.lng),
    findNearestFerryPort(to.lat, to.lng),
  ]);

  if (!originPort || !destPort) {
    return [calculateArcSegment(from, to, 'ferry')];
  }

  const portDist = haversineDistance(originPort.lat, originPort.lng, destPort.lat, destPort.lng);
  if (portDist < 5000) {
    return [await calculateORSSegment(orsKey, from, to, 'driving', roadPreference)];
  }

  const segments: SegmentResult[] = [];

  const distToPort = haversineDistance(from.lat, from.lng, originPort.lat, originPort.lng);
  if (distToPort > 1000) {
    const portWp: Waypoint = { lat: originPort.lat, lng: originPort.lng, transportMode: 'driving' };
    segments.push(await calculateORSSegment(orsKey, from, portWp, 'driving', roadPreference));
  }

  const portFrom: Waypoint = { lat: originPort.lat, lng: originPort.lng, transportMode: 'ferry' };
  const portTo: Waypoint = { lat: destPort.lat, lng: destPort.lng, transportMode: 'ferry' };
  const ferryArc = calculateArcSegment(portFrom, portTo, 'ferry');
  segments.push({
    ...ferryArc,
    originPort: { name: originPort.name, lat: originPort.lat, lng: originPort.lng },
    destinationPort: { name: destPort.name, lat: destPort.lat, lng: destPort.lng },
  } as any);

  const distFromPort = haversineDistance(destPort.lat, destPort.lng, to.lat, to.lng);
  if (distFromPort > 1000) {
    const portWp: Waypoint = { lat: destPort.lat, lng: destPort.lng, transportMode: 'driving' };
    segments.push(await calculateORSSegment(orsKey, portWp, to, 'driving', roadPreference));
  }

  return segments;
}

interface FerryRouteResult {
  name: string;
  originPort: { name: string; lat: number; lng: number };
  destPort: { name: string; lat: number; lng: number };
  geometry: number[][]; // [lng, lat] pairs
}

async function findRealFerryRoutes(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
): Promise<FerryRouteResult[]> {
  // PRIMARY SOURCE: Internal ferry_routes table
  const dbRoutes = await findFerryRoutesFromDB(originLat, originLng, destLat, destLng);
  
  if (dbRoutes.length > 0) {
    console.log(`Found ${dbRoutes.length} ferry routes from DB:`, dbRoutes.map(r => r.name));
    return dbRoutes;
  }

  console.log('No DB ferry routes found, trying Overpass...');
  return findFerryRoutesFromOverpass(originLat, originLng, destLat, destLng);
}

async function findFerryRoutesFromDB(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
): Promise<FerryRouteResult[]> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await sb
      .from('ferry_routes')
      .select('*')
      .eq('is_active', true);

    if (error || !data?.length) {
      console.error('DB ferry query error:', error);
      return [];
    }

    const directDist = haversineDistance(originLat, originLng, destLat, destLng);
    const candidates: { route: FerryRouteResult; score: number; portKey: string }[] = [];

    for (const row of data) {
      const driveOrig1 = haversineDistance(originLat, originLng, row.origin_lat, row.origin_lng);
      const driveDest1 = haversineDistance(destLat, destLng, row.destination_lat, row.destination_lng);
      const driveOrig2 = haversineDistance(originLat, originLng, row.destination_lat, row.destination_lng);
      const driveDest2 = haversineDistance(destLat, destLng, row.origin_lat, row.origin_lng);

      const driveDist1 = driveOrig1 + driveDest1;
      const driveDist2 = driveOrig2 + driveDest2;
      const isReversed = driveDist2 < driveDist1;

      const ferryDist = (row.distance_km || 0) * 1000;
      if (ferryDist < 5000) continue;

      const driveFromPort = isReversed ? driveDest2 : driveDest1;
      if (driveFromPort > 500_000) continue;
      if (driveFromPort >= directDist * 0.9) continue;

      const drivingDist = Math.min(driveDist1, driveDist2);
      if ((drivingDist + ferryDist) > directDist * 3) continue;

      // SCORING: Prioritize MINIMUM CROSSING distance
      // Shorter ferry/flight = better (user's primary mode dominates)
      const crossingDistScore = ferryDist / 1000;

      const originPort = isReversed
        ? { name: row.destination_port_name, lat: row.destination_lat, lng: row.destination_lng }
        : { name: row.origin_port_name, lat: row.origin_lat, lng: row.origin_lng };
      const destPort = isReversed
        ? { name: row.origin_port_name, lat: row.origin_lat, lng: row.origin_lng }
        : { name: row.destination_port_name, lat: row.destination_lat, lng: row.destination_lng };

      const arcCoords = generateArc(originPort.lat, originPort.lng, destPort.lat, destPort.lng, 20);
      const portKey = `${Math.round(originPort.lat * 10)},${Math.round(originPort.lng * 10)}-${Math.round(destPort.lat * 10)},${Math.round(destPort.lng * 10)}`;

      candidates.push({
        score: crossingDistScore,
        portKey,
        route: {
          name: row.route_name,
          originPort,
          destPort,
          geometry: arcCoords,
          operators: row.operators,
          estimatedDurationMin: row.estimated_duration_minutes,
          distanceKm: row.distance_km,
        } as any,
      });
    }

    // Sort by crossing distance (shortest first) — return ALL viable
    candidates.sort((a, b) => a.score - b.score);
    // Cap at 10 to avoid overloading UI/map
    const MAX_ROUTES = 10;
    const seen = new Set<string>();
    const results: FerryRouteResult[] = [];
    for (const c of candidates) {
      if (seen.has(c.portKey)) continue;
      seen.add(c.portKey);
      results.push(c.route);
      if (results.length >= MAX_ROUTES) break;
    }

    return results;
  } catch (e) {
    console.error('DB ferry search failed:', e);
    return [];
  }
}

// ─── Overpass fallback ferry route search ────────────────────────────────

async function findFerryRoutesFromOverpass(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
): Promise<FerryRouteResult[]> {
  try {
    const minLat = Math.min(originLat, destLat) - 2;
    const maxLat = Math.max(originLat, destLat) + 2;
    const minLng = Math.min(originLng, destLng) - 2;
    const maxLng = Math.max(originLng, destLng) + 2;

    const query = `[out:json][timeout:20];way["route"="ferry"](${minLat},${minLng},${maxLat},${maxLng});out geom 100;`;

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Vandits/1.0' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) return [];

    const data = await res.json();
    const elements = data?.elements || [];
    if (elements.length === 0) return [];

    const directDist = haversineDistance(originLat, originLng, destLat, destLng);
    const DRIVE_SPEED = 80;
    const FERRY_SPEED = 30;
    const candidates: { route: FerryRouteResult; score: number; portKey: string }[] = [];

    for (const el of elements) {
      const geom = el.geometry;
      if (!geom || geom.length < 2) continue;

      const tags = el.tags || {};
      const name = tags.name || 'Ruta de ferry';
      const startPt = geom[0];
      const endPt = geom[geom.length - 1];

      const ferryLen = haversineDistance(startPt.lat, startPt.lon, endPt.lat, endPt.lon);
      if (ferryLen < 10000) continue;

      const d1 = haversineDistance(originLat, originLng, startPt.lat, startPt.lon)
               + haversineDistance(destLat, destLng, endPt.lat, endPt.lon);
      const d2 = haversineDistance(originLat, originLng, endPt.lat, endPt.lon)
               + haversineDistance(destLat, destLng, startPt.lat, startPt.lon);
      const isReversed = d2 < d1;
      const drivingDist = Math.min(d1, d2);

      if (drivingDist > ferryLen * 2) continue;
      if ((drivingDist + ferryLen) > directDist * 4) continue;

      const totalTimeH = (drivingDist / 1000) / DRIVE_SPEED + (ferryLen / 1000) / FERRY_SPEED;

      const coords: number[][] = isReversed
        ? geom.map((p: any) => [p.lon, p.lat]).reverse()
        : geom.map((p: any) => [p.lon, p.lat]);

      const originPt = isReversed ? endPt : startPt;
      const destPtFinal = isReversed ? startPt : endPt;
      const portKey = `${Math.round(originPt.lat * 10)},${Math.round(originPt.lon * 10)}-${Math.round(destPtFinal.lat * 10)},${Math.round(destPtFinal.lon * 10)}`;

      candidates.push({
        score: totalTimeH,
        portKey,
        route: {
          name,
          originPort: { name: extractPortName(name, true), lat: originPt.lat, lng: originPt.lon },
          destPort: { name: extractPortName(name, false), lat: destPtFinal.lat, lng: destPtFinal.lon },
          geometry: coords,
        },
      });
    }

    candidates.sort((a, b) => a.score - b.score);
    const seen = new Set<string>();
    const results: FerryRouteResult[] = [];
    for (const c of candidates) {
      if (seen.has(c.portKey)) continue;
      seen.add(c.portKey);
      results.push(c.route);
    }

    return results;
  } catch (e) {
    console.error('Overpass ferry search failed:', e);
    return [];
  }
}

function extractPortName(routeName: string, isOrigin: boolean): string {
  // Try to extract port names from route name like "Barcelona - Porto Torres"
  const parts = routeName.split(/\s*[-–—]\s*/);
  if (parts.length >= 2) {
    return isOrigin ? parts[0].trim() : parts[parts.length - 1].trim();
  }
  return routeName;
}

function computePolylineDistance(coords: number[][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return total;
}

async function findNearestFerryPort(
  lat: number,
  lng: number,
): Promise<{ name: string; lat: number; lng: number } | null> {
  try {
    const delta = 1.5;
    const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent('ferry terminal')}&format=json&limit=10&bounded=1&viewbox=${viewbox}` +
      `&accept-language=es`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Vandits/1.0' },
    });
    if (!res.ok) { await res.text(); return null; }

    const data = await res.json();
    if (!data?.length) return null;

    let closest: { name: string; lat: number; lng: number } | null = null;
    let minDist = Infinity;

    for (const item of data) {
      const elLat = parseFloat(item.lat);
      const elLng = parseFloat(item.lon);
      if (!elLat || !elLng) continue;
      const dist = haversineDistance(lat, lng, elLat, elLng);
      const name = item.display_name?.split(',')[0] || 'Terminal ferry';
      if (dist < minDist) {
        minDist = dist;
        closest = { name, lat: elLat, lng: elLng };
      }
    }

    return closest;
  } catch (e) {
    console.error('Ferry port search failed:', e);
    return null;
  }
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
