const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Types ────────────────────────────────────────────────

interface Waypoint { name: string; lat: number; lng: number }

interface ScoringWeights {
  cost: number; time: number; flexibility: number; autonomy: number;
  comfort: number; risk: number; scenic: number; load: number; restrictions: number;
}

interface TransportMode {
  code: string; name: string; icon: string; category: string;
  avg_speed_kmh: number; cost_per_km: number; base_cost: number;
  setup_time_minutes: number; overhead_minutes: number;
  score_comfort: number; score_flexibility: number; score_autonomy: number;
  score_risk: number; score_cargo: number; score_scenic: number;
  score_restrictions: number; score_load_capacity: number;
  max_range_km: number | null;
  is_motorized: boolean; requires_schedule: boolean; requires_booking: boolean;
  allows_cargo: boolean; supports_sleep: boolean; max_passengers: number;
}

interface CostBreakdownItem {
  category_code: string; category_name: string; category_icon: string;
  cost_per_km: number; base_cost: number; total: number;
}

interface ModeCostEntry {
  mode_code: string; category_code: string; category_name: string;
  category_icon: string; cost_per_km: number; base_cost: number;
}

interface SegmentAnalysis {
  from: string; to: string; distance_km: number;
  mode: TransportMode;
  estimated_cost: number; cost_breakdown: CostBreakdownItem[];
  estimated_time_hours: number; setup_time_hours: number; overhead_hours: number;
  vehicle_status?: VehicleStatus;
}

interface CompatibilityEntry {
  carrier_code: string; carried_code: string;
  is_compatible: boolean; notes: string | null;
}

// Vehicle tracking across segments
interface VehicleStatus {
  owned_vehicle_code: string | null;     // What vehicle the user starts with
  vehicle_location: string;              // Where the vehicle currently is
  vehicle_on_board: boolean;             // Is the vehicle traveling with the user?
  left_at_waypoint: string | null;       // Where was it left (if not on board)
}

interface RouteAlternative {
  id: string; name: string; segments: SegmentAnalysis[];
  total_distance_km: number; total_cost: number; total_time_hours: number;
  cost_breakdown: CostBreakdownItem[];
  scores: Record<string, number> & { overall: number };
  modes_used: string[];
  warnings: string[];
}

// ─── Geo helpers ──────────────────────────────────────────

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
  return 1.35;
}

function isSegmentOverSea(lat1: number, lng1: number, lat2: number, lng2: number): boolean {
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  if (midLat > 35 && midLat < 45 && midLng > -5 && midLng < 20) {
    if (haversineKm(lat1, lng1, lat2, lng2) > 100) return true;
  }
  return false;
}

// ─── Owned vehicle detection ─────────────────────────────

// Modes that represent vehicles the user OWNS and must track
const OWNED_VEHICLE_MODES = new Set([
  'own_car', 'motorcycle', 'camper_van', 'motorhome', 'car_caravan',
  'bicycle', 'rental_boat',
]);

// Modes that are services (not owned, no tracking needed)
const SERVICE_MODES = new Set([
  'walking', 'taxi', 'rental_car', 'rental_motorcycle',
  'public_bus', 'train', 'airline', 'private_plane', 'ferry',
]);

function isOwnedVehicle(modeCode: string): boolean {
  return OWNED_VEHICLE_MODES.has(modeCode);
}

// ─── Compatibility check ─────────────────────────────────

function canCarryVehicle(
  carrierCode: string,
  carriedCode: string,
  compatMatrix: Map<string, boolean>,
): boolean {
  const key = `${carrierCode}:${carriedCode}`;
  return compatMatrix.get(key) ?? false;
}

function getCompatibilityNote(
  carrierCode: string,
  carriedCode: string,
  compatEntries: CompatibilityEntry[],
): string | null {
  const entry = compatEntries.find(
    e => e.carrier_code === carrierCode && e.carried_code === carriedCode
  );
  return entry?.notes ?? null;
}

// ─── Viability ────────────────────────────────────────────

function isModeViableForSegment(mode: TransportMode, distanceKm: number, isOverSea: boolean): boolean {
  if (mode.max_range_km && distanceKm > mode.max_range_km) return false;
  if (isOverSea && mode.category === 'land' && distanceKm > 20) return false;
  if (!isOverSea && mode.category === 'sea' && distanceKm > 50) return false;
  if (mode.code === 'walking' && distanceKm > 50) return false;
  if (mode.code === 'bicycle' && distanceKm > 200) return false;
  return true;
}

