import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ServiceStatus {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'connected' | 'error' | 'not_configured';
  message: string;
  latencyMs?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const services: ServiceStatus[] = [];

  // 1. OpenRouteService
  const orsKey = Deno.env.get('OPENROUTESERVICE_API_KEY');
  if (!orsKey) {
    services.push({
      id: 'ors',
      name: 'OpenRouteService',
      description: 'Cálculo de rutas terrestres (driving/walking)',
      icon: '🛣️',
      status: 'not_configured',
      message: 'API key no configurada',
    });
  } else {
    const start = Date.now();
    try {
      const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/json', {
        method: 'POST',
        headers: { 'Authorization': orsKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: [[8.681495,49.41461],[8.687872,49.420318]] }),
      });
      const latency = Date.now() - start;
      if (res.ok || res.status === 200) {
        services.push({
          id: 'ors',
          name: 'OpenRouteService',
          description: 'Cálculo de rutas terrestres (driving/walking)',
          icon: '🛣️',
          status: 'connected',
          message: `Operativo (${latency}ms)`,
          latencyMs: latency,
        });
      } else {
        services.push({
          id: 'ors',
          name: 'OpenRouteService',
          description: 'Cálculo de rutas terrestres (driving/walking)',
          icon: '🛣️',
          status: 'error',
          message: `Error HTTP ${res.status}`,
          latencyMs: latency,
        });
      }
    } catch (e) {
      services.push({
        id: 'ors',
        name: 'OpenRouteService',
        description: 'Cálculo de rutas terrestres (driving/walking)',
        icon: '🛣️',
        status: 'error',
        message: `Error de conexión: ${(e as Error).message}`,
      });
    }
  }

  // 2. Duffel (flights)
  const duffelToken = Deno.env.get('DUFFEL_API_TOKEN');
  if (!duffelToken) {
    services.push({
      id: 'duffel',
      name: 'Duffel',
      description: 'Búsqueda de vuelos comerciales reales',
      icon: '✈️',
      status: 'not_configured',
      message: 'API token no configurado',
    });
  } else {
    const start = Date.now();
    try {
      const res = await fetch('https://api.duffel.com/air/airports?limit=1', {
        headers: {
          'Authorization': `Bearer ${duffelToken}`,
          'Duffel-Version': 'v2',
          'Accept': 'application/json',
        },
      });
      const latency = Date.now() - start;
      if (res.ok) {
        services.push({
          id: 'duffel',
          name: 'Duffel',
          description: 'Búsqueda de vuelos comerciales reales',
          icon: '✈️',
          status: 'connected',
          message: `Operativo (${latency}ms)`,
          latencyMs: latency,
        });
      } else {
        services.push({
          id: 'duffel',
          name: 'Duffel',
          description: 'Búsqueda de vuelos comerciales reales',
          icon: '✈️',
          status: 'error',
          message: `Error HTTP ${res.status}`,
          latencyMs: latency,
        });
      }
    } catch (e) {
      services.push({
        id: 'duffel',
        name: 'Duffel',
        description: 'Búsqueda de vuelos comerciales reales',
        icon: '✈️',
        status: 'error',
        message: `Error de conexión: ${(e as Error).message}`,
      });
    }
  }

  // 3. Internal DB (airports + ferry_routes)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const start = Date.now();
    const [airportsRes, ferriesRes] = await Promise.all([
      sb.from('airports').select('id', { count: 'exact', head: true }),
      sb.from('ferry_routes').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);
    const latency = Date.now() - start;

    const airportCount = airportsRes.count ?? 0;
    const ferryCount = ferriesRes.count ?? 0;

    services.push({
      id: 'airports_db',
      name: 'Base de datos de aeropuertos',
      description: 'Catálogo interno de aeropuertos mundiales',
      icon: '🏢',
      status: airportCount > 0 ? 'connected' : 'error',
      message: airportCount > 0 ? `${airportCount.toLocaleString()} aeropuertos disponibles` : 'Tabla vacía',
      latencyMs: latency,
    });

    services.push({
      id: 'ferries_db',
      name: 'Base de datos de ferries',
      description: 'Rutas de ferry comerciales internas',
      icon: '⛴️',
      status: ferryCount > 0 ? 'connected' : 'error',
      message: ferryCount > 0 ? `${ferryCount} rutas activas` : 'Tabla vacía',
      latencyMs: latency,
    });
  } catch (e) {
    services.push({
      id: 'db',
      name: 'Base de datos interna',
      description: 'Aeropuertos y rutas de ferry',
      icon: '🗄️',
      status: 'error',
      message: `Error: ${(e as Error).message}`,
    });
  }

  // 4. Overpass (OSM) — free, always available
  {
    const start = Date.now();
    try {
      const res = await fetch('https://overpass-api.de/api/status');
      const latency = Date.now() - start;
      services.push({
        id: 'overpass',
        name: 'Overpass (OpenStreetMap)',
        description: 'Búsqueda de ferries como respaldo (gratuito)',
        icon: '🗺️',
        status: res.ok ? 'connected' : 'error',
        message: res.ok ? `Operativo (${latency}ms)` : `Error HTTP ${res.status}`,
        latencyMs: latency,
      });
    } catch (e) {
      services.push({
        id: 'overpass',
        name: 'Overpass (OpenStreetMap)',
        description: 'Búsqueda de ferries como respaldo (gratuito)',
        icon: '🗺️',
        status: 'error',
        message: `Error de conexión`,
      });
    }
  }

  // 5. Nominatim (OSM) — free
  {
    const start = Date.now();
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/status.php?format=json', {
        headers: { 'User-Agent': 'Vandits/1.0' },
      });
      const latency = Date.now() - start;
      services.push({
        id: 'nominatim',
        name: 'Nominatim (OpenStreetMap)',
        description: 'Geocodificación y búsqueda de puertos (gratuito)',
        icon: '📍',
        status: res.ok ? 'connected' : 'error',
        message: res.ok ? `Operativo (${latency}ms)` : `Error HTTP ${res.status}`,
        latencyMs: latency,
      });
    } catch (e) {
      services.push({
        id: 'nominatim',
        name: 'Nominatim (OpenStreetMap)',
        description: 'Geocodificación y búsqueda de puertos (gratuito)',
        icon: '📍',
        status: 'error',
        message: `Error de conexión`,
      });
    }
  }

  return new Response(JSON.stringify({ services }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
