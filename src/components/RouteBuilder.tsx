import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { renderTransportModeIcon } from '@/lib/icon-utils';
import { AIRouteAdvisor } from '@/components/AIRouteAdvisor';
import { JourneyPlanner } from '@/components/JourneyPlanner';
import { SuggestedStops, SuggestedStop } from '@/components/SuggestedStops';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Route as RouteIcon,
  X,
  Footprints,
  Car,
  Plane,
  Ship,
  Save,
  Wand2,
  Loader2,
  MapPin,
  Clock,
  Navigation,
  Home,
  Globe,
  Pencil,
  Settings2,
  Bus,
  Train,
  Bike,
  CheckCircle2,
} from 'lucide-react';
import { FlightSegmentDetails } from '@/components/FlightSegmentDetails';
import { SegmentBreakdown, SegmentEndpoints } from '@/components/SegmentBreakdown';
import { RouteEngineSettings } from '@/components/RouteEngineSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useRoutes, RouteWaypoint, Route } from '@/hooks/use-routes';
import { useRouteCalculation } from '@/hooks/use-route-calculation';
import { useLocationsStore } from '@/store/locations-store';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import { forwardGeocode, ForwardGeocodeResult } from '@/lib/geocoding';
import {
  formatDuration,
  formatDistance,
  getRouteColor,
  extractFlightLabel,
  extractPortNames,
  TRANSPORT_CODE_TO_ROUTE_MODE,
  haversineDistance,
  generateGreatCircleArc,
  EngineConfig,
  DEFAULT_ENGINE_CONFIG,
} from '@/lib/route-engine';

/**
 * Maps transport_modes codes → ORS routing profile + UI group.
 * Each group corresponds to one button in the selector.
 */
interface TransportGroup {
  value: 'walking' | 'driving' | 'flight' | 'ferry';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** DB codes that belong to this group */
  codes: string[];
}

const CODE_TO_GROUP: Record<string, 'walking' | 'driving' | 'flight' | 'ferry'> = {
  walking: 'walking',
  bicycle: 'walking',
  rental_bicycle: 'walking',
  own_car: 'driving',
  own_motorcycle: 'driving',
  camper_van: 'driving',
  car_caravan: 'driving',
  rental_car: 'driving',
  rental_motorcycle: 'driving',
  rental_camper: 'driving',
  rental_caravan: 'driving',
  taxi: 'driving',
  public_bus: 'driving',
  train: 'driving',
  ferry: 'ferry',
  own_boat: 'ferry',
  rental_boat: 'ferry',
  airline: 'flight',
  private_plane: 'flight',
};

const GROUP_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  walking: { label: 'A pie', icon: Footprints },
  driving: { label: 'Coche', icon: Car },
  ferry: { label: 'Ferry', icon: Ship },
  flight: { label: 'Vuelo', icon: Plane },
};

/** Fallback groups when user has no transport preferences configured */
const DEFAULT_TRANSPORT_GROUPS: TransportGroup[] = [
  { value: 'walking', label: 'A pie', icon: Footprints, codes: ['walking', 'bicycle'] },
  { value: 'driving', label: 'Coche', icon: Car, codes: ['own_car'] },
];

/** Check if user has enabled a given intermodal mode (ferry/flight) */
function isIntermodalModeAllowed(
  mode: string,
  userPrefs: Map<string, { layer: string; preference: string }>,
): boolean {
  if (userPrefs.size === 0) return true; // No prefs configured = allow all
  // Map intermodal mode to DB codes
  const codesForMode: Record<string, string[]> = {
    ferry: ['ferry', 'own_boat', 'rental_boat'],
    flight: ['airline', 'private_plane'],
  };
  const codes = codesForMode[mode] || [];
  return codes.some(code => userPrefs.has(code));
}

/** Get preference score for a mode (lower = more preferred): required=0, preferred=1, allowed=2 */
function getPreferenceScore(
  mode: string,
  userPrefs: Map<string, { layer: string; preference: string }>,
): number {
  const codesForMode: Record<string, string[]> = {
    ferry: ['ferry', 'own_boat', 'rental_boat'],
    flight: ['airline', 'private_plane'],
    driving: ['own_car', 'own_motorcycle', 'camper_van', 'car_caravan', 'rental_car', 'rental_motorcycle', 'rental_camper', 'rental_caravan', 'taxi', 'public_bus', 'train'],
    walking: ['walking', 'bicycle', 'rental_bicycle'],
  };
  const scores: Record<string, number> = { required: 0, preferred: 1, allowed: 2 };
  const codes = codesForMode[mode] || [];
  let best = 3;
  for (const code of codes) {
    const pref = userPrefs.get(code);
    if (pref) {
      const s = scores[pref.preference] ?? 2;
      if (s < best) best = s;
    }
  }
  return best;
}

/** Sort alternatives by user priority ranking and preference */
function sortAlternativesByPreference(
  alts: { mode: string; label: string; color: string; result: any }[],
  userPrefs: Map<string, { layer: string; preference: string }>,
  priorityRanking: string[],
): { mode: string; label: string; color: string; result: any }[] {
  return [...alts].sort((a, b) => {
    // 1. Preference score (required > preferred > allowed)
    const prefA = getPreferenceScore(a.mode, userPrefs);
    const prefB = getPreferenceScore(b.mode, userPrefs);
    if (prefA !== prefB) return prefA - prefB;

    // 2. Time priority from ranking (if time is high priority, shorter duration first)
    const timeIdx = priorityRanking.indexOf('time');
    if (timeIdx !== -1 && timeIdx < 3) {
      const durA = a.result?.totalDuration ?? Infinity;
      const durB = b.result?.totalDuration ?? Infinity;
      if (durA !== durB) return durA - durB;
    }

    // 3. Cost priority (if cost is high priority, shorter distance ≈ cheaper first)
    const costIdx = priorityRanking.indexOf('cost');
    if (costIdx !== -1 && costIdx < 3) {
      const distA = a.result?.totalDistance ?? Infinity;
      const distB = b.result?.totalDistance ?? Infinity;
      if (distA !== distB) return distA - distB;
    }

    return 0;
  });
}


interface RouteBuilderProps {
  onClose: () => void;
  onRouteCalculated?: (segments: any[]) => void;
  onWaypointsChanged?: (waypoints: RouteWaypoint[]) => void;
  editRouteId?: string;
}

