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

// Module-level config — overridden per request by client params
let ARC_SPEEDS: Record<string, number> = {
  flight: 800 * 1000 / 3600,
  ferry: 30 * 1000 / 3600,
};
let CFG_CAR_SPEED_KMH = 80;
let CFG_PORT_SEARCH_RADIUS_M = 2000;
let CFG_MAX_FALLBACK_SEGMENT_M = 1000;

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
    if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY not configured');

    const {
      waypoints,
      roadPreference = 'fastest',
      searchFerries = true,
      searchFlights = true,
      alternativeSearchThresholdKm = 20,
      flightSearchThresholdKm = 100,
      maxAlternatives = 10,
      skipAlternatives = false,
      carSpeedKmh = 80,
      ferrySpeedKmh = 30,
      flightSpeedKmh = 800,
      portSearchRadiusM = 2000,
      maxFallbackSegmentM = 1000,
    } = await req.json() as {
      waypoints: Waypoint[];
      roadPreference?: RoadPreference;
      searchFerries?: boolean;
      searchFlights?: boolean;
      alternativeSearchThresholdKm?: number;
      flightSearchThresholdKm?: number;
      maxAlternatives?: number;
      skipAlternatives?: boolean;
      carSpeedKmh?: number;
      ferrySpeedKmh?: number;
      flightSpeedKmh?: number;
      portSearchRadiusM?: number;
      maxFallbackSegmentM?: number;
    };

    ARC_SPEEDS = {
      flight: flightSpeedKmh * 1000 / 3600,
      ferry: ferrySpeedKmh * 1000 / 3600,
    };
    CFG_CAR_SPEED_KMH = carSpeedKmh;
    CFG_PORT_SEARCH_RADIUS_M = portSearchRadiusM;
    CFG_MAX_FALLBACK_SEGMENT_M = maxFallbackSegmentM;

    if (!waypoints || waypoints.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 waypoints' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const from = waypoints[0];
    const to = waypoints[waypoints.length - 1];
    const mode = from.transportMode || 'driving';
    const directDistKm = haversineDistance(from.lat, from.lng, to.lat, to.lng) / 1000;

    // ─── GLOBAL LOGIC: always try all viable modes and return alternatives ───

    // 1) Try primary mode (driving/walking)
    // 1) Try primary mode (driving/walking)
    let primaryResult: { segments: SegmentResult[]; totalDistance: number; totalDuration: number } | null = null;
    let primaryImpossible = false;
    let primaryHasFerry = false;

    if (mode === 'driving' || mode === 'walking') {
      // Walking is impossible across oceans/continents — detect early
      if (mode === 'walking') {
        // Check if route contains impossibly long straight segments (ocean crossings)
        // ORS sometimes returns routes through ferry connections for foot-walking
        const MAX_WALKING_DIRECT_KM = 500;
        if (directDistKm > MAX_WALKING_DIRECT_KM) {
          primaryImpossible = true;
        } else {
          const result = await calculateORSSegment(apiKey, from, to, 'walking', roadPreference);
          if ((result as any)._isFallback && directDistKm > 30) {
            primaryImpossible = true;
          } else {
            // Detect if ORS route has suspiciously straight segments over water
            const hasOceanCrossing = detectStraightSegmentsInRoute(result, 50_000); // 50km straight = likely sea
            if (hasOceanCrossing) {
              primaryImpossible = true;
            } else {
              primaryResult = {
                segments: [result],
                totalDistance: result.distance,
                totalDuration: result.duration,
              };
            }
          }
        }
      } else {
        // Driving mode
        let result = await calculateORSSegment(apiKey, from, to, mode as 'walking' | 'driving', roadPreference);

        // If scenic mode fails on long routes, retry with fastest
        if ((result as any)._isFallback && roadPreference === 'scenic' && directDistKm > 200) {
          console.warn(`Scenic route fallback on ${Math.round(directDistKm)}km — retrying with fastest`);
          result = await calculateORSSegment(apiKey, from, to, mode as 'walking' | 'driving', 'fastest');
        }

        if ((result as any)._isFallback && directDistKm > 50) {
          primaryImpossible = true;
        } else {
          // Detect hidden sea crossings (ORS embeds OSM ferry ways as straight driving segments)
          const { hasFerryCrossing, maxSegmentKm } = detectHiddenFerryCrossings(result);
          
          // ALWAYS try to split at known ferry ports first — this catches both:
          // - Routes with hidden sea crossings (large straight segments)
          // - Routes through short straits (small segments near ferry ports)
          // - Routes with MULTIPLE ferry crossings (e.g. continent→Corsica→Sardinia)
          const splitResult = await splitRouteAtFerryPorts(result);
          if (splitResult) {
            const totalDistance = splitResult.reduce((s, seg) => s + seg.distance, 0);
            const totalDuration = splitResult.reduce((s, seg) => s + seg.duration, 0);
            primaryResult = { segments: splitResult, totalDistance, totalDuration };
            primaryHasFerry = splitResult.some(s => s.transportMode === 'ferry');
            console.log(`Split driving route at ferry ports: ${splitResult.length} segments (${splitResult.filter(s => s.transportMode === 'ferry').length} ferries)`);
          } else if (hasFerryCrossing) {
            // No port matches found but route has obvious sea crossing → search for ferry routes from scratch
            console.warn(`Driving route contains sea crossing (${maxSegmentKm.toFixed(1)}km) — searching real ferry routes`);
            const ferryResult = await buildFerryRouteWithAlternatives(apiKey, from, to, roadPreference);
            if (ferryResult.primary.length > 0) {
              const totalDistance = ferryResult.primary.reduce((s, seg) => s + seg.distance, 0);
              const totalDuration = ferryResult.primary.reduce((s, seg) => s + seg.duration, 0);
              primaryResult = {
                segments: ferryResult.primary,
                totalDistance,
                totalDuration,
              };
              console.log(`Built composite route with ${ferryResult.primary.length} segments using real ferry routes`);
            } else {
              console.warn('No real ferry route found for sea crossing — marking impossible');
              primaryImpossible = true;
            }
          } else {
            // Pure land route — use as-is
            primaryResult = {
              segments: [result],
              totalDistance: result.distance,
              totalDuration: result.duration,
            };
          }
        }
      }
    } else if (mode === 'flight') {
      const flightSegments = await buildFlightRoute(apiKey, from, to, roadPreference);
      const totalDistance = flightSegments.reduce((s, seg) => s + seg.distance, 0);
      const totalDuration = flightSegments.reduce((s, seg) => s + seg.duration, 0);
      primaryResult = { segments: flightSegments, totalDistance, totalDuration };
    } else if (mode === 'ferry') {
      const ferryResult = await buildFerryRouteWithAlternatives(apiKey, from, to, roadPreference);
      if (ferryResult.primary.length > 0) {
        const totalDistance = ferryResult.primary.reduce((s, seg) => s + seg.distance, 0);
        const totalDuration = ferryResult.primary.reduce((s, seg) => s + seg.duration, 0);
        primaryResult = { segments: ferryResult.primary, totalDistance, totalDuration };
      }
    }

    // 2) Search for alternatives only when enabled and thresholds met
    const alternatives: any[] = [];
    const shouldSearchAlternatives = !skipAlternatives && directDistKm > alternativeSearchThresholdKm;

    if (shouldSearchAlternatives) {
      // Ferry alternatives (only if enabled AND primary doesn't already include ferry segments)
      if (searchFerries && mode !== 'ferry' && !primaryHasFerry) {
        const ferryResult = await buildFerryRouteWithAlternatives(apiKey, from, to, roadPreference);
        
        if (ferryResult.primary.length > 0) {
          const totalDist = ferryResult.primary.reduce((s, seg) => s + seg.distance, 0);
          const totalDur = ferryResult.primary.reduce((s, seg) => s + seg.duration, 0);
          const ferrySeg = ferryResult.primary.find((s: any) => s.transportMode === 'ferry');
          alternatives.push({
            mode: 'ferry',
            label: ferrySeg ? `⛴ ${(ferrySeg as any).originPort?.name || '?'} → ${(ferrySeg as any).destinationPort?.name || '?'}` : '⛴ Ferry',
            segments: ferryResult.primary,
            totalDistance: totalDist,
            totalDuration: totalDur,
          });

          for (const alt of ferryResult.alternatives) {
            alternatives.push({
              mode: 'ferry',
              label: `⛴ ${alt.originPort?.name || '?'} → ${alt.destPort?.name || '?'}`,
              segments: alt.segments,
              totalDistance: alt.totalDistance,
              totalDuration: alt.totalDuration,
            });
          }
        }
      }

      // Flight alternative (only if enabled and distance threshold met)
      if (searchFlights && mode !== 'flight' && directDistKm > flightSearchThresholdKm) {
        try {
          const flightSegments = await buildFlightRoute(apiKey, from, to, roadPreference);
          if (flightSegments.length > 0) {
            const totalDist = flightSegments.reduce((s, seg) => s + seg.distance, 0);
            const totalDur = flightSegments.reduce((s, seg) => s + seg.duration, 0);
            const flightSeg = flightSegments.find(s => s.transportMode === 'flight');
            const originAp = (flightSeg as any)?.originAirport;
            const destAp = (flightSeg as any)?.destinationAirport;
            const label = originAp?.iata && destAp?.iata
              ? `✈ ${originAp.iata} → ${destAp.iata}`
              : '✈ Vuelo';
            alternatives.push({
              mode: 'flight',
              label,
              segments: flightSegments,
              totalDistance: totalDist,
              totalDuration: totalDur,
            });
          }
        } catch (e) {
          console.error('Flight alternative failed:', e);
        }
      }
    }

    // Limit alternatives to maxAlternatives
    const limitedAlternatives = alternatives.slice(0, maxAlternatives);

    // 3) If still no primary, keep the requested mode as impossible and return alternatives separately
    if (!primaryResult) {
      return new Response(
        JSON.stringify({
          routeImpossible: true,
          reason: directDistKm > 300 ? 'ocean_or_continent_crossing' : 'no_road_connection',
          directDistanceKm: Math.round(directDistKm),
          suggestedModes: ['ferry', 'flight'],
          alternatives: limitedAlternatives,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4) Return unified response
    const response: any = {
      segments: primaryResult.segments,
      totalDistance: primaryResult.totalDistance,
      totalDuration: primaryResult.totalDuration,
    };

    if (limitedAlternatives.length > 0) {
      response.alternatives = limitedAlternatives;
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('calculate-route error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
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
    console.warn('No real ferry routes found — ferry not viable for this route');
    return { primary: [], alternatives: [] };
  }

  // ORS route cache to avoid duplicate calls for shared origin→port / port→dest legs
  const orsCache = new Map<string, SegmentResult>();

  async function cachedORSSegment(a: Waypoint, b: Waypoint, mode: 'walking' | 'driving'): Promise<SegmentResult> {
    const key = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}-${b.lat.toFixed(5)},${b.lng.toFixed(5)}-${mode}`;
    if (orsCache.has(key)) return orsCache.get(key)!;
    // Ferry driving legs always use 'fastest' — scenic fails on long distances
    const result = await calculateORSSegment(orsKey, a, b, mode, 'fastest');
    orsCache.set(key, result);
    return result;
  }

  // Returns null if driving legs are unroutable (ocean crossing fallback)
  async function buildCachedFerrySegments(route: FerryRouteResult): Promise<SegmentResult[] | null> {
    // Handle chained (2-hop) routes
    if ((route as any)._chain && (route as any)._chain.length === 2) {
      return buildChainedFerrySegments(route);
    }

    const segments: SegmentResult[] = [];
    const distToPort = haversineDistance(from.lat, from.lng, route.originPort.lat, route.originPort.lng);
    if (distToPort > 1000) {
      const portWp: Waypoint = { lat: route.originPort.lat, lng: route.originPort.lng, transportMode: 'driving' };
      const leg = await cachedORSSegment(from, portWp, 'driving');
      if ((leg as any)._isFallback && distToPort > 1_000) {
        console.warn(`Rejecting ferry route ${route.name}: origin driving leg unroutable (${Math.round(distToPort/1000)}km)`);
        return null;
      }
      segments.push(leg);
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
      const leg = await cachedORSSegment(portWp, to, 'driving');
      if ((leg as any)._isFallback && distFromPort > 1_000) {
        console.warn(`Rejecting ferry route ${route.name}: dest driving leg unroutable (${Math.round(distFromPort/1000)}km)`);
        return null;
      }
      segments.push(leg);
    }
    return segments;
  }

  // Build segments for a 2-hop chained ferry route: drive → ferry1 → transfer drive → ferry2 → drive
  async function buildChainedFerrySegments(route: FerryRouteResult): Promise<SegmentResult[] | null> {
    const chain = (route as any)._chain as FerryRouteResult[];
    const transferPort = (route as any)._transferPort as { name: string; lat: number; lng: number };
    const ferry1 = chain[0];
    const ferry2 = chain[1];
    const segments: SegmentResult[] = [];

    // Leg 1: Drive origin → ferry1 origin port
    const distToPort1 = haversineDistance(from.lat, from.lng, ferry1.originPort.lat, ferry1.originPort.lng);
    if (distToPort1 > 1000) {
      const portWp: Waypoint = { lat: ferry1.originPort.lat, lng: ferry1.originPort.lng, transportMode: 'driving' };
      const leg = await cachedORSSegment(from, portWp, 'driving');
      if ((leg as any)._isFallback && distToPort1 > 1_000) return null;
      segments.push(leg);
    }

    // Leg 2: Ferry 1
    const ferry1Dist = computePolylineDistance(ferry1.geometry);
    const ferry1Dur = (ferry1 as any).estimatedDurationMin
      ? (ferry1 as any).estimatedDurationMin * 60
      : ferry1Dist / (30 * 1000 / 3600);
    segments.push({
      geometry: { type: 'LineString', coordinates: ferry1.geometry },
      distance: ferry1Dist, duration: ferry1Dur, transportMode: 'ferry',
      originPort: ferry1.originPort, destinationPort: ferry1.destPort,
      routeName: ferry1.name,
      operators: (ferry1 as any).operators || [],
      distanceKm: (ferry1 as any).ferryDistKm || Math.round(ferry1Dist / 1000),
    } as any);

    // Leg 3: Transfer drive ferry1.destPort → ferry2.originPort (if needed)
    const transferDist = haversineDistance(ferry1.destPort.lat, ferry1.destPort.lng, transferPort.lat, transferPort.lng);
    if (transferDist > 1000) {
      const fromWp: Waypoint = { lat: ferry1.destPort.lat, lng: ferry1.destPort.lng, transportMode: 'driving' };
      const toWp: Waypoint = { lat: transferPort.lat, lng: transferPort.lng, transportMode: 'driving' };
      const leg = await cachedORSSegment(fromWp, toWp, 'driving');
      if ((leg as any)._isFallback && transferDist > 50_000) return null;
      segments.push(leg);
    }

    // Leg 4: Ferry 2
    const ferry2Dist = computePolylineDistance(ferry2.geometry);
    const ferry2Dur = (ferry2 as any).estimatedDurationMin
      ? (ferry2 as any).estimatedDurationMin * 60
      : ferry2Dist / (30 * 1000 / 3600);
    segments.push({
      geometry: { type: 'LineString', coordinates: ferry2.geometry },
      distance: ferry2Dist, duration: ferry2Dur, transportMode: 'ferry',
      originPort: ferry2.originPort, destinationPort: ferry2.destPort,
      routeName: ferry2.name,
      operators: (ferry2 as any).operators || [],
      distanceKm: (ferry2 as any).ferryDistKm || Math.round(ferry2Dist / 1000),
    } as any);

    // Leg 5: Drive ferry2.destPort → destination
    const distFromPort2 = haversineDistance(ferry2.destPort.lat, ferry2.destPort.lng, to.lat, to.lng);
    if (distFromPort2 > 1000) {
      const portWp: Waypoint = { lat: ferry2.destPort.lat, lng: ferry2.destPort.lng, transportMode: 'driving' };
      const leg = await cachedORSSegment(portWp, to, 'driving');
      if ((leg as any)._isFallback && distFromPort2 > 1_000) return null;
      segments.push(leg);
    }

    return segments;
  }

  // Build primary — try candidates in order until one works
  let primary: SegmentResult[] | null = null;
  let primaryIndex = 0;
  for (let i = 0; i < ferryRoutes.length; i++) {
    const result = await buildCachedFerrySegments(ferryRoutes[i]);
    if (result) {
      primary = result;
      primaryIndex = i;
      break;
    }
    if (i < ferryRoutes.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  // If no viable ferry route found at all, return empty so client knows ferry isn't viable
  if (!primary) {
    console.warn('All ferry route candidates had unroutable driving legs — ferry not viable for this route');
    return { primary: [], alternatives: [] };
  }

  // Build alternatives SEQUENTIALLY to avoid ORS rate limits
  const alternatives: any[] = [];
  for (let i = 0; i < ferryRoutes.length; i++) {
    if (i === primaryIndex) continue;
    try {
      const route = ferryRoutes[i];
      const segments = await buildCachedFerrySegments(route);
      if (!segments) continue; // skip unroutable alternatives
      const totalDist = segments.reduce((s, seg) => s + seg.distance, 0);
      const totalDur = segments.reduce((s, seg) => s + seg.duration, 0);
      alternatives.push({
        routeName: route.name,
        originPort: route.originPort,
        destPort: route.destPort,
        operators: (route as any).operators || [],
        distanceKm: (route as any).distanceKm || 0,
        estimatedDurationMin: (route as any).estimatedDurationMin || 0,
        segments,
        totalDistance: totalDist,
        totalDuration: totalDur,
      });
    } catch (e) {
      console.error('Alt ferry route failed:', e);
    }
    if (i < ferryRoutes.length - 1) {
      await new Promise(r => setTimeout(r, 300));
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
    // No ports found — ferry not viable, return empty
    return [];
  }

  const portDist = haversineDistance(originPort.lat, originPort.lng, destPort.lat, destPort.lng);
  if (portDist < 5000) {
    return [await calculateORSSegment(orsKey, from, to, 'driving', roadPreference)];
  }

  const segments: SegmentResult[] = [];

  const distToPort = haversineDistance(from.lat, from.lng, originPort.lat, originPort.lng);
  if (distToPort > 1000) {
    const portWp: Waypoint = { lat: originPort.lat, lng: originPort.lng, transportMode: 'driving' };
    const leg = await calculateORSSegment(orsKey, from, portWp, 'driving', roadPreference);
    // Reject if driving to port is unroutable over long distance
    if ((leg as any)._isFallback && distToPort > 1_000) {
      console.warn('Ferry fallback: origin driving leg unroutable, ferry not viable');
      return [];
    }
    segments.push(leg);
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
    const leg = await calculateORSSegment(orsKey, portWp, to, 'driving', roadPreference);
    if ((leg as any)._isFallback && distFromPort > 1_000) {
      console.warn('Ferry fallback: dest driving leg unroutable, ferry not viable');
      return [];
    }
    segments.push(leg);
  }

  return segments;
}

interface FerryRouteResult {
  name: string;
  originPort: { name: string; lat: number; lng: number };
  destPort: { name: string; lat: number; lng: number };
  geometry: number[][]; // [lng, lat] pairs
  _chain?: FerryRouteResult[]; // for 2-hop chained routes
  _transferPort?: { name: string; lat: number; lng: number };
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

    // Build port-to-route index for chaining
    interface DBFerryRow {
      id: string; route_name: string;
      origin_port_name: string; origin_lat: number; origin_lng: number;
      destination_port_name: string; destination_lat: number; destination_lng: number;
      distance_km: number | null; estimated_duration_minutes: number | null;
      operators: string[] | null;
    }

    // Helper to create FerryRouteResult from a DB row
    function rowToRoute(row: DBFerryRow, reversed: boolean): FerryRouteResult & { ferryDistKm: number; estimatedDurationMin: number | null; operators: string[] } {
      const originPort = reversed
        ? { name: row.destination_port_name, lat: row.destination_lat, lng: row.destination_lng }
        : { name: row.origin_port_name, lat: row.origin_lat, lng: row.origin_lng };
      const destPort = reversed
        ? { name: row.origin_port_name, lat: row.origin_lat, lng: row.origin_lng }
        : { name: row.destination_port_name, lat: row.destination_lat, lng: row.destination_lng };
      const arcCoords = generateArc(originPort.lat, originPort.lng, destPort.lat, destPort.lng, 20);
      return {
        name: row.route_name,
        originPort,
        destPort,
        geometry: arcCoords,
        ferryDistKm: row.distance_km || 0,
        estimatedDurationMin: row.estimated_duration_minutes,
        operators: row.operators || [],
      } as any;
    }

    // ─── DIRECT (1-hop) ferry candidates ───
    const directCandidates: { route: FerryRouteResult; seaDist: number; portKey: string }[] = [];

    for (const row of data) {
      const ferryDist = (row.distance_km || 0) * 1000;
      if (ferryDist < 5000) continue;

      const driveOrig1 = haversineDistance(originLat, originLng, row.origin_lat, row.origin_lng);
      const driveDest1 = haversineDistance(destLat, destLng, row.destination_lat, row.destination_lng);
      const driveOrig2 = haversineDistance(originLat, originLng, row.destination_lat, row.destination_lng);
      const driveDest2 = haversineDistance(destLat, destLng, row.origin_lat, row.origin_lng);

      const driveDist1 = driveOrig1 + driveDest1;
      const driveDist2 = driveOrig2 + driveDest2;
      const isReversed = driveDist2 < driveDist1;

      const driveFromPort = isReversed ? driveDest2 : driveDest1;
      if (driveFromPort > 500_000) continue;
      if (driveFromPort >= directDist * 0.9) continue;

      const drivingDist = Math.min(driveDist1, driveDist2);
      if ((drivingDist + ferryDist) > directDist * 3) continue;

      const route = rowToRoute(row as any, isReversed);
      const portKey = `${Math.round(route.originPort.lat * 10)},${Math.round(route.originPort.lng * 10)}-${Math.round(route.destPort.lat * 10)},${Math.round(route.destPort.lng * 10)}`;

      directCandidates.push({ route, seaDist: ferryDist, portKey });
    }

    // ─── CHAINED (2-hop) ferry candidates ───
    // Find pairs of ferries where ferry1.destPort ≈ ferry2.originPort (within 50km by land)
    const chainedCandidates: { route: FerryRouteResult; seaDist: number; portKey: string }[] = [];
    const CHAIN_TRANSFER_RADIUS = 50_000; // 50km max between ports for transfer

    // Pre-compute oriented rows
    interface OrientedFerry {
      row: DBFerryRow;
      reversed: boolean;
      originPort: { name: string; lat: number; lng: number };
      destPort: { name: string; lat: number; lng: number };
      ferryDist: number;
    }

    const orientedRows: OrientedFerry[] = [];
    for (const row of data) {
      const ferryDist = (row.distance_km || 0) * 1000;
      if (ferryDist < 5000) continue;

      // Check both orientations for proximity to origin/destination
      const distOrigFwd = haversineDistance(originLat, originLng, row.origin_lat, row.origin_lng);
      const distOrigRev = haversineDistance(originLat, originLng, row.destination_lat, row.destination_lng);
      const distDestFwd = haversineDistance(destLat, destLng, row.destination_lat, row.destination_lng);
      const distDestRev = haversineDistance(destLat, destLng, row.origin_lat, row.origin_lng);

      // Forward orientation
      if (distOrigFwd < directDist * 1.5) {
        orientedRows.push({
          row: row as any, reversed: false, ferryDist,
          originPort: { name: row.origin_port_name, lat: row.origin_lat, lng: row.origin_lng },
          destPort: { name: row.destination_port_name, lat: row.destination_lat, lng: row.destination_lng },
        });
      }
      // Reverse orientation
      if (distOrigRev < directDist * 1.5) {
        orientedRows.push({
          row: row as any, reversed: true, ferryDist,
          originPort: { name: row.destination_port_name, lat: row.destination_lat, lng: row.destination_lng },
          destPort: { name: row.origin_port_name, lat: row.origin_lat, lng: row.origin_lng },
        });
      }
    }

    // Try chaining: ferry1 close to origin, ferry2 close to destination
    for (const f1 of orientedRows) {
      const driveToF1 = haversineDistance(originLat, originLng, f1.originPort.lat, f1.originPort.lng);
      if (driveToF1 > 500_000) continue; // must be drivable to first port

      for (const f2 of orientedRows) {
        if (f1.row.id === f2.row.id) continue;
        
        // f1.destPort must be near f2.originPort (transfer point)
        const transferDist = haversineDistance(f1.destPort.lat, f1.destPort.lng, f2.originPort.lat, f2.originPort.lng);
        if (transferDist > CHAIN_TRANSFER_RADIUS) continue;

        // f2.destPort must be near the destination
        const driveFromF2 = haversineDistance(f2.destPort.lat, f2.destPort.lng, destLat, destLng);
        if (driveFromF2 > 500_000) continue;

        const totalSeaDist = f1.ferryDist + f2.ferryDist;
        const totalDriveDist = driveToF1 + transferDist + driveFromF2;
        if ((totalSeaDist + totalDriveDist) > directDist * 4) continue;

        // Build a chained route — combine geometries
        const route1 = rowToRoute(f1.row, f1.reversed);
        const route2 = rowToRoute(f2.row, f2.reversed);

        const chainedRoute: FerryRouteResult = {
          name: `${route1.originPort.name} → ${route1.destPort.name} → ${route2.destPort.name}`,
          originPort: route1.originPort,
          destPort: route2.destPort,
          geometry: [...route1.geometry, ...route2.geometry],
          // Store chain info for segment building
          _chain: [route1, route2],
          _transferPort: f2.originPort,
        } as any;

        const portKey = `chain-${Math.round(route1.originPort.lat * 10)},${Math.round(route1.originPort.lng * 10)}-${Math.round(route2.destPort.lat * 10)},${Math.round(route2.destPort.lng * 10)}`;

        chainedCandidates.push({ route: chainedRoute, seaDist: totalSeaDist, portKey });
      }
    }

    // Merge and sort by estimated total travel time (driving@80km/h + ferry@30km/h)
    const DRIVE_SPEED_MS = 80_000 / 3600;
    const FERRY_SPEED_MS = 30_000 / 3600;
    const allCandidates = [...directCandidates, ...chainedCandidates];
    for (const c of allCandidates) {
      const driveToPort = haversineDistance(originLat, originLng, c.route.originPort.lat, c.route.originPort.lng);
      const driveFromPort = haversineDistance(destLat, destLng, c.route.destPort.lat, c.route.destPort.lng);
      (c as any)._estTime = (driveToPort + driveFromPort) / DRIVE_SPEED_MS + c.seaDist / FERRY_SPEED_MS;
    }
    allCandidates.sort((a, b) => (a as any)._estTime - (b as any)._estTime);

    // ─── Island filter: if some ferry routes land very close to the destination
    // (< 30 km, i.e. same island/mainland), deprioritize routes whose dest port
    // is much farther (> 80 km, i.e. a different island). This prevents showing
    // e.g. Palma de Mallorca alternatives when the user wants to go to Ibiza.
    const CLOSE_PORT_THRESHOLD = 30_000;   // 30 km — "same island"
    const FAR_PORT_THRESHOLD   = 80_000;   // 80 km — "different island"

    const hasClosePort = allCandidates.some(c => {
      const d = haversineDistance(destLat, destLng, c.route.destPort.lat, c.route.destPort.lng);
      return d < CLOSE_PORT_THRESHOLD;
    });

    const filteredCandidates = hasClosePort
      ? allCandidates.filter(c => {
          const d = haversineDistance(destLat, destLng, c.route.destPort.lat, c.route.destPort.lng);
          return d < FAR_PORT_THRESHOLD;
        })
      : allCandidates;

    const MAX_ROUTES = 10;
    const seen = new Set<string>();
    const results: FerryRouteResult[] = [];
    for (const c of filteredCandidates) {
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
    radiuses: [CFG_PORT_SEARCH_RADIUS_M, CFG_PORT_SEARCH_RADIUS_M],
  };

  if (roadPreference === 'scenic' && mode === 'driving') {
    body.options = { avoid_features: ['highways', 'tollways'] };
  }

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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

      if (response.status === 429) {
        const waitMs = (attempt + 1) * 1500;
        console.warn(`ORS rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await response.text(); // consume body
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

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
      if (attempt === MAX_RETRIES - 1) return straightLineFallback(from, to, mode);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return straightLineFallback(from, to, mode);
}

// splitEmbeddedFerryCrossings removed — ferry detection now uses real ports from ferry_routes DB

/**
 * Scan a driving route's geometry against known ferry_routes port pairs.
 * If the route passes within PORT_PROXIMITY_M of both ports of a ferry route
 * (in order along the route), split the driving segment into:
 *   drive → ferry → drive
 * This catches short straits (e.g. Messina) that ORS treats as driveable.
 */
async function splitRouteAtFerryPorts(result: SegmentResult): Promise<SegmentResult[] | null> {
  const coords = result.geometry?.coordinates;
  if (!coords || coords.length < 10) return null;

  const PORT_PROXIMITY_M = 5000; // 5km proximity to detect passing near a port

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Compute route bounding box to pre-filter ferry routes
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (let i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 50))) {
      const [lng, lat] = coords[i];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    // Also include last point
    const [lastLng, lastLat] = coords[coords.length - 1];
    if (lastLat < minLat) minLat = lastLat;
    if (lastLat > maxLat) maxLat = lastLat;
    if (lastLng < minLng) minLng = lastLng;
    if (lastLng > maxLng) maxLng = lastLng;

    // Expand bbox by ~50km (~0.5 deg)
    const BBOX_PAD = 0.5;

    const { data: ferryData } = await sb
      .from('ferry_routes')
      .select('route_name, origin_port_name, origin_lat, origin_lng, destination_port_name, destination_lat, destination_lng, distance_km, estimated_duration_minutes, operators')
      .eq('is_active', true)
      .gte('origin_lat', minLat - BBOX_PAD).lte('origin_lat', maxLat + BBOX_PAD)
      .gte('origin_lng', minLng - BBOX_PAD).lte('origin_lng', maxLng + BBOX_PAD);

    // Also fetch routes where destination is in bbox (origin might be outside)
    const { data: ferryData2 } = await sb
      .from('ferry_routes')
      .select('route_name, origin_port_name, origin_lat, origin_lng, destination_port_name, destination_lat, destination_lng, distance_km, estimated_duration_minutes, operators')
      .eq('is_active', true)
      .gte('destination_lat', minLat - BBOX_PAD).lte('destination_lat', maxLat + BBOX_PAD)
      .gte('destination_lng', minLng - BBOX_PAD).lte('destination_lng', maxLng + BBOX_PAD);

    // Merge and deduplicate by route_name
    const seenNames = new Set<string>();
    const allFerryData: typeof ferryData = [];
    for (const arr of [ferryData, ferryData2]) {
      if (!arr) continue;
      for (const r of arr) {
        if (!seenNames.has(r.route_name)) {
          seenNames.add(r.route_name);
          allFerryData.push(r);
        }
      }
    }

    if (allFerryData.length === 0) return null;

    // Sample coordinates to reduce haversine calls — every Nth point
    const SAMPLE_STEP = Math.max(1, Math.floor(coords.length / 200));
    const sampledIndices: number[] = [];
    for (let i = 0; i < coords.length; i += SAMPLE_STEP) {
      sampledIndices.push(i);
    }
    if (sampledIndices[sampledIndices.length - 1] !== coords.length - 1) {
      sampledIndices.push(coords.length - 1);
    }

    // Find ALL ferry crossings along the route, not just the first one
    interface FerryMatch {
      idxA: number;
      idxB: number;
      portA: { name: string; lat: number; lng: number };
      portB: { name: string; lat: number; lng: number };
      routeName: string;
      distanceKm: number | null;
      estimatedDurationMin: number | null;
      operators: string[] | null;
    }

    const allMatches: FerryMatch[] = [];

    for (const fr of allFerryData) {
      for (const reversed of [false, true]) {
        const portA = reversed
          ? { name: fr.destination_port_name, lat: fr.destination_lat, lng: fr.destination_lng }
          : { name: fr.origin_port_name, lat: fr.origin_lat, lng: fr.origin_lng };
        const portB = reversed
          ? { name: fr.origin_port_name, lat: fr.origin_lat, lng: fr.origin_lng }
          : { name: fr.destination_port_name, lat: fr.destination_lat, lng: fr.destination_lng };

        let bestIdxA = -1, bestDistA = Infinity;
        let bestIdxB = -1, bestDistB = Infinity;

        // Use sampled indices for initial scan
        for (const i of sampledIndices) {
          const [lng, lat] = coords[i];
          const dA = haversineDistance(lat, lng, portA.lat, portA.lng);
          const dB = haversineDistance(lat, lng, portB.lat, portB.lng);
          if (dA < bestDistA) { bestDistA = dA; bestIdxA = i; }
          if (dB < bestDistB) { bestDistB = dB; bestIdxB = i; }
        }

        // Quick reject if sampled scan is way off
        if (bestDistA > PORT_PROXIMITY_M * 3 || bestDistB > PORT_PROXIMITY_M * 3) continue;

        // Refine around best sampled indices with full resolution
        const refineRange = SAMPLE_STEP * 2;
        for (let i = Math.max(0, bestIdxA - refineRange); i <= Math.min(coords.length - 1, bestIdxA + refineRange); i++) {
          const [lng, lat] = coords[i];
          const dA = haversineDistance(lat, lng, portA.lat, portA.lng);
          if (dA < bestDistA) { bestDistA = dA; bestIdxA = i; }
        }
        for (let i = Math.max(0, bestIdxB - refineRange); i <= Math.min(coords.length - 1, bestIdxB + refineRange); i++) {
          const [lng, lat] = coords[i];
          const dB = haversineDistance(lat, lng, portB.lat, portB.lng);
          if (dB < bestDistB) { bestDistB = dB; bestIdxB = i; }
        }

        if (bestDistA > PORT_PROXIMITY_M || bestDistB > PORT_PROXIMITY_M) continue;
        if (bestIdxA >= bestIdxB) continue;
        if (bestIdxB - bestIdxA < 3) continue;

        // Check that the ferry distance is meaningful (> 5km)
        const ferryDist = fr.distance_km ? fr.distance_km * 1000 : haversineDistance(portA.lat, portA.lng, portB.lat, portB.lng);
        if (ferryDist < 5000) continue;

        allMatches.push({
          idxA: bestIdxA,
          idxB: bestIdxB,
          portA,
          portB,
          routeName: fr.route_name,
          distanceKm: fr.distance_km,
          estimatedDurationMin: fr.estimated_duration_minutes,
          operators: fr.operators,
        });
      }
    }

    if (allMatches.length === 0) return null;

    // Sort by idxA to process in route order
    allMatches.sort((a, b) => a.idxA - b.idxA);

    // Remove overlapping matches — keep the one with best port proximity for each region
    const filtered: FerryMatch[] = [];
    for (const match of allMatches) {
      const overlaps = filtered.some(f => 
        (match.idxA >= f.idxA && match.idxA <= f.idxB) ||
        (match.idxB >= f.idxA && match.idxB <= f.idxB)
      );
      if (!overlaps) filtered.push(match);
    }

    if (filtered.length === 0) return null;

    console.log(`Found ${filtered.length} ferry crossing(s) along route: ${filtered.map(f => `${f.portA.name} → ${f.portB.name}`).join(', ')}`);

    // Build segments: drive → ferry → drive → ferry → drive → ...
    const segments: SegmentResult[] = [];
    let lastIdx = 0;

    for (const match of filtered) {
      // Drive segment before this ferry (from lastIdx to match.idxA)
      if (match.idxA > lastIdx) {
        const driveCoords = coords.slice(lastIdx, match.idxA + 1);
        if (driveCoords.length >= 2) {
          const driveDist = computePolylineDistance(driveCoords);
          segments.push({
            geometry: { type: 'LineString', coordinates: driveCoords },
            distance: driveDist,
            duration: driveDist / (CFG_CAR_SPEED_KMH * 1000 / 3600),
            transportMode: 'driving',
          });
        }
      }

      // Ferry segment
      const ferryGeometry = generateArc(match.portA.lat, match.portA.lng, match.portB.lat, match.portB.lng, 20);
      const ferryDist = match.distanceKm ? match.distanceKm * 1000 : haversineDistance(match.portA.lat, match.portA.lng, match.portB.lat, match.portB.lng);
      const ferryDuration = match.estimatedDurationMin
        ? match.estimatedDurationMin * 60
        : ferryDist / (30 * 1000 / 3600);
      segments.push({
        geometry: { type: 'LineString', coordinates: ferryGeometry },
        distance: ferryDist,
        duration: ferryDuration,
        transportMode: 'ferry',
        originPort: match.portA,
        destinationPort: match.portB,
        routeName: match.routeName,
        operators: match.operators || [],
        distanceKm: match.distanceKm || Math.round(ferryDist / 1000),
      } as any);

      lastIdx = match.idxB;
    }

    // Final drive segment after last ferry
    if (lastIdx < coords.length - 1) {
      const driveCoords = coords.slice(lastIdx);
      if (driveCoords.length >= 2) {
        const driveDist = computePolylineDistance(driveCoords);
        segments.push({
          geometry: { type: 'LineString', coordinates: driveCoords },
          distance: driveDist,
          duration: driveDist / (CFG_CAR_SPEED_KMH * 1000 / 3600),
          transportMode: 'driving',
        });
      }
    }

    return segments.length > 1 ? segments : null;
  } catch (e) {
    console.error('splitRouteAtFerryPorts error:', e);
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function straightLineFallback(from: Waypoint, to: Waypoint, mode: string): SegmentResult & { _isFallback?: boolean } {
  const distance = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const speed = mode === 'walking' ? 5 * 1000 / 3600 : CFG_CAR_SPEED_KMH * 1000 / 3600;
  return {
    geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
    distance,
    duration: distance / speed,
    transportMode: mode,
    _isFallback: true,
  };
}

/**
 * Detect if an ORS route contains suspiciously long straight-line segments
 * (indicating ocean/sea crossings via OSM ferry ways embedded in walking routes).
 * Returns true if any consecutive coordinate pair exceeds the threshold.
 */
function detectStraightSegmentsInRoute(result: SegmentResult, thresholdMeters: number): boolean {
  const coords = result.geometry?.coordinates;
  if (!coords || coords.length < 2) return false;

  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dist = haversineDistance(lat1, lng1, lat2, lng2);
    if (dist > thresholdMeters) return true;
  }
  return false;
}

// Detect hidden ferry crossings in ORS driving results.
// ORS includes OSM ferry ways as part of driving routes, rendering them as
// suspiciously long straight-line segments over water. Any consecutive pair
// of coordinates separated by > 2km is likely a ferry crossing.
function detectHiddenFerryCrossings(result: SegmentResult): { hasFerryCrossing: boolean; maxSegmentKm: number } {
  const coords = result.geometry?.coordinates;
  if (!coords || coords.length < 2) return { hasFerryCrossing: false, maxSegmentKm: 0 };

  // Use CFG_MAX_FALLBACK_SEGMENT_M — allows short strait crossings but catches ocean crossings
  const THRESHOLD_M = Math.max(CFG_MAX_FALLBACK_SEGMENT_M, 8000);
  let maxSegmentM = 0;

  for (let i = 1; i < coords.length; i++) {
    const dist = haversineDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    if (dist > maxSegmentM) maxSegmentM = dist;
  }

  return {
    hasFerryCrossing: maxSegmentM > THRESHOLD_M,
    maxSegmentKm: maxSegmentM / 1000,
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
