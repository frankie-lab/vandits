import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

export interface RouteWaypoint {
  id?: string;
  locationId?: string;
  position: number;
  name: string;
  latitude: number;
  longitude: number;
  transportMode: 'walking' | 'driving' | 'flight' | 'ferry';
}

export interface Route {
  id: string;
  userId: string;
  name: string;
  description?: string;
  visibility: string;
  status: 'draft' | 'completed';
  transportMode: string;
  roadPreference: string;
  totalDistance?: number;
  totalDuration?: number;
  routeGeometry?: any;
  waypoints: RouteWaypoint[];
  createdAt: string;
  updatedAt: string;
}

export function useRoutes() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const loadRoutes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: routesData, error } = await supabase
        .from('routes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const routesWithWaypoints: Route[] = [];
      for (const r of routesData || []) {
        const { data: wps } = await supabase
          .from('route_waypoints')
          .select('*')
          .eq('route_id', r.id)
          .order('position', { ascending: true });

        routesWithWaypoints.push({
          id: r.id,
          userId: r.user_id,
          name: r.name,
          description: r.description || undefined,
          visibility: r.visibility,
          status: r.status as 'draft' | 'completed',
          transportMode: (r as any).transport_mode || 'driving',
          roadPreference: (r as any).road_preference || 'fastest',
          totalDistance: r.total_distance_meters || undefined,
          totalDuration: r.total_duration_seconds || undefined,
          routeGeometry: r.route_geometry || undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          waypoints: (wps || []).map(wp => ({
            id: wp.id,
            locationId: wp.location_id || undefined,
            position: wp.position,
            name: wp.name,
            latitude: wp.latitude,
            longitude: wp.longitude,
            transportMode: wp.transport_mode as RouteWaypoint['transportMode'],
          })),
        });
      }

      setRoutes(routesWithWaypoints);
    } catch (e: any) {
      console.error('Error loading routes:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const saveRoute = useCallback(async (
    name: string,
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    segments: any[],
    totalDistance: number,
    totalDuration: number,
    transportMode: string,
    roadPreference: string,
    description?: string,
  ): Promise<string | null> => {
    if (!user) return null;

    try {
      const allCoords: number[][] = [];
      for (const seg of segments) {
        if (seg.geometry?.coordinates) {
          allCoords.push(...seg.geometry.coordinates);
        }
      }

      const { data: route, error: routeError } = await supabase
        .from('routes')
        .insert({
          user_id: user.id,
          name,
          description: description || null,
          visibility: 'private',
          status: 'completed' as any,
          total_distance_meters: totalDistance,
          total_duration_seconds: totalDuration,
          route_geometry: { type: 'LineString', coordinates: allCoords },
          transport_mode: transportMode,
          road_preference: roadPreference,
        } as any)
        .select()
        .single();

      if (routeError) throw routeError;

      const waypointInserts = [origin, destination].map((wp, idx) => ({
        route_id: route.id,
        location_id: wp.locationId || null,
        position: idx,
        name: wp.name,
        latitude: wp.latitude,
        longitude: wp.longitude,
        transport_mode: wp.transportMode as any,
        segment_geometry: idx === 0 ? (segments[0]?.geometry || null) : null,
        segment_distance_meters: idx === 0 ? totalDistance : null,
        segment_duration_seconds: idx === 0 ? totalDuration : null,
      }));

      const { error: wpError } = await supabase
        .from('route_waypoints')
        .insert(waypointInserts);

      if (wpError) throw wpError;

      toast.success('Itinerario guardado correctamente');
      await loadRoutes();
      return route.id;
    } catch (e: any) {
      toast.error('Error al guardar: ' + e.message);
      return null;
    }
  }, [user, loadRoutes]);

  const updateRoute = useCallback(async (
    routeId: string,
    name: string,
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    segments: any[],
    totalDistance: number,
    totalDuration: number,
    transportMode: string,
    roadPreference: string,
    description?: string,
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const allCoords: number[][] = [];
      for (const seg of segments) {
        if (seg.geometry?.coordinates) {
          allCoords.push(...seg.geometry.coordinates);
        }
      }

      const { error: routeError } = await supabase
        .from('routes')
        .update({
          name,
          description: description || null,
          total_distance_meters: totalDistance,
          total_duration_seconds: totalDuration,
          route_geometry: { type: 'LineString', coordinates: allCoords },
          transport_mode: transportMode,
          road_preference: roadPreference,
        } as any)
        .eq('id', routeId)
        .eq('user_id', user.id);

      if (routeError) throw routeError;

      // Replace waypoints
      await supabase.from('route_waypoints').delete().eq('route_id', routeId);

      const waypointInserts = [origin, destination].map((wp, idx) => ({
        route_id: routeId,
        location_id: wp.locationId || null,
        position: idx,
        name: wp.name,
        latitude: wp.latitude,
        longitude: wp.longitude,
        transport_mode: wp.transportMode as any,
        segment_geometry: idx === 0 ? (segments[0]?.geometry || null) : null,
        segment_distance_meters: idx === 0 ? totalDistance : null,
        segment_duration_seconds: idx === 0 ? totalDuration : null,
      }));

      const { error: wpError } = await supabase.from('route_waypoints').insert(waypointInserts);
      if (wpError) throw wpError;

      toast.success('Itinerario actualizado');
      await loadRoutes();
      return true;
    } catch (e: any) {
      toast.error('Error al actualizar: ' + e.message);
      return false;
    }
  }, [user, loadRoutes]);

  const deleteRoute = useCallback(async (routeId: string) => {
    try {
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeId);

      if (error) throw error;
      toast.success('Itinerario eliminado');
      await loadRoutes();
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    }
  }, [loadRoutes]);

  const calculateRoute = useCallback(async (
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    transportMode: string,
    roadPreference: 'fastest' | 'scenic' = 'fastest',
    engineOptions?: {
      searchFerries?: boolean;
      searchFlights?: boolean;
      alternativeSearchThresholdKm?: number;
      flightSearchThresholdKm?: number;
      maxAlternatives?: number;
      skipAlternatives?: boolean;
      carSpeedKmh?: number;
      ferrySpeedKmh?: number;
      flightSpeedKmh?: number;
      portSearchRadiusM?: number;
      maxFallbackSegmentM?: number;
    },
  ): Promise<{ segments: any[]; totalDistance: number; totalDuration: number; routeImpossible?: boolean; reason?: string; directDistanceKm?: number; suggestedModes?: string[]; alternatives?: any[] } | null> => {
    setCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('calculate-route', {
        body: {
          waypoints: [
            { lat: origin.latitude, lng: origin.longitude, transportMode },
            { lat: destination.latitude, lng: destination.longitude, transportMode },
          ],
          roadPreference,
          ...engineOptions,
        },
      });

      if (error) throw error;
      
      if (data?.routeImpossible) {
        return data as any;
      }
      
      return data as any;
    } catch (e: any) {
      toast.error('Error al calcular ruta: ' + e.message);
      return null;
    } finally {
      setCalculating(false);
    }
  }, []);

  return {
    routes,
    loading,
    calculating,
    loadRoutes,
    saveRoute,
    updateRoute,
    deleteRoute,
    calculateRoute,
  };
}