// ─── Cost calculation ─────────────────────────────────────

function calculateSegmentCosts(
  mode: TransportMode,
  distanceKm: number,
  modeCosts: ModeCostEntry[],
): { total: number; breakdown: CostBreakdownItem[] } {
  const entries = modeCosts.filter(c => c.mode_code === mode.code);

  if (entries.length === 0) {
    const total = mode.base_cost + distanceKm * mode.cost_per_km;
    return {
      total: Math.round(total),
      breakdown: [{
        category_code: 'total', category_name: 'Total estimado',
        category_icon: '💰', cost_per_km: mode.cost_per_km,
        base_cost: mode.base_cost, total: Math.round(total),
      }],
    };
  }

  const breakdown: CostBreakdownItem[] = entries.map(e => {
    const total = e.base_cost + distanceKm * e.cost_per_km;
    return {
      category_code: e.category_code, category_name: e.category_name,
      category_icon: e.category_icon, cost_per_km: e.cost_per_km,
      base_cost: e.base_cost, total: Math.round(total * 100) / 100,
    };
  });

  const total = breakdown.reduce((s, b) => s + b.total, 0);
  return { total: Math.round(total), breakdown };
}

// ─── Vehicle-aware combination generation ────────────────

interface SegmentInfo {
  from: Waypoint; to: Waypoint; distanceKm: number; overSea: boolean;
}

function generateModeCombinations(
  modes: TransportMode[],
  segments: SegmentInfo[],
  excludedModes: string[],
  userOwnedModes: string[],
  compatMatrix: Map<string, boolean>,
  maxAlternatives = 12,
): TransportMode[][] {
  const activeModes = modes.filter(m => !excludedModes.includes(m.code));

  const viablePerSegment = segments.map(seg =>
    activeModes.filter(m => isModeViableForSegment(m, seg.distanceKm, seg.overSea))
  );

  const combos: TransportMode[][] = [];
  const seen = new Set<string>();

  const addCombo = (combo: TransportMode[]) => {
    const key = combo.map(c => c.code).join('-');
    if (!seen.has(key) && combo.every(Boolean)) {
      seen.add(key);
      combos.push(combo);
    }
  };

  // 1. Single-mode routes (only with owned or service modes)
  const commonModes = activeModes.filter(m =>
    segments.every((seg, i) => viablePerSegment[i].includes(m))
  );
  for (const m of commonModes) {
    addCombo(segments.map(() => m));
  }

  // 2. Owned vehicle + compatible carrier combos
  // e.g., own_car + ferry, camper_van + ferry
  for (const ownedCode of userOwnedModes) {
    const ownedMode = activeModes.find(m => m.code === ownedCode);
    if (!ownedMode) continue;

    // Find carriers that can take this vehicle
    const compatCarriers = activeModes.filter(
      carrier => !isOwnedVehicle(carrier.code) && canCarryVehicle(carrier.code, ownedCode, compatMatrix)
    );

    for (const carrier of compatCarriers) {
      // Pattern: use owned vehicle for land, carrier for crossings
      const combo = segments.map((seg, i) => {
        if (seg.overSea && isModeViableForSegment(carrier, seg.distanceKm, seg.overSea)) return carrier;
        if (isModeViableForSegment(ownedMode, seg.distanceKm, seg.overSea)) return ownedMode;
        if (isModeViableForSegment(carrier, seg.distanceKm, seg.overSea)) return carrier;
        return viablePerSegment[i][0] || ownedMode;
      });
      addCombo(combo);
    }
  }

  // 3. Mixed: owned vehicle for first segments, then leave + service
  for (const ownedCode of userOwnedModes) {
    const ownedMode = activeModes.find(m => m.code === ownedCode);
    if (!ownedMode) continue;

    const serviceModes = activeModes.filter(m => SERVICE_MODES.has(m.code));

    for (const svc of serviceModes) {
      if (segments.length < 2) continue;

      // Drive first leg, switch to service for rest
      for (let switchAt = 1; switchAt < segments.length; switchAt++) {
        const combo = segments.map((seg, i) => {
          if (i < switchAt && isModeViableForSegment(ownedMode, seg.distanceKm, seg.overSea)) return ownedMode;
          if (isModeViableForSegment(svc, seg.distanceKm, seg.overSea)) return svc;
          return viablePerSegment[i][0] || svc;
        });
        addCombo(combo);
      }
    }
  }

  // 4. Smart multimodal combos (service-only combinations)
  const multimodalPatterns: [string, string][] = [
    ['airline', 'rental_car'], ['airline', 'train'],
    ['train', 'bicycle'], ['train', 'public_bus'],
    ['airline', 'rental_motorcycle'], ['airline', 'public_bus'],
    ['train', 'rental_car'], ['train', 'taxi'],
  ];

  for (const [primary, secondary] of multimodalPatterns) {
    const pMode = activeModes.find(m => m.code === primary);
    const sMode = activeModes.find(m => m.code === secondary);
    if (!pMode || !sMode) continue;

    const combo = segments.map((seg, i) => {
      if (seg.distanceKm > 500 && isModeViableForSegment(pMode, seg.distanceKm, seg.overSea)) return pMode;
      if (isModeViableForSegment(sMode, seg.distanceKm, seg.overSea)) return sMode;
      if (isModeViableForSegment(pMode, seg.distanceKm, seg.overSea)) return pMode;
      return viablePerSegment[i][0] || sMode;
    });
    addCombo(combo);
  }

  // 5. Distance-based heuristics for multi-segment
  if (segments.length > 1) {
    const longDistMode = activeModes.find(m => m.code === 'airline') || activeModes.find(m => m.code === 'train');
    const shortDistModes = activeModes.filter(m =>
      ['rental_car', 'public_bus', 'bicycle', 'walking', 'taxi'].includes(m.code)
    );

    if (longDistMode) {
      for (const shortMode of shortDistModes) {
        const combo = segments.map((seg, i) => {
          if (seg.distanceKm > 300 && isModeViableForSegment(longDistMode, seg.distanceKm, seg.overSea)) return longDistMode;
          if (isModeViableForSegment(shortMode, seg.distanceKm, seg.overSea)) return shortMode;
          return viablePerSegment[i][0] || longDistMode;
        });
        addCombo(combo);
      }
    }
  }

  return combos.slice(0, maxAlternatives);
}

