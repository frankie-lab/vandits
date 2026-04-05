import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Point { lat: number; lng: number; name: string; }

interface IntermodalOption {
  type: 'airport' | 'ferry_terminal';
  name: string;
  iata_code?: string;
  lat: number;
  lng: number;
  distanceFromPoint: number;
  nearPoint: 'origin' | 'destination';
}

interface IntermodalRoute {
  id: string;
  type: 'flight' | 'ferry';
  label: string;
  originHub: IntermodalOption;
  destinationHub: IntermodalOption;
  directDistance: number;
  totalOverhead: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { origin, destination, radiusKm = 120 } = await req.json() as {
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
        roadDistance = osrmData.routes[0].distance / 1000;
      }
    } catch {
      roadRouteFailed = true;
    }

    const directDistance = haversine(origin.lat, origin.lng, destination.lat, destination.lng) / 1000;
    const roadRatio = roadDistance > 0 ? roadDistance / directDistance : Infinity;

    const suggestFerry = roadRouteFailed || roadRatio > 2.5;
    const suggestFlight = directDistance > 300 && (roadRouteFailed || roadDistance > 400);

    if (!suggestFerry && !suggestFlight) {
      return new Response(
        JSON.stringify({ needsIntermodal: false, directDistance: Math.round(directDistance), roadDistance: Math.round(roadDistance), options: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search airports from DB and ferries from Nominatim in parallel
    const searches: Promise<IntermodalOption[]>[] = [];

    if (suggestFlight) {
      searches.push(searchAirportsDB(origin.lat, origin.lng, radiusKm));
      searches.push(searchAirportsDB(destination.lat, destination.lng, radiusKm));
    } else {
      searches.push(Promise.resolve([]));
      searches.push(Promise.resolve([]));
    }

    if (suggestFerry) {
      searches.push(searchNominatim('ferry terminal', origin.lat, origin.lng, radiusKm));
      searches.push(searchNominatim('ferry terminal', destination.lat, destination.lng, radiusKm));
    } else {
      searches.push(Promise.resolve([]));
      searches.push(Promise.resolve([]));
    }

    const [oAirports, dAirports, oFerries, dFerries] = await Promise.all(searches);

    const routes: IntermodalRoute[] = [];

    // Flight options
    for (const oA of oAirports.slice(0, 4)) {
      for (const dA of dAirports.slice(0, 4)) {
        const hubDist = haversine(oA.lat, oA.lng, dA.lat, dA.lng) / 1000;
        const ovO = haversine(origin.lat, origin.lng, oA.lat, oA.lng) / 1000;
        const ovD = haversine(destination.lat, destination.lng, dA.lat, dA.lng) / 1000;
        routes.push({
          id: `flight-${oA.name}-${dA.name}`,
          type: 'flight',
          label: `${oA.iata_code || oA.name} → ${dA.iata_code || dA.name}`,
          originHub: { ...oA, nearPoint: 'origin', distanceFromPoint: Math.round(ovO) },
          destinationHub: { ...dA, nearPoint: 'destination', distanceFromPoint: Math.round(ovD) },
          directDistance: Math.round(hubDist),
          totalOverhead: Math.round(ovO + ovD),
        });
      }
    }

    // Ferry options
    for (const oF of oFerries.slice(0, 4)) {
      for (const dF of dFerries.slice(0, 4)) {
        const hubDist = haversine(oF.lat, oF.lng, dF.lat, dF.lng) / 1000;
        const ovO = haversine(origin.lat, origin.lng, oF.lat, oF.lng) / 1000;
        const ovD = haversine(destination.lat, destination.lng, dF.lat, dF.lng) / 1000;
        routes.push({
          id: `ferry-${oF.name}-${dF.name}`,
          type: 'ferry',
          label: `${oF.name} → ${dF.name}`,
          originHub: { ...oF, nearPoint: 'origin', distanceFromPoint: Math.round(ovO) },
          destinationHub: { ...dF, nearPoint: 'destination', distanceFromPoint: Math.round(ovD) },
          directDistance: Math.round(hubDist),
          totalOverhead: Math.round(ovO + ovD),
        });
      }
    }

    routes.sort((a, b) => a.totalOverhead - b.totalOverhead);

    return new Response(
      JSON.stringify({
        needsIntermodal: true,
        directDistance: Math.round(directDistance),
        roadDistance: Math.round(roadDistance),
        roadRouteFailed,
        options: routes.slice(0, 12),
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

// ─── Airport search from DB ────────────────────────────────────────────

async function searchAirportsDB(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<IntermodalOption[]> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Bounding box filter for performance
    const delta = radiusKm / 111;
    const { data, error } = await supabase
      .from('airports')
      .select('ident, iata_code, name, latitude, longitude, type, municipality')
      .gte('latitude', lat - delta)
      .lte('latitude', lat + delta)
      .gte('longitude', lng - delta)
      .lte('longitude', lng + delta)
      .eq('scheduled_service', true)
      .limit(20);

    if (error || !data) {
      console.error('Airport DB query error:', error);
      return [];
    }

    const results: IntermodalOption[] = data
      .map(a => {
        const dist = haversine(lat, lng, a.latitude, a.longitude) / 1000;
        return {
          type: 'airport' as const,
          name: a.municipality ? `${a.name} (${a.municipality})` : a.name,
          iata_code: a.iata_code || undefined,
          lat: a.latitude,
          lng: a.longitude,
          distanceFromPoint: Math.round(dist),
          nearPoint: 'origin' as const,
        };
      })
      .filter(a => a.distanceFromPoint <= radiusKm)
      .sort((a, b) => a.distanceFromPoint - b.distanceFromPoint);

    // Prioritize large airports, then by distance
    return results.slice(0, 6);
  } catch (e) {
    console.error('Airport search failed:', e);
    return [];
  }
}

// ─── Ferry search via Nominatim ─────────────────────────────────────────

async function searchNominatim(
  type: string,
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<IntermodalOption[]> {
  const delta = radiusKm / 111;
  const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;
  const url = `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(type)}&format=json&limit=8&bounded=1&viewbox=${viewbox}` +
    `&accept-language=es`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Vandits/1.0' },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const results: IntermodalOption[] = [];

    for (const item of data) {
      const elLat = parseFloat(item.lat);
      const elLng = parseFloat(item.lon);
      if (!elLat || !elLng) continue;

      const name = item.display_name?.split(',')[0] || 'Terminal ferry';
      const dist = haversine(lat, lng, elLat, elLng) / 1000;
      if (dist > radiusKm) continue;

      results.push({
        type: 'ferry_terminal',
        name,
        lat: elLat,
        lng: elLng,
        distanceFromPoint: Math.round(dist),
        nearPoint: 'origin',
      });
    }

    results.sort((a, b) => a.distanceFromPoint - b.distanceFromPoint);
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (e) {
    console.error(`Nominatim search failed for ${type}:`, e);
    return [];
  }
}

// ─── Haversine ──────────────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
