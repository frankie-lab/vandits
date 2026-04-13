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
  return tags.amenity || tags.tourism || tags.shop || tags.historic ||
    tags.leisure || tags.natural || tags.place || tags.harbour ||
    tags['seamark:type'] || tags.landuse || tags.man_made || tags.building || null;
}

function getDescription(tags?: Record<string, string>): string | null {
  if (!tags) return null;
  return tags.description || tags['description:es'] || tags['description:gl'] || tags['addr:street'] || null;
}

function getPriority(tags?: Record<string, string>): number {
  if (!tags) return 0;
  if (tags.place) return 100;
  if (tags.harbour || tags['seamark:type'] === 'harbour' || tags.landuse === 'harbour') return 95;
   if (tags['seamark:type'] === 'lighthouse' || tags.man_made === 'lighthouse') return 92;
   if (tags.man_made === 'survey_point' && tags.name?.toLowerCase().includes('faro')) return 92;
  if (tags.amenity === 'restaurant' || tags.amenity === 'bar' || tags.amenity === 'cafe') return 90;
  if (tags.tourism) return 85;
  if (tags.historic) return 80;
  if (tags.natural || tags.leisure) return 70;
  if (tags.shop) return 60;
  return 50;
}

const QUERY_TAGS = [
  'place',
  'tourism',
  'historic',
  'amenity',
  'shop',
  'natural',
  'leisure',
  'harbour',
  'seamark:type',
  'landuse',
  'man_made',
  'building',
];

function buildElementQueries(
  elementType: 'node' | 'way' | 'relation',
  lat: number,
  lng: number,
  radiusMeters: number,
) {
  const extraFilter = elementType === 'relation' ? '["type"!="boundary"]' : '';

  return QUERY_TAGS
    .map((tag) => `  ${elementType}["${tag}"]["name"]${extraFilter}(around:${radiusMeters},${lat},${lng});`)
    .join('\n');
}

function buildQuery(lat: number, lng: number, radiusMeters: number) {
  // Query only meaningful named features to avoid huge OSM payloads and timeouts
  return `[out:json][timeout:8];
(
${buildElementQueries('node', lat, lng, radiusMeters)}
${buildElementQueries('way', lat, lng, radiusMeters)}
${buildElementQueries('relation', lat, lng, radiusMeters)}
);
out center tags 120;`;
}

const SKIP_TAGS = new Set([
  'tree', 'tree_row', 'hedge', 'shrub', 'bench', 'waste_basket',
  'street_lamp', 'fire_hydrant', 'post_box', 'recycling',
  'bicycle_parking', 'parking_space', 'bollard', 'utility_pole',
]);

function shouldSkip(tags?: Record<string, string>): boolean {
  if (!tags) return true;
  const mainTag = tags.natural || tags.amenity || tags.man_made || '';
  if (SKIP_TAGS.has(mainTag)) return true;
  // Skip roads/paths unless they are notable
  if (tags.highway && !tags.tourism && !tags.historic) return true;
  // Skip power infrastructure
  if (tags.power) return true;
  return false;
}

async function executeOverpass(query: string): Promise<OverpassElement[]> {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
  ];

  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text();
        errors.push(`${endpoint}: HTTP ${response.status} - ${body.slice(0, 200)}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        const body = await response.text();
        errors.push(`${endpoint}: non-JSON response (${contentType}) - ${body.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      console.log(`Overpass OK via ${endpoint}: ${(data.elements || []).length} elements`);
      return data.elements || [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${endpoint}: ${msg}`);
      console.warn(`Overpass endpoint failed: ${endpoint} - ${msg}`);
    }
  }

  console.error('All Overpass endpoints failed:', errors);
  // Return empty instead of throwing - graceful degradation
  return [];
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
      if (shouldSkip(el.tags)) continue;

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

    return new Response(JSON.stringify({ results, count: results.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('search-nearby-osm error', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error', results: [] }), {
      status: 200, // Return 200 so client can read the body
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
