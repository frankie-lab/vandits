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
 segmentGeometry?: any;
 segmentDistance?: number;
 segmentDuration?: number;
 preferAlternative?: boolean;
}

export interface Route {
 id: string;
 userId: string;
 name: string;
 description?: string;
 visibility: string;
 status: 'draft' | 'completed';
 totalDistance?: number;
 totalDuration?: number;
 routeGeometry?: any;
 waypoints: RouteWaypoint[];
 outboundColor?: string;
 isRoundTrip?: boolean;
 avoidSameReturn?: boolean;
 acceptedModes?: string[];
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
 totalDistance: r.total_distance_meters || undefined,
 totalDuration: r.total_duration_seconds || undefined,
 routeGeometry: r.route_geometry || undefined,
 outboundColor: (r as any).outbound_color || '#2563eb',
 isRoundTrip: (r as any).is_round_trip ?? true,
 avoidSameReturn: (r as any).avoid_same_return ?? true,
 acceptedModes: (r as any).accepted_modes || [],
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
 segmentGeometry: wp.segment_geometry || undefined,
 segmentDistance: wp.segment_distance_meters || undefined,
 segmentDuration: wp.segment_duration_seconds || undefined,
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
 waypoints: RouteWaypoint[],
 segments: any[],
 totalDistance: number,
 totalDuration: number,
 description?: string,
 visibility: string = 'private',
 ): Promise<string | null> => {
 if (!user) return null;

 try {
      // Combine all segment geometries
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
 visibility,
 status: 'completed' as any,
 total_distance_meters: totalDistance,
 total_duration_seconds: totalDuration,
 route_geometry: { type: 'LineString', coordinates: allCoords },
 })
 .select()
 .single();

 if (routeError) throw routeError;

      // Save waypoints
 const waypointInserts = waypoints.map((wp, idx) => ({
 route_id: route.id,
 location_id: wp.locationId || null,
 position: idx,
 name: wp.name,
 latitude: wp.latitude,
 longitude: wp.longitude,
 transport_mode: wp.transportMode as any,
 segment_geometry: segments[idx]?.geometry || null,
 segment_distance_meters: segments[idx]?.distance || null,
 segment_duration_seconds: segments[idx]?.duration || null,
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

 const calculateRoute = useCallback(async (waypoints: RouteWaypoint[]) => {
 if (waypoints.length < 2) return null;
 setCalculating(true);

 try {
  const { data, error } = await supabase.functions.invoke('calculate-route', {
  body: {
  waypoints: waypoints.map(wp => ({
  lat: wp.latitude,
  lng: wp.longitude,
  transportMode: wp.transportMode,
  ...(wp.preferAlternative ? { preferAlternative: true } : {}),
  })),
  },
  });

 if (error) throw error;
 return data as { segments: any[]; totalDistance: number; totalDuration: number };
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
 deleteRoute,
 calculateRoute,
 };
}
