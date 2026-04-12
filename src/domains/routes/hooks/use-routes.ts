import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';
import { toast } from 'sonner';
import { RouteStop, RouteDayStage } from './use-route-stops';

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
  routeDate?: string;
  visibility: string;
  status: 'draft' | 'completed';
  transportMode: string;
  roadPreference: string;
  totalDistance?: number;
  totalDuration?: number;
  routeGeometry?: any;
  waypoints: RouteWaypoint[];
  stops: RouteStop[];
  dayStages: RouteDayStage[];
  createdAt: string;
  updatedAt: string;
  parentRouteId?: string;
  segmentPosition?: number;
  childRoutes?: Route[];
}

function mapRouteRow(r: any, wps: any[], stopsData: any[], stagesData: any[]): Route {
  const prefs = (r.route_preferences as Record<string, any>) || {};
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description || undefined,
    routeDate: prefs.date || undefined,
    visibility: r.visibility,
    status: r.status as 'draft' | 'completed',
    transportMode: r.transport_mode || 'driving',
    roadPreference: r.road_preference || 'fastest',
    totalDistance: r.total_distance_meters || undefined,
    totalDuration: r.total_duration_seconds || undefined,
    routeGeometry: r.route_geometry || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    parentRouteId: r.parent_route_id || undefined,
    segmentPosition: r.segment_position ?? undefined,
    waypoints: wps.map(wp => ({
      id: wp.id,
      locationId: wp.location_id || undefined,
      position: wp.position,
      name: wp.name,
      latitude: wp.latitude,
      longitude: wp.longitude,
      transportMode: wp.transport_mode as RouteWaypoint['transportMode'],
    })),
    stops: stopsData.map(s => ({
      id: s.id,
      routeId: s.route_id,
      position: s.position,
      name: s.name,
      description: s.description || undefined,
      latitude: s.latitude,
      longitude: s.longitude,
      stopType: s.stop_type as any,
      icon: s.icon || undefined,
      arrivalEstimate: s.arrival_estimate || undefined,
      departureEstimate: s.departure_estimate || undefined,
      metadata: (s.metadata as Record<string, any>) || undefined,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    })),
    dayStages: stagesData.map(d => ({
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
    })),
  };
}

const ROUTES_CHANGED_EVENT = 'routes:changed';

function emitRoutesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ROUTES_CHANGED_EVENT));
  }
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
        const [{ data: wps }, { data: stopsData }, { data: stagesData }] = await Promise.all([
          supabase.from('route_waypoints').select('*').eq('route_id', r.id).order('position', { ascending: true }),
          supabase.from('route_stops').select('*').eq('route_id', r.id).order('position', { ascending: true }),
          supabase.from('route_day_stages').select('*').eq('route_id', r.id).order('day_number', { ascending: true }),
        ]);
        routesWithWaypoints.push(mapRouteRow(r, wps || [], stopsData || [], stagesData || []));
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

    if (typeof window === 'undefined') return;

    const handleRoutesChanged = () => {
      void loadRoutes();
    };

    window.addEventListener(ROUTES_CHANGED_EVENT, handleRoutesChanged);
    return () => window.removeEventListener(ROUTES_CHANGED_EVENT, handleRoutesChanged);
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
    intermediateWaypoints?: { name: string; lat: number; lng: number }[],
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

      // Build all waypoints: origin + intermediates + destination
      const allWaypoints = [origin];
      if (intermediateWaypoints && intermediateWaypoints.length > 0) {
        for (const wp of intermediateWaypoints) {
          allWaypoints.push({
            position: 0, // will be set below
            name: wp.name,
            latitude: wp.lat,
            longitude: wp.lng,
            transportMode: origin.transportMode,
          });
        }
      }
      allWaypoints.push(destination);

      const waypointInserts = allWaypoints.map((wp, idx) => ({
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

  const cascadeChildEndpoints = useCallback(async (childRouteId: string, parentRouteId: string, origin: RouteWaypoint, destination: RouteWaypoint) => {
    try {
      const { data: siblings } = await supabase
        .from('routes')
        .select('id, segment_position')
        .eq('parent_route_id', parentRouteId)
        .order('segment_position', { ascending: true });

      if (!siblings || siblings.length < 2) return;

      const currentIdx = siblings.findIndex(s => s.id === childRouteId);
      if (currentIdx === -1) return;

      // Update next sibling's origin to match this child's destination
      if (currentIdx < siblings.length - 1) {
        const nextId = siblings[currentIdx + 1].id;
        const { data: nextWps } = await supabase
          .from('route_waypoints')
          .select('id, position')
          .eq('route_id', nextId)
          .order('position', { ascending: true })
          .limit(1);

        if (nextWps && nextWps.length > 0) {
          await supabase
            .from('route_waypoints')
            .update({
              name: destination.name,
              latitude: destination.latitude,
              longitude: destination.longitude,
            })
            .eq('id', nextWps[0].id);
        }
      }

      // Update previous sibling's destination to match this child's origin
      if (currentIdx > 0) {
        const prevId = siblings[currentIdx - 1].id;
        const { data: prevWps } = await supabase
          .from('route_waypoints')
          .select('id, position')
          .eq('route_id', prevId)
          .order('position', { ascending: false })
          .limit(1);

        if (prevWps && prevWps.length > 0) {
          await supabase
            .from('route_waypoints')
            .update({
              name: origin.name,
              latitude: origin.latitude,
              longitude: origin.longitude,
            })
            .eq('id', prevWps[0].id);
        }
      }
    } catch (e) {
      console.error('Error cascading child endpoints:', e);
    }
  }, []);

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
    intermediateWaypoints?: { name: string; lat: number; lng: number }[],
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const allCoords: number[][] = [];
      for (const seg of segments) {
        if (seg.geometry?.coordinates) {
          allCoords.push(...seg.geometry.coordinates);
        }
      }

      // Check if this is a child route
      const { data: routeData } = await supabase
        .from('routes')
        .select('parent_route_id')
        .eq('id', routeId)
        .single();

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

      // Replace waypoints — include intermediates
      await supabase.from('route_waypoints').delete().eq('route_id', routeId);

      const allWaypoints = [origin];
      if (intermediateWaypoints && intermediateWaypoints.length > 0) {
        for (const wp of intermediateWaypoints) {
          allWaypoints.push({
            position: 0,
            name: wp.name,
            latitude: wp.lat,
            longitude: wp.lng,
            transportMode: origin.transportMode,
          });
        }
      }
      allWaypoints.push(destination);

      const waypointInserts = allWaypoints.map((wp, idx) => ({
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

      // Cascade endpoints to adjacent siblings if this is a child route
      if (routeData?.parent_route_id) {
        await cascadeChildEndpoints(routeId, routeData.parent_route_id, origin, destination);
      }

      toast.success('Itinerario actualizado');
      emitRoutesChanged();
      await loadRoutes();
      return true;
    } catch (e: any) {
      toast.error('Error al actualizar: ' + e.message);
      return false;
    }
  }, [user, loadRoutes, cascadeChildEndpoints]);

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

  const saveMultiModalRoute = useCallback(async (
    name: string,
    description: string | undefined,
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    segments: any[],
    totalDistance: number,
    totalDuration: number,
    roadPreference: string,
  ): Promise<string | null> => {
    if (!user) return null;

    try {
      // 1. Create parent route (container)
      const allCoords: number[][] = [];
      for (const seg of segments) {
        if (seg.geometry?.coordinates) {
          allCoords.push(...seg.geometry.coordinates);
        }
      }

      const { data: parentRoute, error: parentError } = await supabase
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
          transport_mode: 'multimodal',
          road_preference: roadPreference,
        } as any)
        .select()
        .single();

      if (parentError) throw parentError;

      // 2. Group consecutive segments by transportMode to build child routes
      interface SegmentGroup {
        mode: string;
        segments: any[];
        distance: number;
        duration: number;
      }

      const groups: SegmentGroup[] = [];
      for (const seg of segments) {
        const mode = seg.transportMode || 'driving';
        const last = groups[groups.length - 1];
        if (last && last.mode === mode) {
          last.segments.push(seg);
          last.distance += seg.distance || 0;
          last.duration += seg.duration || 0;
        } else {
          groups.push({
            mode,
            segments: [seg],
            distance: seg.distance || 0,
            duration: seg.duration || 0,
          });
        }
      }

      // 3. Create a child route for each group
      const modeLabels: Record<string, string> = { driving: 'Coche', walking: 'A pie', ferry: 'Ferry', flight: 'Vuelo' };

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const childCoords: number[][] = [];
        for (const seg of group.segments) {
          if (seg.geometry?.coordinates) {
            childCoords.push(...seg.geometry.coordinates);
          }
        }

        // Determine origin/destination of child from segment coordinates
        const firstSeg = group.segments[0];
        const lastSeg = group.segments[group.segments.length - 1];
        const childOriginCoords = firstSeg?.geometry?.coordinates?.[0];
        const childDestCoords = lastSeg?.geometry?.coordinates?.slice(-1)[0];

        const childOriginName = i === 0 ? origin.name : `Tramo ${i + 1} inicio`;
        const childDestName = i === groups.length - 1 ? destination.name : `Tramo ${i + 1} fin`;

        const { data: childRoute, error: childError } = await supabase
          .from('routes')
          .insert({
            user_id: user.id,
            name: `${name} — ${modeLabels[group.mode] || group.mode} (tramo ${i + 1})`,
            description: `Tramo ${i + 1} de ${groups.length}: ${modeLabels[group.mode] || group.mode}`,
            visibility: 'private',
            status: 'completed' as any,
            total_distance_meters: group.distance,
            total_duration_seconds: group.duration,
            route_geometry: childCoords.length > 0 ? { type: 'LineString', coordinates: childCoords } : null,
            transport_mode: group.mode,
            road_preference: roadPreference,
            parent_route_id: parentRoute.id,
            segment_position: i,
          } as any)
          .select()
          .single();

        if (childError) throw childError;

        // Insert waypoints for child route
        const childWaypoints = [
          {
            route_id: childRoute.id,
            location_id: i === 0 ? (origin.locationId || null) : null,
            position: 0,
            name: childOriginName,
            latitude: childOriginCoords?.[1] ?? origin.latitude,
            longitude: childOriginCoords?.[0] ?? origin.longitude,
            transport_mode: group.mode as any,
            segment_geometry: group.segments.length > 0 ? (group.segments[0]?.geometry || null) : null,
            segment_distance_meters: group.distance,
            segment_duration_seconds: group.duration,
          },
          {
            route_id: childRoute.id,
            location_id: i === groups.length - 1 ? (destination.locationId || null) : null,
            position: 1,
            name: childDestName,
            latitude: childDestCoords?.[1] ?? destination.latitude,
            longitude: childDestCoords?.[0] ?? destination.longitude,
            transport_mode: group.mode as any,
          },
        ];

        const { error: wpError } = await supabase.from('route_waypoints').insert(childWaypoints);
        if (wpError) throw wpError;
      }

      // 4. Also insert waypoints on parent route for reference
      const parentWaypoints = [origin, destination].map((wp, idx) => ({
        route_id: parentRoute.id,
        location_id: wp.locationId || null,
        position: idx,
        name: wp.name,
        latitude: wp.latitude,
        longitude: wp.longitude,
        transport_mode: (idx === 0 ? segments[0]?.transportMode : segments[segments.length - 1]?.transportMode) as any || 'driving',
      }));

      await supabase.from('route_waypoints').insert(parentWaypoints);

      toast.success(`Itinerario guardado con ${groups.length} tramos independientes`);
      await loadRoutes();
      return parentRoute.id;
    } catch (e: any) {
      toast.error('Error al guardar: ' + e.message);
      return null;
    }
  }, [user, loadRoutes]);

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

  const loadSingleRoute = useCallback(async (routeId: string): Promise<Route | null> => {
    if (!user) return null;
    try {
      const { data: r, error } = await supabase
        .from('routes')
        .select('*')
        .eq('id', routeId)
        .eq('user_id', user.id)
        .single();

      if (error || !r) return null;

      // Load waypoints, stops, stages, and child routes in parallel
      const [{ data: wps }, { data: stopsData }, { data: stagesData }, { data: childRoutesData }] = await Promise.all([
        supabase.from('route_waypoints').select('*').eq('route_id', r.id).order('position', { ascending: true }),
        supabase.from('route_stops').select('*').eq('route_id', r.id).order('position', { ascending: true }),
        supabase.from('route_day_stages').select('*').eq('route_id', r.id).order('day_number', { ascending: true }),
        supabase.from('routes').select('*').eq('parent_route_id', r.id).order('segment_position', { ascending: true }),
      ]);

      // For child routes, also load their waypoints in parallel
      const childRoutes: Route[] = [];
      if (childRoutesData && childRoutesData.length > 0) {
        const childWaypointResults = await Promise.all(
          childRoutesData.map(child =>
            supabase.from('route_waypoints').select('*').eq('route_id', child.id).order('position', { ascending: true })
          )
        );
        for (let i = 0; i < childRoutesData.length; i++) {
          const child = childRoutesData[i];
          const childWps = childWaypointResults[i].data || [];
          childRoutes.push(mapRouteRow(child, childWps, [], []));
        }
      }

      const route = mapRouteRow(r, wps || [], stopsData || [], stagesData || []);
      route.childRoutes = childRoutes;
      return route;
    } catch (e: any) {
      console.error('Error loading single route:', e);
      return null;
    }
  }, [user]);

  return {
    routes,
    loading,
    calculating,
    loadRoutes,
    loadSingleRoute,
    saveRoute,
    updateRoute,
    deleteRoute,
    saveMultiModalRoute,
    calculateRoute,
  };
}
