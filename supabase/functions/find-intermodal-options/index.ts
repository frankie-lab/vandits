const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Point {
  lat: number;
  lng: number;
  name: string;
}

interface IntermodalOption {
  type: 'airport' | 'ferry_terminal';
  name: string;
  lat: number;
  lng: number;
  distanceFromPoint: number; // km
  nearPoint: 'origin' | 'destination';
}

interface IntermodalRoute {
  id: string;
  type: 'flight' | 'ferry';
  label: string;
  originHub: IntermodalOption;
  destinationHub: IntermodalOption;
  directDistance: number; // km between hubs
  totalOverhead: number; // km extra driving to/from hubs
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { origin, destination, radiusKm = 150 } = await req.json() as {
      origin: Point;
      destination: Point;
      radiusKm?: number;
    };

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan origin y destination' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if route likely crosses water by testing OSRM
    const osrmUrl = `https://router.project-osrm.org/route/v1/car/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    let roadRouteFailed = false;
    let roadDistance = 0;
    
    try {
      const osrmRes = await fetch(osrmUrl);
      const osrmData = await osrmRes.json();
      if (osrmData.code !== 'Ok' || !osrmData.routes?.length) {
        roadRouteFailed = true;
      } else {
        roadDistance = osrmData.routes[0].distance / 1000; // km
      }
    } catch {
      roadRouteFailed = true;
    }

    const directDistance = haversineDistance(origin.lat, origin.lng, destination.lat, destination.lng) / 1000;
    
    // Heuristic: suggest intermodal if road route failed, or road is >2x direct distance, or direct > 200km
    const roadRatio = roadDistance > 0 ? roadDistance / directDistance : Infinity;
    const shouldSuggestIntermodal = roadRouteFailed || roadRatio > 2.0 || directDistance > 200;

    if (!shouldSuggestIntermodal) {
      return new Response(
        JSON.stringify({ 
          needsIntermodal: false, 
          directDistance,
          roadDistance,
          options: [] 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query Overpass API — sequential to avoid rate limiting
    const originAirports = await queryOverpass('aerodrome', origin.lat, origin.lng, radiusKm);
    const destAirports = await queryOverpass('aerodrome', destination.lat, destination.lng, radiusKm);
    const originFerries = await queryOverpass('ferry_terminal', origin.lat, origin.lng, radiusKm);
    const destFerries = await queryOverpass('ferry_terminal', destination.lat, destination.lng, radiusKm);

    // Build intermodal route options
    const routes: IntermodalRoute[] = [];

    // Flight options: pair origin airports with destination airports
    for (const oAirport of originAirports.slice(0, 5)) {
      for (const dAirport of destAirports.slice(0, 5)) {
        const hubDistance = haversineDistance(oAirport.lat, oAirport.lng, dAirport.lat, dAirport.lng) / 1000;
        const overheadOrigin = haversineDistance(origin.lat, origin.lng, oAirport.lat, oAirport.lng) / 1000;
        const overheadDest = haversineDistance(destination.lat, destination.lng, dAirport.lat, dAirport.lng) / 1000;
        
        routes.push({
          id: `flight-${oAirport.name}-${dAirport.name}`,
          type: 'flight',
          label: `${oAirport.name} → ${dAirport.name}`,
          originHub: { ...oAirport, nearPoint: 'origin', distanceFromPoint: Math.round(overheadOrigin) },
          destinationHub: { ...dAirport, nearPoint: 'destination', distanceFromPoint: Math.round(overheadDest) },
          directDistance: Math.round(hubDistance),
          totalOverhead: Math.round(overheadOrigin + overheadDest),
        });
      }
    }

    // Ferry options: pair origin ferry terminals with destination ferry terminals
    for (const oFerry of originFerries.slice(0, 5)) {
      for (const dFerry of destFerries.slice(0, 5)) {
        const hubDistance = haversineDistance(oFerry.lat, oFerry.lng, dFerry.lat, dFerry.lng) / 1000;
        const overheadOrigin = haversineDistance(origin.lat, origin.lng, oFerry.lat, oFerry.lng) / 1000;
        const overheadDest = haversineDistance(destination.lat, destination.lng, dFerry.lat, dFerry.lng) / 1000;
        
        routes.push({
          id: `ferry-${oFerry.name}-${dFerry.name}`,
          type: 'ferry',
          label: `${oFerry.name} → ${dFerry.name}`,
          originHub: { ...oFerry, nearPoint: 'origin', distanceFromPoint: Math.round(overheadOrigin) },
          destinationHub: { ...dFerry, nearPoint: 'destination', distanceFromPoint: Math.round(overheadDest) },
          directDistance: Math.round(hubDistance),
          totalOverhead: Math.round(overheadOrigin + overheadDest),
        });
      }
    }

    // Sort by total overhead (less detour = better)
    routes.sort((a, b) => a.totalOverhead - b.totalOverhead);

    return new Response(
      JSON.stringify({
        needsIntermodal: true,
        directDistance: Math.round(directDistance),
        roadDistance: Math.round(roadDistance),
        roadRouteFailed,
        options: routes.slice(0, 15), // Top 15 options
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function queryOverpass(
  type: 'aerodrome' | 'ferry_terminal',
  lat: number,
  lng: number,
  radiusKm: number
): Promise<IntermodalOption[]> {
  const radiusM = radiusKm * 1000;
  
  let query: string;
  if (type === 'aerodrome') {
    query = `[out:json][timeout:8];
node["aeroway"="aerodrome"]["name"](around:${radiusM},${lat},${lng});
out;`;
  } else {
    query = `[out:json][timeout:8];
node["amenity"="ferry_terminal"]["name"](around:${radiusM},${lat},${lng});
out;`;
  }

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const results: IntermodalOption[] = [];

    for (const el of data.elements || []) {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (!elLat || !elLng) continue;

      const name = el.tags?.name || el.tags?.['name:en'] || el.tags?.iata || 
                   (type === 'aerodrome' ? 'Aeropuerto' : 'Terminal ferry');
      
      // Skip very small/private airfields without a name
      if (type === 'aerodrome' && !el.tags?.name && !el.tags?.iata) continue;

      const dist = haversineDistance(lat, lng, elLat, elLng) / 1000;

      results.push({
        type: type === 'aerodrome' ? 'airport' : 'ferry_terminal',
        name,
        lat: elLat,
        lng: elLng,
        distanceFromPoint: Math.round(dist),
        nearPoint: 'origin',
      });
    }

    // Sort by distance and deduplicate by name
    results.sort((a, b) => a.distanceFromPoint - b.distanceFromPoint);
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (e) {
    console.error(`Overpass query failed for ${type}:`, e);
    return [];
  }
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
