import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

export type RouteStopType = 'overnight' | 'port' | 'airport' | 'refuel' | 'rest' | 'scenic' | 'custom';

export interface RouteStop {
  id: string;
  routeId: string;
  position: number;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  stopType: RouteStopType;
  icon?: string;
  arrivalEstimate?: string;
  departureEstimate?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface RouteDayStage {
  id: string;
  routeId: string;
  dayNumber: number;
  name: string;
  description?: string;
  startLatitude: number;
  startLongitude: number;
  startName: string;
  endLatitude: number;
  endLongitude: number;
  endName: string;
  distanceMeters?: number;
  durationSeconds?: number;
  overnightStopId?: string;
  createdAt: string;
  updatedAt: string;
}

const STOP_TYPE_ICONS: Record<RouteStopType, string> = {
  overnight: '🏨',
  port: '⚓',
  airport: '✈️',
  refuel: '⛽',
  rest: '☕',
  scenic: '📸',
  custom: '📍',
};

export function getStopIcon(type: RouteStopType, customIcon?: string): string {
  return customIcon || STOP_TYPE_ICONS[type] || '📍';
}

export function getStopColor(type: RouteStopType): string {
  const colors: Record<RouteStopType, string> = {
    overnight: '#f59e0b',
    port: '#0891b2',
    airport: '#9333ea',
    refuel: '#ef4444',
    rest: '#22c55e',
    scenic: '#ec4899',
    custom: '#6b7280',
  };
  return colors[type] || '#6b7280';
}

export function useRouteStops() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const loadStops = useCallback(async (routeId: string): Promise<RouteStop[]> => {
    try {
      const { data, error } = await supabase
        .from('route_stops')
        .select('*')
        .eq('route_id', routeId)
        .order('position', { ascending: true });

      if (error) throw error;

      return (data || []).map(s => ({
        id: s.id,
        routeId: s.route_id,
        position: s.position,
        name: s.name,
        description: s.description || undefined,
        latitude: s.latitude,
        longitude: s.longitude,
        stopType: s.stop_type as RouteStopType,
        icon: s.icon || undefined,
        arrivalEstimate: s.arrival_estimate || undefined,
        departureEstimate: s.departure_estimate || undefined,
        metadata: (s.metadata as Record<string, any>) || undefined,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }));
    } catch (e: any) {
      console.error('Error loading stops:', e);
      return [];
    }
  }, []);

  const loadDayStages = useCallback(async (routeId: string): Promise<RouteDayStage[]> => {
    try {
      const { data, error } = await supabase
        .from('route_day_stages')
        .select('*')
        .eq('route_id', routeId)
        .order('day_number', { ascending: true });

      if (error) throw error;

      return (data || []).map(d => ({
        id: d.id,
        routeId: d.route_id,
        dayNumber: d.day_number,
        name: d.name,
        description: d.description || undefined,
        startLatitude: d.start_latitude,
        startLongitude: d.start_longitude,
        startName: d.start_name,
        endLatitude: d.end_latitude,
        endLongitude: d.end_longitude,
        endName: d.end_name,
        distanceMeters: d.distance_meters || undefined,
        durationSeconds: d.duration_seconds || undefined,
        overnightStopId: d.overnight_stop_id || undefined,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    } catch (e: any) {
      console.error('Error loading day stages:', e);
      return [];
    }
  }, []);

  const saveStops = useCallback(async (routeId: string, stops: Omit<RouteStop, 'id' | 'routeId' | 'createdAt' | 'updatedAt'>[]): Promise<boolean> => {
    if (!user) return false;
    setLoading(true);
    try {
      // Delete existing stops
      await supabase.from('route_stops').delete().eq('route_id', routeId);

      if (stops.length === 0) {
        setLoading(false);
        return true;
      }

      const inserts = stops.map((s, idx) => ({
        route_id: routeId,
        position: s.position ?? idx,
        name: s.name,
        description: s.description || null,
        latitude: s.latitude,
        longitude: s.longitude,
        stop_type: s.stopType as any,
        icon: s.icon || null,
        arrival_estimate: s.arrivalEstimate || null,
        departure_estimate: s.departureEstimate || null,
        metadata: s.metadata || {},
      }));

      const { error } = await supabase.from('route_stops').insert(inserts);
      if (error) throw error;

      return true;
    } catch (e: any) {
      toast.error('Error al guardar paradas: ' + e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const saveDayStages = useCallback(async (routeId: string, stages: Omit<RouteDayStage, 'id' | 'routeId' | 'createdAt' | 'updatedAt'>[]): Promise<boolean> => {
    if (!user) return false;
    setLoading(true);
    try {
      await supabase.from('route_day_stages').delete().eq('route_id', routeId);

      if (stages.length === 0) {
        setLoading(false);
        return true;
      }

      const inserts = stages.map(s => ({
        route_id: routeId,
        day_number: s.dayNumber,
        name: s.name,
        description: s.description || null,
        start_latitude: s.startLatitude,
        start_longitude: s.startLongitude,
        start_name: s.startName,
        end_latitude: s.endLatitude,
        end_longitude: s.endLongitude,
        end_name: s.endName,
        distance_meters: s.distanceMeters || null,
        duration_seconds: s.durationSeconds || null,
        overnight_stop_id: s.overnightStopId || null,
      }));

      const { error } = await supabase.from('route_day_stages').insert(inserts);
      if (error) throw error;

      return true;
    } catch (e: any) {
      toast.error('Error al guardar jornadas: ' + e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const addStop = useCallback(async (routeId: string, stop: Omit<RouteStop, 'id' | 'routeId' | 'createdAt' | 'updatedAt'>): Promise<string | null> => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from('route_stops')
        .insert({
          route_id: routeId,
          position: stop.position,
          name: stop.name,
          description: stop.description || null,
          latitude: stop.latitude,
          longitude: stop.longitude,
          stop_type: stop.stopType as any,
          icon: stop.icon || null,
          arrival_estimate: stop.arrivalEstimate || null,
          departure_estimate: stop.departureEstimate || null,
          metadata: stop.metadata || {},
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    } catch (e: any) {
      toast.error('Error al añadir parada: ' + e.message);
      return null;
    }
  }, [user]);

  const deleteStop = useCallback(async (stopId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('route_stops').delete().eq('id', stopId);
      if (error) throw error;
      return true;
    } catch (e: any) {
      toast.error('Error al eliminar parada: ' + e.message);
      return false;
    }
  }, []);

  const updateStop = useCallback(async (stopId: string, updates: Partial<Omit<RouteStop, 'id' | 'routeId' | 'createdAt' | 'updatedAt'>>): Promise<boolean> => {
    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
      if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;
      if (updates.stopType !== undefined) dbUpdates.stop_type = updates.stopType;
      if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
      if (updates.position !== undefined) dbUpdates.position = updates.position;
      if (updates.arrivalEstimate !== undefined) dbUpdates.arrival_estimate = updates.arrivalEstimate;
      if (updates.departureEstimate !== undefined) dbUpdates.departure_estimate = updates.departureEstimate;
      if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;

      const { error } = await supabase.from('route_stops').update(dbUpdates).eq('id', stopId);
      if (error) throw error;
      return true;
    } catch (e: any) {
      toast.error('Error al actualizar parada: ' + e.message);
      return false;
    }
  }, []);

  return {
    loading,
    loadStops,
    loadDayStages,
    saveStops,
    saveDayStages,
    addStop,
    deleteStop,
    updateStop,
    getStopIcon,
    getStopColor,
  };
}