// ─── Vehicle tracking across segments ────────────────────

function trackVehicleStatus(
  segments: { mode: TransportMode; from: string; to: string }[],
  userOwnedModes: string[],
  compatMatrix: Map<string, boolean>,
): { statuses: VehicleStatus[]; warnings: string[] } {
  const warnings: string[] = [];
  const statuses: VehicleStatus[] = [];

  // Determine starting vehicle (first owned mode used, or first in userOwnedModes)
  const firstOwnedUsed = segments.find(s => userOwnedModes.includes(s.mode.code));
  const startingVehicle = firstOwnedUsed?.mode.code || null;

  if (!startingVehicle) {
    // No owned vehicle in this route, no tracking needed
    return {
      statuses: segments.map(() => ({
        owned_vehicle_code: null, vehicle_location: '', vehicle_on_board: false, left_at_waypoint: null,
      })),
      warnings,
    };
  }

  let vehicleLocation = segments[0].from; // starts at origin
  let vehicleOnBoard = false;
  let leftAt: string | null = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const modeCode = seg.mode.code;

    if (modeCode === startingVehicle) {
      // User is driving/riding their own vehicle
      vehicleOnBoard = true;
      vehicleLocation = seg.to;
      leftAt = null;
    } else if (isOwnedVehicle(modeCode)) {
      // Using a different owned vehicle (shouldn't happen often)
      vehicleOnBoard = false;
      leftAt = vehicleLocation;
    } else {
      // Using a service mode — can the carrier take the vehicle?
      if (vehicleOnBoard || (!leftAt && i === 0)) {
        // Check if this carrier can carry the owned vehicle
        const canCarry = canCarryVehicle(modeCode, startingVehicle, compatMatrix);

        if (canCarry) {
          // Vehicle travels with user on this carrier
          vehicleOnBoard = true;
          vehicleLocation = seg.to;
          leftAt = null;
          warnings.push(
            `🚢 ${seg.from}→${seg.to}: tu vehículo (${startingVehicle}) viaja contigo en ${seg.mode.name}`
          );
        } else {
          // Vehicle must be left behind
          vehicleOnBoard = false;
          leftAt = seg.from;
          warnings.push(
            `⚠️ Tu vehículo (${startingVehicle}) queda aparcado en ${seg.from} — ${seg.mode.name} no puede transportarlo`
          );
        }
      } else {
        // Vehicle already left somewhere
        vehicleOnBoard = false;
      }
    }

    statuses.push({
      owned_vehicle_code: startingVehicle,
      vehicle_location: vehicleOnBoard ? seg.to : (leftAt || vehicleLocation),
      vehicle_on_board: vehicleOnBoard,
      left_at_waypoint: leftAt,
    });
  }

  // Final check: if vehicle was left somewhere and is not at the final destination
  const finalDest = segments[segments.length - 1].to;
  if (leftAt && leftAt !== finalDest) {
    warnings.push(
      `🚗 ¡Atención! Tu vehículo (${startingVehicle}) quedó en ${leftAt}. Necesitarás recuperarlo o gestionarlo.`
    );
  }

  return { statuses, warnings };
}

