import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useRoutes, RouteWaypoint } from '@/hooks/use-routes';
import {
  EngineConfig,
  DEFAULT_ENGINE_CONFIG,
  CalculationResult,
  RouteResult,
  RouteAlternative,
  RouteImpossible,
  parseApiResponse,
  buildMapSegments,
  extractFlightLabel,
  extractPortNames,
  getRouteColor,
  TRANSPORT_CODE_TO_ROUTE_MODE,
  MapSegment,
} from '@/lib/route-engine';

export interface UseRouteCalculationOptions {
  onMapSegmentsChange?: (segments: MapSegment[]) => void;
}

export function useRouteCalculation(opts?: UseRouteCalculationOptions) {
  const { user } = useAuth();
  const { calculateRoute, calculating } = useRoutes();

  // Engine config (persisted to route_preferences in routes table)
  const [engineConfig, setEngineConfig] = useState<EngineConfig>({ ...DEFAULT_ENGINE_CONFIG });

  // Calculation state
  const [primary, setPrimary] = useState<RouteResult | null>(null);
  const [alternatives, setAlternatives] = useState<RouteAlternative[]>([]);
  const [impossible, setImpossible] = useState<RouteImpossible | null>(null);
  const [calculatingAlternatives, setCalculatingAlternatives] = useState(false);
  const [resolvedFlightLegs, setResolvedFlightLegs] = useState<any[] | null>(null);
  const [resolvedDestAirport, setResolvedDestAirport] = useState<any | null>(null);

  // Available transport modes (filtered by user profile)
  const [availableModes, setAvailableModes] = useState<string[]>(['walking', 'driving']);
  const [userPrefsLoaded, setUserPrefsLoaded] = useState(false);

  // Load user preferences once
  useEffect(() => {
    if (!user) return;

    // Load priority ranking → auto-set road preference
    supabase.from('profiles')
      .select('priority_ranking')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.priority_ranking) {
          const ranking = data.priority_ranking as string[];
          if (Array.isArray(ranking) && ranking.length > 0) {
            const scenicIdx = ranking.indexOf('scenic');
            const timeIdx = ranking.indexOf('time');
            if (scenicIdx !== -1 && timeIdx !== -1 && scenicIdx < timeIdx) {
              setEngineConfig(prev => ({ ...prev, roadPreference: 'scenic' }));
            }
          }
        }
      });

    // Load user transport modes
    supabase.from('user_transport_modes')
      .select('transport_mode_code, is_available')
      .eq('user_id', user.id)
      .eq('is_available', true)
      .then(({ data: userModes }) => {
        if (userModes && userModes.length > 0) {
          const availableCodes = new Set(userModes.map(m => m.transport_mode_code));
          const routeModes = new Set<string>();
          for (const code of availableCodes) {
            const mapped = TRANSPORT_CODE_TO_ROUTE_MODE[code];
            if (mapped) routeModes.add(mapped);
          }
          if (routeModes.size > 0) {
            setAvailableModes(Array.from(routeModes));
            // Auto-select first available if current not available
            setEngineConfig(prev => {
              if (!routeModes.has(prev.transportMode)) {
                return { ...prev, transportMode: Array.from(routeModes)[0] as 'walking' | 'driving' };
              }
              return prev;
            });
          }
        }
        setUserPrefsLoaded(true);
      });
  }, [user]);

  // Calculate primary route
  const calculate = useCallback(async (
    origin: RouteWaypoint,
    destination: RouteWaypoint,
  ): Promise<CalculationResult> => {
    setResolvedFlightLegs(null);
    setResolvedDestAirport(null);
    setAlternatives([]);
    setImpossible(null);

    const result = await calculateRoute(
      origin,
      destination,
      engineConfig.transportMode,
      engineConfig.roadPreference,
    );

    if (!result) {
      const empty: CalculationResult = { primary: null, alternatives: [], impossible: null };
      setPrimary(null);
      return empty;
    }

    const parsed = parseApiResponse(result);
    setPrimary(parsed.primary);
    setAlternatives(parsed.alternatives);
    setImpossible(parsed.impossible);

    return parsed;
  }, [calculateRoute, engineConfig.transportMode, engineConfig.roadPreference]);

  // Calculate fallback alternatives when route is impossible
  const calculateFallbackAlternatives = useCallback(async (
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    suggestedModes: string[],
  ) => {
    if (suggestedModes.length === 0) return;
    setCalculatingAlternatives(true);

    const results = await Promise.all(
      suggestedModes.map(async (mode) => {
        const result = await calculateRoute(origin, destination, mode, engineConfig.roadPreference);
        if (!result || (result as any).routeImpossible) return null;
        if (!result.segments || result.segments.length === 0) return null;

        return {
          mode,
          label: mode === 'flight'
            ? extractFlightLabel(result)
            : `⛴ ${extractPortNames(result)}`,
          color: mode === 'flight' ? '#9333ea' : '#0891b2',
          result: { segments: result.segments, totalDistance: result.totalDistance, totalDuration: result.totalDuration },
        } as RouteAlternative;
      })
    );

    const valid = results.filter(Boolean) as RouteAlternative[];
    setAlternatives(valid);
    setCalculatingAlternatives(false);
  }, [calculateRoute, engineConfig.roadPreference]);

  // Switch to an alternative
  const switchToAlternative = useCallback((mode: 'flight' | 'ferry', label?: string) => {
    const alt = label
      ? alternatives.find(a => a.label === label)
      : alternatives.find(a => a.mode === mode);

    if (alt?.result) {
      setPrimary(alt.result);
      setImpossible(null);
      setAlternatives([]);
      setResolvedFlightLegs(null);
      setResolvedDestAirport(null);
    }
  }, [alternatives]);

  // Resolve flight legs (from Duffel)
  const resolveFlightLegs = useCallback((legs: any[], destAirport?: any) => {
    setResolvedFlightLegs(legs);
    if (destAirport) setResolvedDestAirport(destAirport);
  }, []);

  // Build map segments whenever state changes
  useEffect(() => {
    const segments = buildMapSegments(primary, alternatives, resolvedFlightLegs);
    opts?.onMapSegmentsChange?.(segments);
  }, [primary, alternatives, resolvedFlightLegs]);

  // Reset
  const reset = useCallback(() => {
    setPrimary(null);
    setAlternatives([]);
    setImpossible(null);
    setResolvedFlightLegs(null);
    setResolvedDestAirport(null);
    setCalculatingAlternatives(false);
  }, []);

  // Update config
  const updateConfig = useCallback((partial: Partial<EngineConfig>) => {
    setEngineConfig(prev => ({ ...prev, ...partial }));
  }, []);

  return {
    // Config
    engineConfig,
    updateConfig,
    availableModes,
    userPrefsLoaded,

    // State
    primary,
    alternatives,
    impossible,
    calculating,
    calculatingAlternatives,
    resolvedFlightLegs,
    resolvedDestAirport,

    // Actions
    calculate,
    calculateFallbackAlternatives,
    switchToAlternative,
    resolveFlightLegs,
    reset,
  };
}
