/**
 * Route Engine — isolated calculation module.
 * Pure functions + types. No React dependencies.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EngineWaypoint {
  latitude: number;
  longitude: number;
  name: string;
  locationId?: string;
}

export interface RouteSegment {
  geometry: { type: string; coordinates: number[][] };
  distance: number;
  duration: number;
  transportMode: string;
  originAirport?: { name: string; iata: string };
  destinationAirport?: { name: string; iata: string };
  candidateDestAirports?: { name: string; iata: string; latitude: number; longitude: number }[];
  originPort?: { name: string; lat: number; lng: number };
  destinationPort?: { name: string; lat: number; lng: number };
  routeName?: string;
}

export interface RouteResult {
  segments: RouteSegment[];
  totalDistance: number;
  totalDuration: number;
}

export interface RouteAlternative {
  mode: string;
  label: string;
  result: RouteResult;
  color: string;
}

export interface RouteImpossible {
  reason: string;
  directDistanceKm: number;
  suggestedModes: string[];
}

export interface EngineConfig {
  /** Primary land transport mode */
  transportMode: 'walking' | 'driving';
  /** Road preference */
  roadPreference: 'fastest' | 'scenic';
  /** Min distance (km) to search for intermodal alternatives */
  alternativeSearchThresholdKm: number;
  /** Min distance (km) to search for flight alternatives */
  flightSearchThresholdKm: number;
  /** Max number of alternatives to return */
  maxAlternatives: number;
  /** Whether to auto-search ferry alternatives */
  searchFerries: boolean;
  /** Whether to auto-search flight alternatives */
  searchFlights: boolean;
  /** Car speed assumption (km/h) for duration estimates */
  carSpeedKmh: number;
  /** Ferry speed assumption (km/h) */
  ferrySpeedKmh: number;
  /** Flight speed assumption (km/h) */
  flightSpeedKmh: number;
  /** Port search radius (meters) */
  portSearchRadiusM: number;
  /** Max straight-line segment length before considered impossible (meters) */
  maxFallbackSegmentM: number;
  /** Min duration (hours) for a segment to show the "Plan journeys" action */
  segmentPlannerMinHours: number;
  /** Min distance (km) for a segment to show "Stops" and "Optimize" actions */
  segmentStopsMinKm: number;
  /** Max distance (km) for a segment to show "Stops" and "Optimize" actions */
  segmentStopsMaxKm: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  transportMode: 'driving',
  roadPreference: 'fastest',
  alternativeSearchThresholdKm: 20,
  flightSearchThresholdKm: 100,
  maxAlternatives: 3,
  searchFerries: true,
  searchFlights: true,
  carSpeedKmh: 80,
  ferrySpeedKmh: 30,
  flightSpeedKmh: 800,
  portSearchRadiusM: 2000,
  maxFallbackSegmentM: 1000,
  segmentPlannerMinHours: 4,
  segmentStopsMinKm: 50,
  segmentStopsMaxKm: 1000,
};

export interface CalculationResult {
  primary: RouteResult | null;
  alternatives: RouteAlternative[];
  impossible: RouteImpossible | null;
}

// ─── Geo helpers ─────────────────────────────────────────────────────────────

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function generateGreatCircleArc(lat1: number, lng1: number, lat2: number, lng2: number, numPoints: number): number[][] {
  const coords: number[][] = [];
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const lam1 = lng1 * Math.PI / 180;
  const lam2 = lng2 * Math.PI / 180;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2
  ));
  if (d === 0) return [[lng1, lat1], [lng2, lat2]];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    coords.push([Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.sqrt(x ** 2 + y ** 2)) * 180 / Math.PI]);
  }
  return coords;
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// ─── Route colors ────────────────────────────────────────────────────────────

const ROUTE_COLORS = [
  '#0891b2', '#06b6d4', '#8b5cf6', '#d946ef', '#f59e0b',
  '#10b981', '#f43f5e', '#6366f1', '#14b8a6', '#ec4899',
  '#84cc16', '#a855f7', '#22d3ee', '#fb923c',
];

export function getRouteColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

// ─── Label extraction ────────────────────────────────────────────────────────

export function extractPortNames(result: any): string {
  const ferrySeg = result?.segments?.find((s: any) => s.transportMode === 'ferry');
  if (ferrySeg?.originPort?.name && ferrySeg?.destinationPort?.name) {
    return `${ferrySeg.originPort.name} → ${ferrySeg.destinationPort.name}`;
  }
  if (ferrySeg?.routeName) return ferrySeg.routeName;
  return 'Ferry';
}

export function extractFlightLabel(result: any): string {
  const flightSeg = result?.segments?.find((s: any) => s.transportMode === 'flight');
  if (flightSeg?.originAirport?.iata && flightSeg?.destinationAirport?.iata) {
    return `✈ ${flightSeg.originAirport.iata} → ${flightSeg.destinationAirport.iata}`;
  }
  if (flightSeg?.originAirport?.name && flightSeg?.destinationAirport?.name) {
    return `✈ ${flightSeg.originAirport.name} → ${flightSeg.destinationAirport.name}`;
  }
  return '✈ Vuelo';
}