// ─── Scoring ──────────────────────────────────────────────

function scoreRoute(
  segments: SegmentAnalysis[],
  weights: ScoringWeights,
  allRoutes: { totalCost: number; totalTime: number }[],
): RouteAlternative['scores'] {
  const totalCost = segments.reduce((s, seg) => s + seg.estimated_cost, 0);
  const totalTime = segments.reduce((s, seg) => s + seg.estimated_time_hours + seg.setup_time_hours + seg.overhead_hours, 0);

  const maxCost = Math.max(...allRoutes.map(r => r.totalCost), 1);
  const maxTime = Math.max(...allRoutes.map(r => r.totalTime), 1);

  const costScore = 10 * (1 - totalCost / maxCost);
  const timeScore = 10 * (1 - totalTime / maxTime);

  const totalDist = segments.reduce((s, seg) => s + seg.distance_km, 0) || 1;
  const avg = (key: keyof TransportMode) =>
    segments.reduce((s, seg) => s + (seg.mode[key] as number) * seg.distance_km, 0) / totalDist;

  const flexibility = avg('score_flexibility');
  const autonomy = avg('score_autonomy');
  const comfort = avg('score_comfort');
  const risk = 10 - avg('score_risk');
  const scenic = avg('score_scenic');
  const load = avg('score_load_capacity');
  const restrictions = 10 - avg('score_restrictions');

  const w = weights;
  const totalWeight = w.cost + w.time + w.flexibility + w.autonomy +
    w.comfort + w.risk + w.scenic + w.load + w.restrictions;

  const overall = totalWeight > 0
    ? (costScore * w.cost + timeScore * w.time + flexibility * w.flexibility +
      autonomy * w.autonomy + comfort * w.comfort + risk * w.risk +
      scenic * w.scenic + load * w.load + restrictions * w.restrictions) / totalWeight
    : 5;

  const round = (n: number) => Math.round(n * 10) / 10;

  return {
    cost: round(costScore), time: round(timeScore),
    flexibility: round(flexibility), autonomy: round(autonomy),
    comfort: round(comfort), risk: round(risk),
    scenic: round(scenic), load: round(load),
    restrictions: round(restrictions), overall: round(overall),
  };
}

// ─── Warnings ─────────────────────────────────────────────

function generateWarnings(segments: SegmentAnalysis[]): string[] {
  const warnings: string[] = [];
  for (const seg of segments) {
    if (seg.mode.requires_booking) {
      warnings.push(`${seg.mode.icon} ${seg.from}→${seg.to}: requiere reserva anticipada`);
    }
    if (seg.mode.requires_schedule) {
      warnings.push(`${seg.mode.icon} ${seg.from}→${seg.to}: sujeto a horarios`);
    }
    if (seg.distance_km > 300 && !seg.mode.is_motorized) {
      warnings.push(`⚠️ ${seg.from}→${seg.to}: ${seg.distance_km}km sin motor — considerar alternativa`);
    }
    if (seg.mode.score_restrictions >= 7) {
      warnings.push(`📋 ${seg.mode.name}: restricciones legales elevadas`);
    }
  }
  return warnings;
}

