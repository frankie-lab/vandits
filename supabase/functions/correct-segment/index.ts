const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions';

const ORS_PROFILES: Record<string, string> = {
  walking: 'foot-walking',
  driving: 'driving-car',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
    if (!apiKey) throw new Error('OPENROUTESERVICE_API_KEY not configured');

    const { startLat, startLng, endLat, endLng, transportMode = 'driving', roadPreference = 'fastest' } = await req.json();

    if (!startLat || !startLng || !endLat || !endLng) {
      return new Response(JSON.stringify({ error: 'Missing coordinates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profile = ORS_PROFILES[transportMode] || 'driving-car';
    const coordinates = [[startLng, startLat], [endLng, endLat]];

    const orsBody: any = { coordinates };
    if (roadPreference === 'scenic' && profile === 'driving-car') {
      orsBody.options = {
        avoid_features: ['highways', 'tollways'],
      };
      orsBody.preference = 'recommended';
    }

    const orsResp = await fetch(`${ORS_BASE}/${profile}/geojson`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orsBody),
    });

    if (!orsResp.ok) {
      const errorText = await orsResp.text();
      console.error('ORS error:', orsResp.status, errorText);
      return new Response(JSON.stringify({ error: `ORS error: ${orsResp.status}`, details: errorText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orsData = await orsResp.json();
    const feature = orsData.features?.[0];
    if (!feature) {
      return new Response(JSON.stringify({ error: 'No route found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geometry = feature.geometry;
    const summary = feature.properties?.summary || {};

    return new Response(JSON.stringify({
      geometry,
      distance: summary.distance || 0,
      duration: summary.duration || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('correct-segment error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
