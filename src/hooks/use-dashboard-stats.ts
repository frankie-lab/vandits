import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export interface DashboardStats {
  total_locations: number;
  enriched_locations: number;
  pending_locations: number;
  countries_count: number;
  continents_count: number;
  regions_count: number;
  geo_distribution: Record<string, Record<string, number>>;
  classification_distribution: Record<string, number>;
  total_routes: number;
  completed_routes: number;
  total_distance_km: number;
  total_duration_hours: number;
  transport_mode_distribution: Record<string, number>;
  followers_count: number;
  following_count: number;
  public_locations_count: number;
  top_rated_locations: Array<{
    id: string;
    name: string;
    country: string | null;
    rating: number;
    categoria: string | null;
  }>;
  recent_activity: Array<{
    id: string;
    name: string;
    country: string | null;
    created_at: string;
    enriched: boolean;
  }>;
  monthly_activity: Array<{
    month: string;
    locations_added: number;
  }>;
  duplicate_candidates: number;
  computed_at: string;
}

export function useDashboardStats() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: async (): Promise<DashboardStats | null> => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('user_stats_cache')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as unknown as DashboardStats | null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('No user');
      const { error } = await supabase.rpc('refresh_user_stats', { _user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isRefreshing: refreshMutation.isPending,
    refresh: refreshMutation.mutate,
    error: query.error,
  };
}