// ─── Main handler ─────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { waypoints, weights, budget_max, time_max_hours, excluded_modes, user_owned_modes } = await req.json() as {
      waypoints: Waypoint[];
      weights: ScoringWeights;
      budget_max?: number;
      time_max_hours?: number;
      excluded_modes?: string[];
      user_owned_modes?: string[];
    };

    if (!waypoints || waypoints.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 waypoints' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

    // Fetch transport modes, costs, and compatibility matrix in parallel
    const [modesRes, costsRes, compatRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/transport_modes?is_active=eq.true&select=*`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/transport_mode_costs?select=*,transport_modes!inner(code),cost_categories!inner(code,name,icon)`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/transport_mode_compatibility?select=*`, { headers }),
    ]);

    const modes: TransportMode[] = await modesRes.json();
    const rawCosts: any[] = await costsRes.json();
    const compatEntries: CompatibilityEntry[] = await compatRes.json();

    // Build compatibility lookup map
    const compatMatrix = new Map<string, boolean>();
    for (const entry of compatEntries) {
      compatMatrix.set(`${entry.carrier_code}:${entry.carried_code}`, entry.is_compatible);
    }

    // Map costs to flat structure
    const modeCosts: ModeCostEntry[] = rawCosts.map((c: any) => ({
      mode_code: c.transport_modes.code,
      category_code: c.cost_categories.code,
      category_name: c.cost_categories.name,
      category_icon: c.cost_categories.icon,
      cost_per_km: c.cost_per_km,
      base_cost: c.base_cost,
    }));

    // User owned modes (from user_transport_modes, passed by client)
    const ownedModes = (user_owned_modes || []).filter(code => OWNED_VEHICLE_MODES.has(code));

    // Build segments
    const segmentInfos: SegmentInfo[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i], to = waypoints[i + 1];
      const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
      const overSea = isSegmentOverSea(from.lat, from.lng, to.lat, to.lng);
      segmentInfos.push({ from, to, distanceKm, overSea });
    }

    // Generate combinations (now vehicle-aware)
    const combos = generateModeCombinations(
      modes, segmentInfos, excluded_modes || [], ownedModes, compatMatrix,
    );

    // Evaluate each combination
    const rawRoutes = combos.map((combo) => {
      const segments: SegmentAnalysis[] = combo.map((mode, i) => {
        const seg = segmentInfos[i];
        const adjustedDist = seg.distanceKm * roadDistanceFactor(mode.category);
        const timeHours = adjustedDist / mode.avg_speed_kmh;
        const { total, breakdown } = calculateSegmentCosts(mode, adjustedDist, modeCosts);

        return {
          from: seg.from.name, to: seg.to.name,
          distance_km: Math.round(adjustedDist),
          mode,
          estimated_cost: total, cost_breakdown: breakdown,
          estimated_time_hours: Math.round(timeHours * 10) / 10,
          setup_time_hours: mode.setup_time_minutes / 60,
          overhead_hours: mode.overhead_minutes / 60,
        };
      });

      // Track vehicle status across segments
      const { statuses, warnings: vehicleWarnings } = trackVehicleStatus(
        segments, ownedModes, compatMatrix,
      );

      // Attach vehicle status to each segment
      segments.forEach((seg, i) => { seg.vehicle_status = statuses[i]; });

      const totalCost = segments.reduce((s, seg) => s + seg.estimated_cost, 0);
      const totalTime = segments.reduce((s, seg) => s + seg.estimated_time_hours + seg.setup_time_hours + seg.overhead_hours, 0);

      return { segments, totalCost, totalTime, vehicleWarnings };
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

      // Aggregate cost breakdown
      const costMap = new Map<string, CostBreakdownItem>();
      for (const seg of r.segments) {
        for (const cb of seg.cost_breakdown) {
          const existing = costMap.get(cb.category_code);
          if (existing) {
            existing.total += cb.total;
            existing.base_cost += cb.base_cost;
          } else {
            costMap.set(cb.category_code, { ...cb });
          }
        }
      }
      const costBreakdown = [...costMap.values()].map(c => ({
        ...c, total: Math.round(c.total), base_cost: Math.round(c.base_cost * 100) / 100,
      }));

      // Combine standard + vehicle warnings
      const allWarnings = [...generateWarnings(r.segments), ...r.vehicleWarnings];

      return {
        id: `alt-${i}`,
        name,
        segments: r.segments,
        total_distance_km: r.segments.reduce((s, seg) => s + seg.distance_km, 0),
        total_cost: r.totalCost,
        total_time_hours: Math.round(r.totalTime * 10) / 10,
        cost_breakdown: costBreakdown,
        scores: scoreRoute(r.segments, weights, summaries),
        modes_used: modesUsed,
        warnings: allWarnings,
      };
    });

    alternatives.sort((a, b) => b.scores.overall - a.scores.overall);

    return new Response(
      JSON.stringify({ alternatives, total_modes_evaluated: modes.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('score-routes error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