// ─── Map segment builder ─────────────────────────────────────────────────────

export interface MapSegment extends RouteSegment {
  routeColor: string;
  stageNumber: number;
  isAlternative?: boolean;
  alternativeMode?: string;
  alternativeLabel?: string;
}

export function buildMapSegments(
  primary: RouteResult | null,
  alternatives: RouteAlternative[],
  resolvedFlightLegs?: any[] | null,
): MapSegment[] {
  const allMapSegments: MapSegment[] = [];

  if (primary?.segments) {
    let finalSegments = [...primary.segments];

    // Replace single flight arc with chained arcs if we have resolved legs
    if (resolvedFlightLegs && resolvedFlightLegs.length >= 1) {
      const newSegments: RouteSegment[] = [];
      for (const seg of finalSegments) {
        if (seg.transportMode === 'flight') {
          for (const leg of resolvedFlightLegs) {
            if (leg.origin.latitude && leg.origin.longitude && leg.destination.latitude && leg.destination.longitude) {
              const arcCoords = generateGreatCircleArc(
                leg.origin.latitude, leg.origin.longitude,
                leg.destination.latitude, leg.destination.longitude,
                50,
              );
              const dist = haversineDistance(leg.origin.latitude, leg.origin.longitude, leg.destination.latitude, leg.destination.longitude);
              newSegments.push({
                geometry: { type: 'LineString', coordinates: arcCoords },
                distance: dist,
                duration: dist / (800 * 1000 / 3600),
                transportMode: 'flight',
                originAirport: { name: leg.origin.name, iata: leg.origin.iata },
                destinationAirport: { name: leg.destination.name, iata: leg.destination.iata },
              });
            }
          }
        } else {
          newSegments.push(seg);
        }
      }
      finalSegments = newSegments;
    }

    allMapSegments.push(...finalSegments.map(seg => ({
      ...seg,
      routeColor: '#2563eb',
      stageNumber: 1,
    })));
  }

  // Add alternative routes
  for (const alt of alternatives) {
    if (alt.result?.segments) {
      allMapSegments.push(...alt.result.segments.map((seg: any) => {
        const isPrimaryMode = seg.transportMode === alt.mode;
        return {
          ...seg,
          routeColor: isPrimaryMode ? alt.color : '#64748b',
          isAlternative: true,
          alternativeMode: alt.mode,
          alternativeLabel: alt.label,
          stageNumber: 1,
        };
      }));
    }
  }

  return allMapSegments;
}

// ─── API response parser ─────────────────────────────────────────────────────

export function parseApiResponse(data: any): CalculationResult {
  // Route impossible
  if (data?.routeImpossible) {
    const apiAlts = data.alternatives || [];
    const alternatives = apiAlts.map((alt: any, idx: number) => ({
      mode: alt.mode,
      label: alt.label || (alt.mode === 'flight' ? '✈ Vuelo' : '⛴ Ferry'),
      color: alt.mode === 'flight' ? '#9333ea' : getRouteColor(idx),
      result: { segments: alt.segments, totalDistance: alt.totalDistance, totalDuration: alt.totalDuration },
    }));

    return {
      primary: null,
      alternatives,
      impossible: {
        reason: data.reason || 'no_road_connection',
        directDistanceKm: data.directDistanceKm || 0,
        suggestedModes: data.suggestedModes || ['flight'],
      },
    };
  }

  // Normal result
  const primary: RouteResult = {
    segments: data.segments,
    totalDistance: data.totalDistance,
    totalDuration: data.totalDuration,
  };

  const apiAlts = data.alternatives || [];
  const alternatives = apiAlts.map((alt: any, idx: number) => ({
    mode: alt.mode,
    label: alt.label || (alt.mode === 'flight' ? '✈ Vuelo' : '⛴ Ferry'),
    color: alt.mode === 'flight' ? '#9333ea' : getRouteColor(idx),
    result: { segments: alt.segments, totalDistance: alt.totalDistance, totalDuration: alt.totalDuration },
  }));

  // Legacy ferry alternatives
  if (alternatives.length === 0 && data.ferryAlternatives?.length > 0) {
    for (let idx = 0; idx < data.ferryAlternatives.length; idx++) {
      const alt = data.ferryAlternatives[idx];
      alternatives.push({
        mode: 'ferry',
        label: `⛴ ${alt.originPort?.name || '?'} → ${alt.destPort?.name || '?'}`,
        color: getRouteColor(idx),
        result: { segments: alt.segments, totalDistance: alt.totalDistance, totalDuration: alt.totalDuration },
      });
    }
  }

  return { primary, alternatives, impossible: null };
}

// ─── Transport mode mapping ──────────────────────────────────────────────────

export const TRANSPORT_CODE_TO_ROUTE_MODE: Record<string, 'walking' | 'driving'> = {
  walking: 'walking',
  bicycle: 'walking',
  own_car: 'driving',
  own_motorcycle: 'driving',
  camper_van: 'driving',
  car_caravan: 'driving',
  rental_car: 'driving',
  rental_motorcycle: 'driving',
  rental_camper: 'driving',
  rental_caravan: 'driving',
  rental_bicycle: 'walking',
};
