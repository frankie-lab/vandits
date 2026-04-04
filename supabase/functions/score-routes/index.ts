
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Waypoint {
  name: string;
  lat: number;
  lng: number;
}

interface ScoringWeights {
  cost: number;
  time: number;
  flexibility: number;
  autonomy: number;
  comfort: number;
  risk: number;
  scenic: number;
}

interface TransportMode {
  code: string;
  name: string;
  icon: string;
  category: string;
  avg_speed_kmh: number;
  cost_per_km: number;
  base_cost: number;
  setup_time_minutes: number;
  score_comfort: number;
  score_flexibility: number;
  score_autonomy: number;
  score_risk: number;
  score_cargo: number;
  score_scenic: number;
  max_range_km: number | null;
}

interface SegmentAnalysis {
  from: string;
  to: string;
  distance_km: number;
  mode: TransportMode;
  estimated_cost: number;
  estimated_time_hours: number;
  setup_time_hours: number;
}

interface RouteAlternative {
  id: string;
  name: string;
  segments: SegmentAnalysis[];
  total_distance_km: number;
  total_cost: number;
  total_time_hours: number;
  scores: {
    cost: number;
    time: number;
    flexibility: number;
    autonomy: number;
    comfort: number;
    risk: number;
    scenic: number;
    overall: number;
  };
  modes_used: string[];
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function roadDistanceFactor(category: string): number {
  if (category === 'air') return 1.0;
  if (category === 'sea') return 1.2;
  return 1.35; // land roads are ~35% longer than straight line
}

function isModeViableForSegment(mode: TransportMode, distanceKm: number, isOverSea: boolean): boolean {
  if (mode.max_range_km && distanceKm > mode.max_range_km) return false;
  if (isOverSea && mode.category === 'land' && distanceKm > 20) return false;
  if (!isOverSea && mode.category === 'sea' && distanceKm > 50) return false;
  if (mode.code === 'backpacker' && distanceKm > 300) return false;
  return true;
}

function isSegmentOverSea(lat1: number, lng1: number, lat2: number, lng2: number): boolean {
  // Simple heuristic: if midpoint is far from both points in a known island/sea region
  // For now, check if crossing between known landmasses requiring sea
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  // Mediterranean islands check
  if (midLat > 35 && midLat < 45 && midLng > -5 && midLng < 20) {
    const dist = haversineKm(lat1, lng1, lat2, lng2);
    if (dist > 100) return true; // likely crossing sea in Mediterranean
  }
  return false;
}

function generateModeCombinations(
  modes: TransportMode[],
  segments: { from: Waypoint; to: Waypoint; distanceKm: number; overSea: boolean }[],
  maxAlternatives: number = 8
): TransportMode[][] {
  const viablePerSegment = segments.map(seg =>
    modes.filter(m => isModeViableForSegment(m, seg.distanceKm, seg.overSea))
  );

  // For single segment: return each viable mode
  if (segments.length === 1) {
    return viablePerSegment[0].map(m => [m]);
  }

  // For multi-segment: generate smart combinations
  const combos: TransportMode[][] = [];

  // 1. Single-mode routes (same mode for all segments)
  const commonModes = modes.filter(m =>
    segments.every((seg, i) => viablePerSegment[i].includes(m))
  );
  for (const m of commonModes) {
    combos.push(segments.map(() => m));
  }

  // 2. Multimodal combos: air+car, ferry+car, etc.
  const multimodalPatterns = [
    ['airline', 'rental_car'],
    ['airline', 'backpacker'],
    ['ferry', 'own_car'],
    ['ferry', 'rental_car'],
    ['ferry', 'own_motorcycle'],
    ['airline', 'rental_motorcycle'],
    ['own_car', 'ferry'],
  ];

  for (const pattern of multimodalPatterns) {
    for (const primaryCode of pattern) {
      for (const secondaryCode of pattern) {
        if (primaryCode === secondaryCode) continue;
        const primary = modes.find(m => m.code === primaryCode);
        const secondary = modes.find(m => m.code === secondaryCode);
        if (!primary || !secondary) continue;

        const combo = segments.map((seg, i) => {
          if (seg.distanceKm > 500 && isModeViableForSegment(primary, seg.distanceKm, seg.overSea)) return primary;
          if (seg.overSea && primary.category === 'sea') return primary;
          if (isModeViableForSegment(secondary, seg.distanceKm, seg.overSea)) return secondary;
          if (isModeViableForSegment(primary, seg.distanceKm, seg.overSea)) return primary;
          return viablePerSegment[i][0] || secondary;
        });

        if (combo.every(Boolean)) {
          const key = combo.map(c => c.code).join('-');
          if (!combos.some(c => c.map(m => m.code).join('-') === key)) {
            combos.push(combo);
          }
        }
      }
    }
  }

  return combos.slice(0, maxAlternatives);
}

function scoreRoute(
  segments: SegmentAnalysis[],
  weights: ScoringWeights,
  allRoutes: { totalCost: number; totalTime: number }[]
): RouteAlternative['scores'] {
  const totalCost = segments.reduce((s, seg) => s + seg.estimated_cost, 0);
  const totalTime = segments.reduce((s, seg) => s + seg.estimated_time_hours + seg.setup_time_hours, 0);

  const maxCost = Math.max(...allRoutes.map(r => r.totalCost), 1);
  const maxTime = Math.max(...allRoutes.map(r => r.totalTime), 1);

  // Normalize cost and time (inverted: lower is better)
  const costScore = 10 * (1 - totalCost / maxCost);
  const timeScore = 10 * (1 - totalTime / maxTime);

  // Average qualitative scores across segments (weighted by distance)
  const totalDist = segments.reduce((s, seg) => s + seg.distance_km, 0) || 1;
  const avg = (key: keyof TransportMode) =>
    segments.reduce((s, seg) => s + (seg.mode[key] as number) * seg.distance_km, 0) / totalDist;

  const flexibility = avg('score_flexibility');
  const autonomy = avg('score_autonomy');
  const comfort = avg('score_comfort');
  const risk = 10 - avg('score_risk'); // invert: lower risk = higher score
  const scenic = avg('score_scenic');

  const overall =
    (costScore * weights.cost +
      timeScore * weights.time +
      flexibility * weights.flexibility +
      autonomy * weights.autonomy +
      comfort * weights.comfort +
      risk * weights.risk +
      scenic * weights.scenic) /
    (weights.cost + weights.time + weights.flexibility + weights.autonomy +
      weights.comfort + weights.risk + weights.scenic);

  return {
    cost: Math.round(costScore * 10) / 10,
    time: Math.round(timeScore * 10) / 10,
    flexibility: Math.round(flexibility * 10) / 10,
    autonomy: Math.round(autonomy * 10) / 10,
    comfort: Math.round(comfort * 10) / 10,
    risk: Math.round(risk * 10) / 10,
    scenic: Math.round(scenic * 10) / 10,
    overall: Math.round(overall * 10) / 10,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { waypoints, weights, budget_max, time_max_hours } = await req.json() as {
      waypoints: Waypoint[];
      weights: ScoringWeights;
      budget_max?: number;
      time_max_hours?: number;
    };

    if (!waypoints || waypoints.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 waypoints' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch transport modes from DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const modesRes = await fetch(`${supabaseUrl}/rest/v1/transport_modes?is_active=eq.true&select=*`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    const modes: TransportMode[] = await modesRes.json();

    // Build segments
    const segmentInfos = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
      const overSea = isSegmentOverSea(from.lat, from.lng, to.lat, to.lng);
      segmentInfos.push({ from, to, distanceKm, overSea });
    }

    // Generate combinations
    const combos = generateModeCombinations(modes, segmentInfos);

    // Evaluate each combination
    const rawRoutes = combos.map((combo, idx) => {
      const segments: SegmentAnalysis[] = combo.map((mode, i) => {
        const seg = segmentInfos[i];
        const adjustedDist = seg.distanceKm * roadDistanceFactor(mode.category);
        const timeHours = adjustedDist / mode.avg_speed_kmh;
        const cost = mode.base_cost + adjustedDist * mode.cost_per_km;

        return {
          from: seg.from.name,
          to: seg.to.name,
          distance_km: Math.round(adjustedDist),
          mode,
          estimated_cost: Math.round(cost),
          estimated_time_hours: Math.round(timeHours * 10) / 10,
          setup_time_hours: mode.setup_time_minutes / 60,
        };
      });

      const totalCost = segments.reduce((s, seg) => s + seg.estimated_cost, 0);
      const totalTime = segments.reduce((s, seg) => s + seg.estimated_time_hours + seg.setup_time_hours, 0);

      return { segments, totalCost, totalTime, idx };
    });

    // Filter by constraints
    let filtered = rawRoutes;
    if (budget_max) filtered = filtered.filter(r => r.totalCost <= budget_max);
    if (time_max_hours) filtered = filtered.filter(r => r.totalTime <= time_max_hours);

    // Score routes
    const summaries = filtered.map(r => ({ totalCost: r.totalCost, totalTime: r.totalTime }));

    const alternatives: RouteAlternative[] = filtered.map((r, i) => {
      const modesUsed = [...new Set(r.segments.map(s => s.mode.code))];
      const name = modesUsed.length === 1
        ? r.segments[0].mode.name
        : r.segments.map(s => s.mode.icon).join(' + ');

      return {
        id: `alt-${i}`,
        name,
        segments: r.segments,
        total_distance_km: r.segments.reduce((s, seg) => s + seg.distance_km, 0),
        total_cost: r.totalCost,
        total_time_hours: Math.round(r.totalTime * 10) / 10,
        scores: scoreRoute(r.segments, weights, summaries),
        modes_used: modesUsed,
      };
    });

    // Sort by overall score descending
    alternatives.sort((a, b) => b.scores.overall - a.scores.overall);

    return new Response(
      JSON.stringify({ alternatives, total_modes_evaluated: modes.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('score-routes error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
