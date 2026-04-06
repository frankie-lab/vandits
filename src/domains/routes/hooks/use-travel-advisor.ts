// Types kept for backward compatibility (used by UserProfileEditor, etc.)

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
