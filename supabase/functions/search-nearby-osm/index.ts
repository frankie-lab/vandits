const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type NearbyResult = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_m: number;
  place_type: string | null;
  description: string | null;
  osm_link: string;
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCoordinates(el: OverpassElement) {
  const latitude = el.lat ?? el.center?.lat;
  const longitude = el.lon ?? el.center?.lon;
  if (latitude === undefined || longitude === undefined) return null;
  return { latitude, longitude };
}

function getPlaceType(tags?: Record<string, string>): string | null {
  if (!tags) return null;
  return (
    tags.amenity ||
    tags.tourism ||
    tags.shop ||
    tags.historic ||
    tags.leisure ||
    tags.natural ||
    tags.place ||
    tags.harbour ||
    tags['seamark:type'] ||
    tags.landuse ||
    tags.man_made ||
    tags.building ||
    null
  );
}

function getDescription(tags?: Record<string, string>): string | null {
  if (!tags) return null;
  return tags.description || tags['description:es'] || tags['description:gl'] || tags['addr:street'] || null;
}

function getPriority(tags?: Record<string, string>): number {
  if (!tags) return 0;
  if (tags.place) return 100;
  if (tags.harbour || tags['seamark:type'] === 'harbour' || tags.landuse === 'harbour') return 95;
  if (tags.amenity === 'restaurant' || tags.amenity === 'bar' || tags.amenity === 'cafe') return 90;
  if (tags.tourism) return 85;
  if (tags.historic) return 80;
  if (tags.natural || tags.leisure) return 70;
  if (tags.shop) return 60;
  return 50;
}

function buildQuery(lat: number, lng: number, radiusMeters: number) {
  return `
[out:json][timeout:25];
(
  node["amenity"]["name"](around:${radiusMeters},${lat},${lng});
  way["amenity"]["name"](around:${radiusMeters},${lat},${lng});
  node["tourism"]["name"](around:${radiusMeters},${lat},${lng});
  way["tourism"]["name"](around:${radiusMeters},${lat},${lng});
  node["shop"]["name"](around:${radiusMeters},${lat},${lng});
  way["shop"]["name"](around:${radiusMeters},${lat},${lng});
  node["historic"]["name"](around:${radiusMeters},${lat},${lng});
  way["historic"]["name"](around:${radiusMeters},${lat},${lng});
  node["leisure"]["name"](around:${radiusMeters},${lat},${lng});
  way["leisure"]["name"](around:${radiusMeters},${lat},${lng});
  node["natural"]["name"](around:${radiusMeters},${lat},${lng});
  way["natural"]["name"](around:${radiusMeters},${lat},${lng});
  node["place"]["name"](around:${radiusMeters},${lat},${lng});
  relation["place"]["name"](around:${radiusMeters},${lat},${lng});
  node["harbour"]["name"](around:${radiusMeters},${lat},${lng});
  way["harbour"]["name"](around:${radiusMeters},${lat},${lng});
  node["seamark:type"="harbour"]["name"](around:${radiusMeters},${lat},${lng});
  way["seamark:type"="harbour"]["name"](around:${radiusMeters},${lat},${lng});
  way["landuse"="harbour"]["name"](around:${radiusMeters},${lat},${lng});
  node["building"~"church|chapel|cathedral|monastery"]["name"](around:${radiusMeters},${lat},${lng});
  way["building"~"church|chapel|cathedral|monastery"]["name"](around:${radiusMeters},${lat},${lng});
);
out center tags 200;
  `.trim();
}

async function executeOverpass(query: string) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        console.warn('Overpass endpoint failed', endpoint, response.status);
        continue;
      }

      const data = await response.json();
      return data.elements || [];
    } catch (error) {
      console.warn('Overpass endpoint error', endpoint, error);
    }
  }

  throw new Error('All Overpass endpoints failed');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { latitude, longitude, radiusMeters = 500, limit = 40 } = await req.json();

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return new Response(JSON.stringify({ error: 'latitude y longitude son obligatorios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const query = buildQuery(latitude, longitude, radiusMeters);
    const elements: OverpassElement[] = await executeOverpass(query);

    const deduped = new Map<string, NearbyResult & { priority: number }>();

    for (const el of elements) {
      const coords = getCoordinates(el);
      const name = el.tags?.['name:es'] || el.tags?.['name:gl'] || el.tags?.name;
      if (!coords || !name) continue;

      const distance = Math.round(haversineDistance(latitude, longitude, coords.latitude, coords.longitude));
      if (distance > radiusMeters) continue;

      const placeType = getPlaceType(el.tags);
      const priority = getPriority(el.tags);
      const key = `${name.toLowerCase()}|${placeType || ''}`;
      const item = {
        id: `osm-${el.type}-${el.id}`,
        name,
        latitude: coords.latitude,
        longitude: coords.longitude,
        distance_m: distance,
        place_type: placeType,
        description: getDescription(el.tags),
        osm_link: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        priority,
      };

      const existing = deduped.get(key);
      if (!existing || item.priority > existing.priority || item.distance_m < existing.distance_m) {
        deduped.set(key, item);
      }
    }

    const results = Array.from(deduped.values())
      .sort((a, b) => b.priority - a.priority || a.distance_m - b.distance_m)
      .slice(0, limit)
      .map(({ priority, ...item }) => item);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('search-nearby-osm error', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
