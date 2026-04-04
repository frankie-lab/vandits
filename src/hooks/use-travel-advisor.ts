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
  score_comfort: number;
  score_flexibility: number;
  score_autonomy: number;
  score_risk: number;
  score_cargo: number;
  score_scenic: number;
  max_range_km: number | null;
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
}

export interface ScoringWeights {
  cost: number;
  time: number;
  flexibility: number;
  autonomy: number;
  comfort: number;
  risk: number;
  scenic: number;
}

export interface SegmentAnalysis {
  from: string;
  to: string;
  distance_km: number;
  mode: TransportModeRef;
  estimated_cost: number;
  estimated_time_hours: number;
  setup_time_hours: number;
}

export interface RouteAlternative {
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
    cost: 1, time: 1, flexibility: 1, autonomy: 1, comfort: 1, risk: 1, scenic: 1,
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('travel_profiles')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (data) {
        setProfiles(data.map(p => ({
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
        })));
      }
    })();
  }, []);

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
      });
    }
  }, [profiles]);

  const analyzeRoutes = useCallback(async (
    waypoints: TravelAdvisorWaypoint[],
    budgetMax?: number,
    timeMaxHours?: number,
  ) => {
    if (waypoints.length < 2) {
      toast.error('Se necesitan al menos origen y destino');
      return;
    }

    setLoading(true);
    setAlternatives([]);
    setExplanation('');

    try {
      const { data, error } = await supabase.functions.invoke('score-routes', {
        body: {
          waypoints,
          weights: customWeights,
          budget_max: budgetMax || undefined,
          time_max_hours: timeMaxHours || undefined,
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
  }, [customWeights]);

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
    setCustomWeights,
    applyProfile,
    analyzeRoutes,
    getExplanation,
  };
}