export function RouteBuilder({ onClose, onRouteCalculated, onWaypointsChanged, editRouteId }: RouteBuilderProps) {
  const { user } = useAuth();
  const { routes, loading: routesLoading, calculating, saveRoute, updateRoute, calculateRoute, saveMultiModalRoute } = useRoutes();
  const { getAllLocations } = useLocationsStore();

  // Core state
  const [routeName, setRouteName] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [origin, setOrigin] = useState<RouteWaypoint | null>(null);
  const [destination, setDestination] = useState<RouteWaypoint | null>(null);
  const [transportMode, setTransportMode] = useState<'walking' | 'driving' | 'flight' | 'ferry'>('driving');
  const [roadPreference, setRoadPreference] = useState<'fastest' | 'scenic'>('fastest');
  const [isSaving, setIsSaving] = useState(false);
  const [routeResult, setRouteResult] = useState<{ segments: any[]; totalDistance: number; totalDuration: number } | null>(null);
  const [resolvedFlightLegs, setResolvedFlightLegs] = useState<any[] | null>(null);
  const [resolvedDestAirport, setResolvedDestAirport] = useState<any | null>(null);
  const [routeImpossible, setRouteImpossible] = useState<{ reason: string; directDistanceKm: number; suggestedModes: string[] } | null>(null);
  const [routeAlternatives, setRouteAlternatives] = useState<{ mode: string; label: string; result: any; color: string }[]>([]);
  const [calculatingAlternatives, setCalculatingAlternatives] = useState(false);
  const [hoveredAlternativeLabel, setHoveredAlternativeLabel] = useState<string | null>(null);
  const [intermediateStops, setIntermediateStops] = useState<SuggestedStop[]>([]);
  const [optimizingOrder, setOptimizingOrder] = useState(false);
  const [routeAccepted, setRouteAccepted] = useState(false);
  const [activeSegmentAction, setActiveSegmentAction] = useState<{ action: string; endpoints: SegmentEndpoints } | null>(null);
  const skipNextAutoCalculationRef = useRef(false);

  // Engine settings panel
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [engineConfig, setEngineConfig] = useState<EngineConfig>({ ...DEFAULT_ENGINE_CONFIG });

   // User preferences
  const [availableTransportGroups, setAvailableTransportGroups] = useState<TransportGroup[]>([...DEFAULT_TRANSPORT_GROUPS]);
  const [userPrefsLoaded, setUserPrefsLoaded] = useState(false);
  const [userTransportPrefs, setUserTransportPrefs] = useState<Map<string, { layer: string; preference: string }>>(new Map());
  const [priorityRanking, setPriorityRanking] = useState<string[]>([]);

  // Location picker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'origin' | 'destination'>('origin');
  const [searchQuery, setSearchQuery] = useState('');
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [geoResults, setGeoResults] = useState<ForwardGeocodeResult[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);
  const geoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load home location + user preferences (transport modes, priorities)
  useEffect(() => {
    if (!user) return;

    // Load home + priority ranking + route engine defaults
    supabase.from('profiles').select('home_latitude, home_longitude, home_name, priority_ranking, route_engine_defaults')
      .eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.home_latitude && data?.home_longitude) {
          setHomeLocation({ lat: data.home_latitude, lng: data.home_longitude, name: data.home_name || 'Casa' });
        }

        // Apply saved route engine defaults
        if ((data as any)?.route_engine_defaults && !editRouteId) {
          setEngineConfig(prev => ({ ...prev, ...(data as any).route_engine_defaults }));
        }

        // Store priority ranking for alternative ordering
        if (data && (data as any).priority_ranking) {
          const ranking = (data as any).priority_ranking as string[];
          if (Array.isArray(ranking) && ranking.length > 0) {
            setPriorityRanking(ranking);
            const scenicIdx = ranking.indexOf('scenic');
            const timeIdx = ranking.indexOf('time');
            if (scenicIdx !== -1 && timeIdx !== -1 && scenicIdx < timeIdx && !editRouteId) {
              setRoadPreference('scenic');
            }
          }
        }
      });

    // Load user transport modes → build dynamic groups
    supabase.from('user_transport_modes')
      .select('transport_mode_code, is_available, layer, preference')
      .eq('user_id', user.id)
      .eq('is_available', true)
      .then(({ data: userModes }) => {
        if (userModes && userModes.length > 0) {
          // Store raw preferences for filtering alternatives later
          const prefsMap = new Map<string, { layer: string; preference: string }>();
          userModes.forEach(m => {
            prefsMap.set(m.transport_mode_code, { layer: m.layer || 'owned', preference: m.preference || 'allowed' });
          });
          setUserTransportPrefs(prefsMap);

          // Build transport groups from user's available codes
          const groupCodes = new Map<string, string[]>();
          for (const m of userModes) {
            const group = CODE_TO_GROUP[m.transport_mode_code];
            if (!group) continue;
            if (!groupCodes.has(group)) groupCodes.set(group, []);
            groupCodes.get(group)!.push(m.transport_mode_code);
          }

          // Build groups preserving order: walking, driving, ferry, flight
          const orderedKeys = ['walking', 'driving', 'ferry', 'flight'] as const;
          const groups: TransportGroup[] = [];
          for (const key of orderedKeys) {
            const codes = groupCodes.get(key);
            if (!codes || codes.length === 0) continue;
            const meta = GROUP_META[key];
            groups.push({ value: key, label: meta.label, icon: meta.icon, codes });
          }

          if (groups.length > 0) {
            setAvailableTransportGroups(groups);
            // Auto-select first available if current not in available groups
            if (!editRouteId) {
              const currentAvailable = groups.find(g => g.value === transportMode);
              if (!currentAvailable) {
                setTransportMode(groups[0].value);
              }
            }
          }

          // Auto-configure engine based on user transport modes
          const hasFlightModes = groupCodes.has('flight');
          const hasFerryModes = groupCodes.has('ferry');
          setEngineConfig(prev => ({
            ...prev,
            searchFlights: hasFlightModes ? prev.searchFlights : false,
            searchFerries: hasFerryModes ? prev.searchFerries : false,
          }));
        }
        setUserPrefsLoaded(true);
      });
  }, [user]);

  // Load existing route if editing
  useEffect(() => {
    if (editRouteId) {
      const route = routes.find(r => r.id === editRouteId);
      if (route && route.waypoints.length >= 2) {
        setRouteName(route.name);
        setRouteDescription(route.description || '');
        setOrigin(route.waypoints[0]);
        setDestination(route.waypoints[route.waypoints.length - 1]);
        setTransportMode(route.transportMode as any || 'driving');
        setRoadPreference(route.roadPreference as any || 'fastest');
      }
    }
  }, [editRouteId, routes]);

  // Notify parent of waypoints
  useEffect(() => {
    const wps: RouteWaypoint[] = [];
    if (origin) wps.push({ ...origin, position: 0 });
    if (destination) wps.push({ ...destination, position: 1 });
    onWaypointsChanged?.(wps);
  }, [origin, destination]);

  // Dispatch segments to map (primary route + alternatives)
  useEffect(() => {
    const allMapSegments: any[] = [];

    if (routeResult?.segments) {
      let finalSegments = [...routeResult.segments];

      // Replace single flight arc with chained arcs if we have resolved legs
      if (resolvedFlightLegs && resolvedFlightLegs.length >= 1) {
        const newSegments: any[] = [];
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

    // Add alternative routes as semi-transparent clickable lines
    for (const alt of routeAlternatives) {
      if (alt.result?.segments) {
        allMapSegments.push(...alt.result.segments.map((seg: any) => {
          // Use the alt color for the primary transport mode, blue for driving legs
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

    // When real route geometry is available (primary or alternatives), clear the
    // advisor's approximate straight-line preview so it doesn't overlay the actual route.
    if (allMapSegments.length > 0) {
      window.dispatchEvent(new CustomEvent('map-clear-advisor-preview'));
    }

    onRouteCalculated?.(allMapSegments);
  }, [routeResult, resolvedFlightLegs, routeAlternatives, onRouteCalculated]);

  const allLocations = getAllLocations();
  const filteredLocations = searchQuery.trim()
    ? allLocations.filter(loc =>
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (loc.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 20)
    : allLocations.slice(0, 20);

  const openPicker = useCallback((target: 'origin' | 'destination') => {
    setPickerTarget(target);
    setShowPicker(true);
    setSearchQuery('');
    setGeoResults([]);
  }, []);

  const handlePickerSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (geoSearchTimer.current) clearTimeout(geoSearchTimer.current);
    if (query.trim().length < 3) { setGeoResults([]); return; }
    setSearchingGeo(true);
    geoSearchTimer.current = setTimeout(async () => {
      try {
        const results = await forwardGeocode(query);
        setGeoResults(results);
      } catch (e) {
        console.error('Geo search error:', e);
      } finally {
        setSearchingGeo(false);
      }
    }, 300);
  }, []);

  const createWaypointFromLocation = useCallback((loc: GeoLocation): RouteWaypoint => ({
    locationId: loc.id,
    position: 0,
    name: loc.name,
    latitude: loc.coordinates.lat,
    longitude: loc.coordinates.lng,
    transportMode,
  }), [transportMode]);

  const createWaypointFromGeo = useCallback((result: ForwardGeocodeResult): RouteWaypoint => ({
    position: 0,
    name: result.shortName,
    latitude: result.lat,
    longitude: result.lng,
    transportMode,
  }), [transportMode]);

  const createWaypointFromHome = useCallback((): RouteWaypoint | null => {
    if (!homeLocation) return null;
    return { position: 0, name: homeLocation.name, latitude: homeLocation.lat, longitude: homeLocation.lng, transportMode };
  }, [homeLocation, transportMode]);

  const handlePickLocation = useCallback((wp: RouteWaypoint) => {
    if (pickerTarget === 'origin') {
      setOrigin(wp);
    } else {
      setDestination(wp);
    }
    setShowPicker(false);
    setSearchQuery('');
    setGeoResults([]);
    // Reset calculation when points change
    setRouteResult(null);
    setRouteImpossible(null);
    setRouteAccepted(false);
  }, [pickerTarget]);

  // handleCalculate removed — auto-calculate useEffect handles all recalculation

  const handleSwitchMode = useCallback((mode: 'flight' | 'ferry', altLabel?: string) => {
    const alt = altLabel 
      ? routeAlternatives.find(a => a.label === altLabel)
      : routeAlternatives.find(a => a.mode === mode);

    // Use ReactDOM.flushSync-free batching: wrap in unstable_batchedUpdates
    // React 18 auto-batches setState in event handlers, but custom events
    // dispatched via window.addEventListener may not be batched.
    // We use queueMicrotask to ensure all updates land in one render cycle.
    if (alt?.result) {
      skipNextAutoCalculationRef.current = true;
      // Single synchronous batch — React 18 batches these automatically
      setHoveredAlternativeLabel(null);
      setTransportMode(mode);
      setRouteImpossible(null);
      setRouteResult(alt.result);
      setRouteAlternatives([]);
      setResolvedFlightLegs(null);
      setResolvedDestAirport(null);
      return;
    }

    setHoveredAlternativeLabel(null);
    setTransportMode(mode);
    setRouteImpossible(null);
    setRouteResult(null);
    setRouteAlternatives([]);
    setResolvedFlightLegs(null);
    setResolvedDestAirport(null);
  }, [routeAlternatives]);

  // Listen for map clicks on alternative route lines
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.mode) {
        handleSwitchMode(detail.mode as 'flight' | 'ferry', detail.label);
      }
    };
    window.addEventListener('route-alternative-selected', handler);
    return () => window.removeEventListener('route-alternative-selected', handler);
  }, [handleSwitchMode]);

  // Sync hover state from map polyline hover → sidebar highlight
  useEffect(() => {
    const handler = (e: Event) => {
      const label = (e as CustomEvent).detail?.label ?? null;
      setHoveredAlternativeLabel(label);
    };
    window.addEventListener('route-alternative-hover', handler);
    return () => window.removeEventListener('route-alternative-hover', handler);
  }, []);

  // Auto-calculate alternatives when route is impossible (legacy fallback)
  useEffect(() => {
    if (!routeImpossible || !origin || !destination) return;

    // If the API already returned alternatives, never recalculate and overwrite them.
    if (routeAlternatives.length > 0) {
      setCalculatingAlternatives(false);
      return;
    }

    if (routeImpossible.suggestedModes.length === 0) return;

    let cancelled = false;
    setCalculatingAlternatives(true);

    const modes = routeImpossible.suggestedModes.filter(m => isIntermodalModeAllowed(m, userTransportPrefs));
    if (modes.length === 0) {
      setCalculatingAlternatives(false);
      return;
    }

    const altConfigs = modes.map(mode => ({
      mode,
      label: mode === 'flight' ? 'Vuelo' : 'Ferry',
      color: mode === 'flight' ? '#9333ea' : '#0891b2',
    }));

    Promise.all(
      altConfigs.map(async (cfg) => {
        const result = await calculateRoute(origin, destination, cfg.mode, roadPreference);
        if (cancelled || !result || (result as any).routeImpossible) return null;
        if (!result.segments || result.segments.length === 0) return null;

        return [{
          mode: cfg.mode,
          label: cfg.mode === 'flight'
            ? extractFlightLabel(result)
            : `⛴ ${extractPortNames(result)}`,
          color: cfg.color,
          result: { segments: result.segments, totalDistance: result.totalDistance, totalDuration: result.totalDuration },
        }];
      })
    ).then(results => {
      if (cancelled) return;
      const valid = results.filter(Boolean).flat() as { mode: string; label: string; color: string; result: any }[];
      setRouteAlternatives(sortAlternativesByPreference(valid, userTransportPrefs, priorityRanking));
      setCalculatingAlternatives(false);
    });

    return () => {
      cancelled = true;
    };
  }, [routeImpossible, routeAlternatives.length, origin, destination, roadPreference, calculateRoute, userTransportPrefs, priorityRanking]);

  // Auto-calculate when origin, destination, or transport mode change
  // Two-phase: fast primary route first, then lazy alternatives
  useEffect(() => {
    if (!origin || !destination) return;

    if (skipNextAutoCalculationRef.current) {
      skipNextAutoCalculationRef.current = false;
      return;
    }

    let cancelled = false;

    (async () => {
      setRouteImpossible(null);
      setResolvedFlightLegs(null);
      setResolvedDestAirport(null);
      setRouteAlternatives([]);
      setHoveredAlternativeLabel(null);
      setRouteAccepted(false);

      const result = await calculateRoute(origin, destination, transportMode, roadPreference, {
        skipAlternatives: true,
      });
      if (cancelled) return;
      if (!result) return;

      if ((result as any).routeImpossible) {
        const fullResult = await calculateRoute(origin, destination, transportMode, roadPreference, {
          searchFerries: engineConfig.searchFerries,
          searchFlights: engineConfig.searchFlights,
          alternativeSearchThresholdKm: engineConfig.alternativeSearchThresholdKm,
          flightSearchThresholdKm: engineConfig.flightSearchThresholdKm,
        });
        if (cancelled) return;
        if (!fullResult) return;

        const impossibleAlternatives = ((fullResult as any).alternatives || [])
          .filter((alt: any) => isIntermodalModeAllowed(alt.mode, userTransportPrefs))
          .slice(0, 4)
          .map((alt: any, idx: number) => ({
            mode: alt.mode,
            label: alt.label || (alt.mode === 'flight' ? '✈ Vuelo' : '⛴ Ferry'),
            color: alt.mode === 'flight' ? '#9333ea' : getRouteColor(idx),
            result: { segments: alt.segments, totalDistance: alt.totalDistance, totalDuration: alt.totalDuration },
          }));

        setCalculatingAlternatives(false);
        setRouteResult(null);
        setRouteImpossible({
          reason: (fullResult as any).reason || 'no_road_connection',
          directDistanceKm: (fullResult as any).directDistanceKm || 0,
          suggestedModes: ((fullResult as any).suggestedModes || ['flight']).filter((m: string) => isIntermodalModeAllowed(m, userTransportPrefs)),
        });
        setRouteAlternatives(sortAlternativesByPreference(impossibleAlternatives, userTransportPrefs, priorityRanking));
      } else {
        setRouteResult(result);

        // Warn if any land segment exceeds max planner hours
        const landSegments = (result.segments || []).filter((s: any) => s.transportMode === 'driving' || s.transportMode === 'walking');
        const overMaxSegment = landSegments.find((s: any) => (s.duration / 3600) > engineConfig.segmentPlannerMaxHours);
        if (overMaxSegment) {
          const hours = Math.round(overMaxSegment.duration / 3600);
          toast.warning(`Tramo de ${hours}h detectado — considera dividir en jornadas`, {
            description: `Supera el máximo configurado de ${engineConfig.segmentPlannerMaxHours}h`,
            duration: 6000,
          });
        }

        if (engineConfig.searchFerries || engineConfig.searchFlights) {
          setCalculatingAlternatives(true);
          const altResult = await calculateRoute(origin, destination, transportMode, roadPreference, {
            searchFerries: engineConfig.searchFerries,
            searchFlights: engineConfig.searchFlights,
            alternativeSearchThresholdKm: engineConfig.alternativeSearchThresholdKm,
            flightSearchThresholdKm: engineConfig.flightSearchThresholdKm,
          });
          if (cancelled) {
            setCalculatingAlternatives(false);
            return;
          }

          const apiAlts = ((altResult as any)?.alternatives || [])
            .filter((alt: any) => isIntermodalModeAllowed(alt.mode, userTransportPrefs))
            .slice(0, 3);

          if (apiAlts.length > 0) {
            const alts = apiAlts.map((alt: any, idx: number) => ({
              mode: alt.mode,
              label: alt.label || (alt.mode === 'flight' ? '✈ Vuelo' : '⛴ Ferry'),
              color: alt.mode === 'flight' ? '#9333ea' : getRouteColor(idx),
              result: { segments: alt.segments, totalDistance: alt.totalDistance, totalDuration: alt.totalDuration },
            }));
            setRouteAlternatives(sortAlternativesByPreference(alts, userTransportPrefs, priorityRanking));
          }

          setCalculatingAlternatives(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude, transportMode, roadPreference, engineConfig.searchFerries, engineConfig.searchFlights, engineConfig.alternativeSearchThresholdKm, engineConfig.flightSearchThresholdKm, calculateRoute, userTransportPrefs, priorityRanking]);

  // Save
  const handleSave = useCallback(async () => {
    if (!routeName.trim()) { toast.error('Introduce un nombre para el itinerario'); return; }
    if (!origin || !destination) { toast.error('Necesitas origen y destino'); return; }

    // Calculate if not done
    let result = routeResult;
    if (!result) {
      result = await calculateRoute(origin, destination, transportMode, roadPreference);
      if (!result) return;
      setRouteResult(result);
    }

    setIsSaving(true);

    // Check if this is an accepted multimodal route
    const uniqueModes = [...new Set(result.segments?.map((s: any) => s.transportMode as string))];
    const isMultiModal = uniqueModes.length > 1 && routeAccepted;

    if (isMultiModal && !editRouteId) {
      // Save as parent + child routes
      await saveMultiModalRoute(
        routeName,
        routeDescription || undefined,
        origin,
        destination,
        result.segments,
        result.totalDistance,
        result.totalDuration,
        roadPreference,
      );
    } else if (editRouteId) {
      await updateRoute(
        editRouteId,
        routeName,
        origin,
        destination,
        result.segments,
        result.totalDistance,
        result.totalDuration,
        transportMode,
        roadPreference,
        routeDescription || undefined,
      );
    } else {
      await saveRoute(
        routeName,
        origin,
        destination,
        result.segments,
        result.totalDistance,
        result.totalDuration,
        transportMode,
        roadPreference,
        routeDescription || undefined,
        intermediateStops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng })),
      );
    }
    setIsSaving(false);
    onClose();
  }, [routeName, routeDescription, origin, destination, transportMode, roadPreference, routeResult, routeAccepted, calculateRoute, saveRoute, saveMultiModalRoute, updateRoute, editRouteId, onClose, intermediateStops]);

  // ============ RENDER ============
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              {editRouteId ? 'Editar Itinerario' : 'Crear Itinerario'}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={showEngineSettings ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setShowEngineSettings(!showEngineSettings)}
              className="h-7 w-7"
              title="Configuración del motor de rutas"
            >
              <Settings2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Input placeholder="Nombre del itinerario..." value={routeName} onChange={(e) => setRouteName(e.target.value)} className="text-sm" />
          <Input placeholder="Descripción (opcional)..." value={routeDescription} onChange={(e) => setRouteDescription(e.target.value)} className="text-sm" />
        </div>
      </div>

      {/* Engine settings panel */}
      <AnimatePresence>
        {showEngineSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-b border-border overflow-hidden"
          >
            <ScrollArea className="max-h-[50vh]">
              <div className="p-3">
                <RouteEngineSettings
                  config={engineConfig}
                  onChange={(partial) => setEngineConfig(prev => ({ ...prev, ...partial }))}
                />
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      <ScrollArea className="flex-1">
        <div className="px-3 pt-3 space-y-3">
          {/* Transport mode selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Modo de transporte</Label>
            <div className="flex gap-1.5">
              {availableTransportGroups.map(mode => {
                const ModeIcon = mode.icon;
                const isActive = transportMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    onClick={() => { setTransportMode(mode.value); setRouteResult(null); setRouteAccepted(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <ModeIcon className="w-3.5 h-3.5" />
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Road preference (only for driving/walking) */}
          {transportMode === 'driving' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Preferencia de vía</Label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setRoadPreference('fastest'); setRouteResult(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                    roadPreference === 'fastest'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Rápida
                </button>
                <button
                  onClick={() => { setRoadPreference('scenic'); setRouteResult(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                    roadPreference === 'scenic'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Paisajística
                </button>
              </div>
            </div>
          )}

          <Separator />

          {/* Origin */}
          <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${
            origin ? 'bg-muted/30 border-border/40' : 'border-2 border-dashed border-primary/40 bg-primary/5'
          }`}>
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">A</div>
            {origin ? (
              <>
                <span className="text-xs font-medium truncate flex-1">{origin.name}</span>
                <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => openPicker('origin')}>
                  <Pencil className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground flex-1">Punto de origen</span>
                <div className="flex gap-1">
                  {homeLocation && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => { const wp = createWaypointFromHome(); if (wp) { setOrigin(wp); setRouteResult(null); } }}>
                      <Home className="w-3.5 h-3.5" /> Casa
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openPicker('origin')}>
                    <MapPin className="w-3.5 h-3.5" /> Elegir
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Calculating spinner */}
          {(calculating || calculatingAlternatives) && !routeResult && (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Calculando ruta…</span>
            </div>
          )}

          {/* Segment breakdown */}
          {(origin || destination) && (
            <div className="px-2 space-y-1.5">
              {/* Transport modes involved banner — includes primary segments + alternatives */}
              {routeResult && routeResult.segments?.length > 0 && (() => {
                const modesInSegments = [...new Set(routeResult.segments.map((s: any) => s.transportMode as string))];
                const modesInAlternatives = [...new Set(routeAlternatives.map(a => a.mode))];
                const allInvolvedModes = [...new Set([...modesInSegments, ...modesInAlternatives])];
                const extraModes = allInvolvedModes.filter(m => m !== transportMode);
                if (extraModes.length === 0) return null;
                const modeIcons: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
                  driving: { icon: Car, label: 'Coche', color: 'text-blue-600' },
                  walking: { icon: Footprints, label: 'A pie', color: 'text-green-600' },
                  ferry: { icon: Ship, label: 'Ferry', color: 'text-cyan-600' },
                  flight: { icon: Plane, label: 'Vuelo', color: 'text-purple-600' },
                };
                const modesFromSegments = modesInSegments.filter(m => m !== transportMode);
                const modesOnlyInAlts = extraModes.filter(m => !modesInSegments.includes(m));
                const notInPrefs = extraModes.filter(m => !availableTransportGroups.some(g => g.value === m));
                return (
                  <div className={`rounded-lg border p-2.5 text-xs space-y-1.5 ${notInPrefs.length > 0 ? 'border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20' : 'border-border bg-muted/30'}`}>
                    <p className="font-medium text-foreground flex items-center gap-1.5">
                      <RouteIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      Medios de transporte en esta ruta:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {/* Primary mode */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[11px] font-medium">
                        {(() => { const Icon = modeIcons[transportMode]?.icon || Car; return <Icon className="w-3 h-3" />; })()}
                        {modeIcons[transportMode]?.label || transportMode}
                      </span>
                      {/* Extra modes from primary segments */}
                      {modesFromSegments.map(mode => {
                        const meta = modeIcons[mode] || { icon: Car, label: mode };
                        const Icon = meta.icon;
                        return (
                          <span key={mode} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-400/60 bg-amber-100/50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        );
                      })}
                      {/* Modes only in alternatives */}
                      {modesOnlyInAlts.map(mode => {
                        const meta = modeIcons[mode] || { icon: Car, label: mode };
                        const Icon = meta.icon;
                        return (
                          <span key={mode} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-300/60 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 text-[11px] font-medium">
                            <Icon className="w-3 h-3" />
                            {meta.label}
                            <span className="text-[9px] opacity-70">(alt.)</span>
                          </span>
                        );
                      })}
                    </div>
                    {notInPrefs.length > 0 && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        ⚠ {notInPrefs.map(m => modeIcons[m]?.label || m).join(', ')} no está en tus preferencias de transporte
                      </p>
                    )}
                    {modesOnlyInAlts.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Hay alternativas con {modesOnlyInAlts.map(m => modeIcons[m]?.label || m).join(' y ')} disponibles más abajo
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Multi-segment breakdown */}
              {routeResult && routeResult.segments?.length > 0 && (
                <>
                  <SegmentBreakdown
                    segments={routeResult.segments}
                    totalDistance={routeResult.totalDistance}
                    totalDuration={routeResult.totalDuration}
                    originName={origin?.name}
                    destinationName={destination?.name}
                    originCoords={origin ? { latitude: origin.latitude, longitude: origin.longitude } : undefined}
                    destinationCoords={destination ? { latitude: destination.latitude, longitude: destination.longitude } : undefined}
                    resolvedFlightLegs={resolvedFlightLegs}
                    resolvedDestAirport={resolvedDestAirport}
                    plannerMinHours={engineConfig.segmentPlannerMinHours}
                    plannerMaxHours={engineConfig.segmentPlannerMaxHours}
                    stopsMinKm={engineConfig.segmentStopsMinKm}
                    stopsMaxKm={engineConfig.segmentStopsMaxKm}
                    onSegmentAction={(action, endpoints) => {
                      setActiveSegmentAction({ action, endpoints });
                    }}
                  />

                  {/* Per-segment AI panels */}
                  {activeSegmentAction && (
                    <div className="space-y-1.5 ml-8 p-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300">
                          Tramo: {activeSegmentAction.endpoints.from.name} → {activeSegmentAction.endpoints.to.name}
                        </span>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setActiveSegmentAction(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>

                      {activeSegmentAction.action === 'advisor' && (
                        <AIRouteAdvisor
                          origin={{ name: activeSegmentAction.endpoints.from.name, latitude: activeSegmentAction.endpoints.from.latitude, longitude: activeSegmentAction.endpoints.from.longitude }}
                          destination={{ name: activeSegmentAction.endpoints.to.name, latitude: activeSegmentAction.endpoints.to.latitude, longitude: activeSegmentAction.endpoints.to.longitude }}
                          currentTransportMode={activeSegmentAction.endpoints.transportMode}
                          travelProfile={priorityRanking.length > 0 ? 'custom' : 'balanced'}
                          availableModes={availableTransportGroups.flatMap(g => g.codes)}
                          priorityRanking={priorityRanking}
                          suppressPreview={true}
                        />
                      )}

                      {activeSegmentAction.action === 'planner' && (
                        <JourneyPlanner
                          origin={{ name: activeSegmentAction.endpoints.from.name, latitude: activeSegmentAction.endpoints.from.latitude, longitude: activeSegmentAction.endpoints.from.longitude }}
                          destination={{ name: activeSegmentAction.endpoints.to.name, latitude: activeSegmentAction.endpoints.to.latitude, longitude: activeSegmentAction.endpoints.to.longitude }}
                          totalDistanceKm={activeSegmentAction.endpoints.distanceKm}
                          totalDurationHours={activeSegmentAction.endpoints.durationHours}
                          transportMode={activeSegmentAction.endpoints.transportMode}
                          travelProfile={priorityRanking.length > 0 ? 'custom' : 'balanced'}
                          plannerMinHours={engineConfig.segmentPlannerMinHours}
                          plannerMaxHours={engineConfig.segmentPlannerMaxHours}
                        />
                      )}

                      {activeSegmentAction.action === 'stops' && (
                        <SuggestedStops
                          origin={{ name: activeSegmentAction.endpoints.from.name, latitude: activeSegmentAction.endpoints.from.latitude, longitude: activeSegmentAction.endpoints.from.longitude }}
                          destination={{ name: activeSegmentAction.endpoints.to.name, latitude: activeSegmentAction.endpoints.to.latitude, longitude: activeSegmentAction.endpoints.to.longitude }}
                          totalDistanceKm={activeSegmentAction.endpoints.distanceKm}
                          transportMode={activeSegmentAction.endpoints.transportMode}
                          travelProfile={priorityRanking.length > 0 ? 'custom' : 'balanced'}
                          existingWaypoints={intermediateStops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
                          stopsMinKm={engineConfig.segmentStopsMinKm}
                          stopsMaxKm={engineConfig.segmentStopsMaxKm}
                          onAcceptStop={(stop) => setIntermediateStops(prev => [...prev, stop])}
                          onRemoveStop={(stop) => setIntermediateStops(prev => prev.filter(s => s.name !== stop.name || s.lat !== stop.lat))}
                        />
                      )}
                    </div>
                  )}

                  {/* Accept route button — when multiple transport modes detected */}
                  {(() => {
                    const uniqueModes = [...new Set(routeResult.segments.map((s: any) => s.transportMode as string))];
                    const isMultiModal = uniqueModes.length > 1;
                    if (!isMultiModal) return null;
                    if (routeAccepted) {
                      return (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            Ruta aceptada — {routeResult.segments.length} tramos con {uniqueModes.map(m => {
                              const labels: Record<string, string> = { driving: 'Coche', walking: 'A pie', ferry: 'Ferry', flight: 'Vuelo' };
                              return labels[m] || m;
                            }).join(' + ')}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-9 text-xs gap-2 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 font-medium"
                        onClick={() => {
                          setRouteAccepted(true);
                          toast.success(`Ruta aceptada con ${routeResult.segments.length} tramos`);
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Aceptar ruta propuesta ({routeResult.segments.length} tramos: {uniqueModes.map(m => {
                          const labels: Record<string, string> = { driving: 'Coche', walking: 'A pie', ferry: 'Ferry', flight: 'Vuelo' };
                          return labels[m] || m;
                        }).join(' + ')})
                      </Button>
                    );
                  })()}

                  {routeResult.segments.some((s: any) => s.transportMode === 'flight') && (
                    <FlightSegmentDetails
                      segments={routeResult.segments}
                      onFlightLegsResolved={(legs, destAirport) => {
                        setResolvedFlightLegs(legs);
                        if (destAirport) setResolvedDestAirport(destAirport);
                      }}
                    />
                  )}
                  {/* Route alternatives panel (ferry, flight, etc.) */}
                  {(routeAlternatives.length > 0 || calculatingAlternatives) && !routeImpossible && (
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1.5 overflow-hidden">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Alternativas disponibles — pasa el cursor para previsualizar:
                      </p>
                      {routeAlternatives.map(alt => (
                        <button
                          key={alt.label}
                          onClick={() => handleSwitchMode(alt.mode as 'flight' | 'ferry', alt.label)}
                          onMouseEnter={() => { setHoveredAlternativeLabel(alt.label); window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: alt.label } })); }}
                          onMouseLeave={() => { setHoveredAlternativeLabel(null); window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: null } })); }}
                          className={`w-full min-w-0 flex items-center gap-2 rounded-lg border p-2 text-left transition-all ${
                            hoveredAlternativeLabel === alt.label
                              ? 'border-primary/50 bg-muted/70 shadow-sm'
                              : 'border-border/60 bg-card hover:bg-muted/50 hover:border-primary/40'
                          }`}
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: alt.color }} />
                          {alt.mode === 'flight' ? <Plane className="w-3.5 h-3.5 text-purple-600 shrink-0" /> : <Ship className="w-3.5 h-3.5 text-cyan-600 shrink-0" />}
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">{alt.label}</span>
                          {alt.result?.totalDistance && (
                            <span className="shrink-0 pl-1 text-[10px] text-muted-foreground whitespace-nowrap">
                              {formatDistance(alt.result.totalDistance)} · {formatDuration(alt.result.totalDuration)}
                            </span>
                          )}
                        </button>
                      ))}
                      {calculatingAlternatives && (
                        <div className="flex items-center gap-2 py-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">Buscando alternativas…</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* AI Route Advisor */}
              {(routeResult || routeImpossible) && origin && destination && (
                <AIRouteAdvisor
                  origin={origin}
                  destination={destination}
                  currentTransportMode={transportMode}
                  travelProfile={priorityRanking.length > 0 ? 'custom' : 'balanced'}
                  availableModes={availableTransportGroups.flatMap(g => g.codes)}
                  priorityRanking={priorityRanking}
                  hasSeaCrossing={!!routeImpossible || routeResult?.segments?.some((s: any) => s.transportMode === 'ferry')}
                  suppressPreview={routeAlternatives.length > 0 || !!routeResult}
                  onSwitchMode={(mode) => {
                    const group = CODE_TO_GROUP[mode];
                    if (group) {
                      setTransportMode(group);
                      setRouteResult(null);
                    }
                  }}
                />
              )}

              {/* Journey Planner (day-by-day for long trips) */}
              {routeResult && origin && destination && (
                <JourneyPlanner
                  origin={origin}
                  destination={destination}
                  totalDistanceKm={routeResult.totalDistance / 1000}
                  totalDurationHours={routeResult.totalDuration / 3600}
                  transportMode={transportMode}
                  travelProfile={priorityRanking.length > 0 ? 'custom' : 'balanced'}
                />
              )}

              {/* Suggested Stops (intermediate POIs) */}
              {routeResult && origin && destination && (
                <SuggestedStops
                  origin={origin}
                  destination={destination}
                  totalDistanceKm={routeResult.totalDistance / 1000}
                  transportMode={transportMode}
                  travelProfile={priorityRanking.length > 0 ? 'custom' : 'balanced'}
                  existingWaypoints={intermediateStops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
                  onAcceptStop={(stop) => {
                    setIntermediateStops(prev => [...prev, stop]);
                  }}
                  onRemoveStop={(stop) => {
                    setIntermediateStops(prev => prev.filter(s => s.name !== stop.name || s.lat !== stop.lat));
                  }}
                />
              )}

              {/* Accepted intermediate stops summary */}
              {intermediateStops.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Paradas intermedias ({intermediateStops.length})</p>
                    {intermediateStops.length >= 2 && origin && destination && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] gap-1 text-primary hover:text-primary"
                        disabled={optimizingOrder}
                        onClick={async () => {
                          setOptimizingOrder(true);
                          try {
                            const { data, error } = await supabase.functions.invoke('optimize-stop-order', {
                              body: {
                                origin: { name: origin.name, latitude: origin.latitude, longitude: origin.longitude },
                                destination: { name: destination.name, latitude: destination.latitude, longitude: destination.longitude },
                                stops: intermediateStops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng })),
                                transportMode,
                                travelProfile: priorityRanking.length > 0 ? 'custom' : 'balanced',
                              },
                            });
                            if (error) throw error;
                            if (data?.wasAlreadyOptimal) {
                              toast.success('El orden actual ya es óptimo');
                            } else if (data?.optimizedOrder) {
                              const reordered = data.optimizedOrder.map((i: number) => intermediateStops[i]).filter(Boolean);
                              setIntermediateStops(reordered);
                              toast.success(data.explanation || `Orden optimizado (~${data.estimatedSavingsPercent || 0}% menos distancia)`);
                            }
                          } catch (e) {
                            console.error('Optimize error:', e);
                            toast.error('Error al optimizar el orden');
                          } finally {
                            setOptimizingOrder(false);
                          }
                        }}
                      >
                        {optimizingOrder ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                        Optimizar orden
                      </Button>
                    )}
                  </div>
                  {intermediateStops.map((stop, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <span className="text-[11px] font-medium truncate flex-1">{stop.name}</span>
                      <button
                        className="p-0.5 text-muted-foreground hover:text-red-500"
                        onClick={() => setIntermediateStops(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Simple connector when no result yet */}
              {!routeResult && !routeImpossible && (
                <div className="flex items-center gap-2">
                  <div className="w-6 flex justify-center">
                    <div className="w-0.5 h-6 bg-border" />
                  </div>
                </div>
              )}

              {/* Route impossible + alternatives */}
              {routeImpossible && (
                <div className={`rounded-lg border-2 p-3 space-y-2 ${
                  routeAlternatives.length > 0
                    ? 'border-sky-300 dark:border-sky-700 bg-sky-50/80 dark:bg-sky-950/30'
                    : 'border-amber-400 dark:border-amber-600 bg-amber-50/80 dark:bg-amber-950/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    <p className={`text-xs font-medium ${
                      routeAlternatives.length > 0
                        ? 'text-sky-800 dark:text-sky-300'
                        : 'text-amber-800 dark:text-amber-300'
                    }`}>
                      {routeAlternatives.length > 0
                        ? `Cruce marítimo detectado (${routeImpossible.directDistanceKm} km) — selecciona una alternativa:`
                        : routeImpossible.reason === 'ocean_or_continent_crossing'
                          ? `No es posible llegar en ${transportMode === 'driving' ? 'coche' : 'a pie'} — hay un océano o mar de por medio (${routeImpossible.directDistanceKm} km)`
                          : `No se encontró ruta terrestre (${routeImpossible.directDistanceKm} km)`
                      }
                    </p>
                  </div>

                  {calculatingAlternatives && (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Calculando alternativas...</span>
                    </div>
                  )}

                  {routeAlternatives.length > 0 && (
                    <div className="space-y-1.5 overflow-hidden">
                      {routeAlternatives.map(alt => (
                        <button
                          key={alt.label}
                          onClick={() => handleSwitchMode(alt.mode as 'flight' | 'ferry', alt.label)}
                          onMouseEnter={() => { setHoveredAlternativeLabel(alt.label); window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: alt.label } })); }}
                          onMouseLeave={() => { setHoveredAlternativeLabel(null); window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: null } })); }}
                          className={`w-full min-w-0 flex items-center gap-2 rounded-lg border p-2 text-left transition-all ${
                            hoveredAlternativeLabel === alt.label
                              ? 'border-primary/50 bg-muted/70 shadow-sm'
                              : 'border-border/60 bg-card hover:bg-muted/50 hover:border-primary/40'
                          }`}
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: alt.color }} />
                          <div className="min-w-0 flex flex-1 items-center gap-1.5">
                            {alt.mode === 'flight' ? <Plane className="w-3.5 h-3.5 text-purple-600 shrink-0" /> : <Ship className="w-3.5 h-3.5 text-cyan-600 shrink-0" />}
                            <span className="truncate text-xs font-medium">{alt.label}</span>
                          </div>
                          <span className="shrink-0 pl-1 text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatDistance(alt.result.totalDistance)} · {formatDuration(alt.result.totalDuration)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!calculatingAlternatives && routeAlternatives.length === 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-amber-700 dark:text-amber-400">Cambia el modo de transporte:</p>
                      <div className="flex gap-1.5">
                        {routeImpossible.suggestedModes.includes('flight') && (
                          <Button variant="outline" size="sm"
                            className="h-7 text-xs gap-1.5 border-purple-300 bg-purple-50 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-950 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300"
                            onClick={() => handleSwitchMode('flight')}>
                            <Plane className="w-3.5 h-3.5" /> Vuelo
                          </Button>
                        )}
                        {routeImpossible.suggestedModes.includes('ferry') && (
                          <Button variant="outline" size="sm"
                            className="h-7 text-xs gap-1.5 border-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950 dark:hover:bg-cyan-900 text-cyan-700 dark:text-cyan-300"
                            onClick={() => handleSwitchMode('ferry')}>
                            <Ship className="w-3.5 h-3.5" /> Ferry
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Destination */}
          <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${
            destination ? 'bg-muted/30 border-border/40' : 'border-2 border-dashed border-destructive/40 bg-destructive/5'
          }`}>
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold shrink-0">B</div>
            {destination ? (
              <>
                <span className="text-xs font-medium truncate flex-1">{destination.name}</span>
                <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => openPicker('destination')}>
                  <Pencil className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground flex-1">Punto de destino</span>
                <div className="flex gap-1">
                  {homeLocation && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => { const wp = createWaypointFromHome(); if (wp) { setDestination(wp); setRouteResult(null); } }}>
                      <Home className="w-3.5 h-3.5" /> Casa
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openPicker('destination')}>
                    <MapPin className="w-3.5 h-3.5" /> Elegir
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Empty state */}
          {!origin && !destination && (
            <div className="text-center py-6 text-muted-foreground">
              <Navigation className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Define origen y destino</p>
              <p className="text-[10px]">Selecciona los puntos A y B de tu itinerario</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Location picker */}
      <AnimatePresence>
        {showPicker && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-border overflow-hidden">
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {pickerTarget === 'origin' ? 'Punto de origen' : 'Punto de destino'}
                </span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowPicker(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <div className="relative">
                <Input placeholder="Buscar lugar, dirección o ubicación..." value={searchQuery}
                  onChange={(e) => handlePickerSearch(e.target.value)} className="text-sm pr-8" autoFocus />
                {searchingGeo && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-2.5 text-muted-foreground" />}
              </div>
              <ScrollArea className="h-52">
                <div className="space-y-0.5">
                  {filteredLocations.length > 0 && (
                    <>
                      <p className="text-[10px] font-medium text-muted-foreground px-2 pt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Mis ubicaciones
                      </p>
                      {filteredLocations.map(loc => (
                        <button key={loc.id} className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left text-sm"
                          onClick={() => handlePickLocation(createWaypointFromLocation(loc))}>
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{loc.name}</p>
                            <p className="text-[10px] text-muted-foreground">{loc.coordinates.lat.toFixed(4)}, {loc.coordinates.lng.toFixed(4)}</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}

                  {geoResults.length > 0 && (
                    <>
                      {filteredLocations.length > 0 && <Separator className="my-1" />}
                      <p className="text-[10px] font-medium text-muted-foreground px-2 pt-1 flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Lugares generales
                      </p>
                      {geoResults.map((result, index) => (
                        <button key={`geo-${index}`} className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left text-sm"
                          onClick={() => handlePickLocation(createWaypointFromGeo(result))}>
                          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{result.shortName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{result.displayName}</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}

                  {filteredLocations.length === 0 && geoResults.length === 0 && !searchingGeo && searchQuery.trim().length >= 3 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No se encontraron resultados</p>
                  )}
                  {!searchQuery.trim() && filteredLocations.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Escribe para buscar lugares</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        {routeResult && (
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1">
              <RouteIcon className="w-3.5 h-3.5" />
              <span>{formatDistance(routeResult.totalDistance)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDuration(routeResult.totalDuration)}</span>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => {
              const isMultiModal = routeResult && [...new Set(routeResult.segments?.map((s: any) => s.transportMode))].length > 1;
              const needsAcceptance = isMultiModal && !routeAccepted;
              const missingName = !routeName.trim();
              const issues: string[] = [];
              if (missingName) issues.push('nombre del itinerario');
              if (!origin) issues.push('punto de origen');
              if (!destination) issues.push('punto de destino');
              if (needsAcceptance) issues.push('aceptar la ruta propuesta');
              if (issues.length > 0) {
                toast.error(`Falta: ${issues.join(', ')}`);
                return;
              }
              handleSave();
            }}
              disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              {editRouteId ? 'Actualizar' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
