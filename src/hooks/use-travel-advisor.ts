import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TransportModeRef {
  code: string;
  name: string;
  icon: string;
  category: string;
  avg_speed_kmh: number;
  cost_per_km: number;
  base_cost: number;
  setup_time_minutes: number;
  overhead_minutes: number;
  score_comfort: number;
  score_flexibility: number;
  score_autonomy: number;
  score_risk: number;
  score_cargo: number;
  score_scenic: number;
  score_restrictions: number;
  score_load_capacity: number;
  max_range_km: number | null;
  is_motorized: boolean;
  requires_schedule: boolean;
  requires_booking: boolean;
  allows_cargo: boolean;
  supports_sleep: boolean;
}

export interface TravelProfile {
  code: string;
  name: string;
  icon: string;
  description: string;
  weight_cost: number;
  weight_time: number;
  weight_flexibility: number;
  weight_autonomy: number;
  weight_comfort: number;
  weight_risk: number;
  weight_scenic: number;
  weight_load: number;
  weight_restrictions: number;
}

export interface ScoringWeights {
  cost: number;
  time: number;
  flexibility: number;
  autonomy: number;
  comfort: number;
  risk: number;
  scenic: number;
  load: number;
  restrictions: number;
}

export interface CostBreakdownItem {
  category_code: string;
  category_name: string;
  category_icon: string;
  cost_per_km: number;
  base_cost: number;
  total: number;
}

export interface SegmentAnalysis {
  from: string;
  to: string;
  distance_km: number;
  mode: TransportModeRef;
  estimated_cost: number;
  cost_breakdown: CostBreakdownItem[];
  estimated_time_hours: number;
  setup_time_hours: number;
  overhead_hours: number;
}

export interface RouteAlternative {
  id: string;
  name: string;
  segments: SegmentAnalysis[];
  total_distance_km: number;
  total_cost: number;
  total_time_hours: number;
  cost_breakdown: CostBreakdownItem[];
  scores: {
    cost: number;
    time: number;
    flexibility: number;
    autonomy: number;
    comfort: number;
    risk: number;
    scenic: number;
    load: number;
    restrictions: number;
    overall: number;
  };
  modes_used: string[];
  warnings: string[];
}

export interface TravelAdvisorWaypoint {
  name: string;
  lat: number;
  lng: number;
}

export function useTravelAdvisor(initialProfile?: string) {
  const [profiles, setProfiles] = useState<TravelProfile[]>([]);
  const [alternatives, setAlternatives] = useState<RouteAlternative[]>([]);
  const [explanation, setExplanation] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>(initialProfile || 'adventure');
  const [customWeights, setCustomWeights] = useState<ScoringWeights>({
    cost: 1, time: 1, flexibility: 1, autonomy: 1, comfort: 1, risk: 1, scenic: 1, load: 1, restrictions: 1,
  });
  const [excludedModes, setExcludedModes] = useState<string[]>([]);
  const [userOwnedModes, setUserOwnedModes] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('travel_profiles')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (data) {
        const mapped = data.map(p => ({
          code: p.code,
          name: p.name,
          icon: p.icon,
          description: p.description || '',
          weight_cost: p.weight_cost,
          weight_time: p.weight_time,
          weight_flexibility: p.weight_flexibility,
          weight_autonomy: p.weight_autonomy,
          weight_comfort: p.weight_comfort,
          weight_risk: p.weight_risk,
          weight_scenic: p.weight_scenic,
          weight_load: (p as any).weight_load ?? 1,
          weight_restrictions: (p as any).weight_restrictions ?? 1,
        }));
        setProfiles(mapped);
        const profileCode = initialProfile || 'adventure';
        const match = mapped.find(p => p.code === profileCode);
        if (match) {
          setSelectedProfile(profileCode);
          setCustomWeights({
            cost: match.weight_cost,
            time: match.weight_time,
            flexibility: match.weight_flexibility,
            autonomy: match.weight_autonomy,
            comfort: match.weight_comfort,
            risk: match.weight_risk,
            scenic: match.weight_scenic,
            load: match.weight_load,
            restrictions: match.weight_restrictions,
          });
        }
      }
    })();
  }, [initialProfile]);

  const applyProfile = useCallback((profileCode: string) => {
    setSelectedProfile(profileCode);
    const profile = profiles.find(p => p.code === profileCode);
    if (profile) {
      setCustomWeights({
        cost: profile.weight_cost,
        time: profile.weight_time,
        flexibility: profile.weight_flexibility,
        autonomy: profile.weight_autonomy,
        comfort: profile.weight_comfort,
        risk: profile.weight_risk,
        scenic: profile.weight_scenic,
        load: profile.weight_load,
        restrictions: profile.weight_restrictions,
      });
    }
  }, [profiles]);

  const analyzeRoutes = useCallback(async (
    waypoints: TravelAdvisorWaypoint[],
    budgetMax?: number,
    timeMaxHours?: number,
    weightsOverride?: ScoringWeights,
  ) => {
    if (waypoints.length < 2) {
      toast.error('Se necesitan al menos origen y destino');
      return;
    }

    setLoading(true);
    setAlternatives([]);
    setExplanation('');

    const effectiveWeights = weightsOverride || customWeights;

    try {
      const { data, error } = await supabase.functions.invoke('score-routes', {
        body: {
          waypoints,
          weights: effectiveWeights,
          budget_max: budgetMax || undefined,
          time_max_hours: timeMaxHours || undefined,
          excluded_modes: excludedModes.length > 0 ? excludedModes : undefined,
          user_owned_modes: userOwnedModes.length > 0 ? userOwnedModes : undefined,
        },
      });

      if (error) throw error;
      setAlternatives(data.alternatives || []);

      if (data.alternatives?.length > 0) {
        toast.success(`${data.alternatives.length} alternativas encontradas`);
      } else {
        toast.info('No se encontraron alternativas viables con esas restricciones');
      }
    } catch (e: any) {
      toast.error('Error al analizar rutas: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [customWeights, excludedModes, userOwnedModes]);

  const getExplanation = useCallback(async (profileName?: string, waypointNames?: string[]) => {
    if (alternatives.length === 0) return;
    setExplaining(true);

    try {
      const { data, error } = await supabase.functions.invoke('explain-routes', {
        body: {
          alternatives: alternatives.slice(0, 5),
          profile_name: profileName || selectedProfile,
          waypoint_names: waypointNames,
        },
      });

      if (error) throw error;
      setExplanation(data.explanation || '');
    } catch (e: any) {
      toast.error('Error al generar análisis: ' + e.message);
    } finally {
      setExplaining(false);
    }
  }, [alternatives, selectedProfile]);

  return {
    profiles,
    alternatives,
    explanation,
    loading,
    explaining,
    selectedProfile,
    customWeights,
    excludedModes,
    userOwnedModes,
    setCustomWeights,
    setExcludedModes,
    setUserOwnedModes,
    applyProfile,
    analyzeRoutes,
    getExplanation,
  };
}
