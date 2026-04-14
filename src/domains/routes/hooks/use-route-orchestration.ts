/**
 * Hook: useRouteOrchestration
 * Domain: Routes
 * Manages route visibility on the map and route builder state.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Route } from '@/domains/routes/hooks/use-routes';
import { LAYER_VISIBILITY_EVENT } from '@/hooks/use-layer-visibility';
import { supabase } from '@/integrations/supabase/client';

// ── Helper: read layer visibility from shared singleton ──
function readLayerVisibility(): { routes: boolean; workspace: boolean } {
  try {
    const raw = localStorage.getItem('vandits-layer-visibility');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        routes: parsed.routes?.visible !== false,
        workspace: parsed.workspace?.visible !== false,
      };
    }
  } catch { /* ignore */ }
  return { routes: true, workspace: true };
}

export interface RouteOrchestrationState {
  showRoutesPanel: boolean;
  setShowRoutesPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showRouteBuilder: boolean;
  setShowRouteBuilder: React.Dispatch<React.SetStateAction<boolean>>;
  showRouteSettings: boolean;
  setShowRouteSettings: React.Dispatch<React.SetStateAction<boolean>>;
  editRouteId: string | undefined;
  setEditRouteId: React.Dispatch<React.SetStateAction<string | undefined>>;
  activeRouteSegments: any[];
  setActiveRouteSegments: React.Dispatch<React.SetStateAction<any[]>>;
  visibleRouteIds: Set<string>;
  setVisibleRouteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleCreateRoute: () => void;
  handleEditRoute: (route: Route) => void;
  handleToggleRouteVisibility: (route: Route) => void;
  handleCloseRouteBuilder: () => void;
}

export function useRouteOrchestration(allRoutes: Route[]): RouteOrchestrationState {
  const [showRoutesPanel, setShowRoutesPanel] = useState(false);
  const [showRouteSettings, setShowRouteSettings] = useState(false);
  const [showRouteBuilder, setShowRouteBuilder] = useState(false);
  const [editRouteId, setEditRouteId] = useState<string | undefined>(undefined);
  const [activeRouteSegments, setActiveRouteSegments] = useState<any[]>([]);
  const [visibleRouteIds, setVisibleRouteIds] = useState<Set<string>>(new Set());
  const [layerFlags, setLayerFlags] = useState(readLayerVisibility);
  const [publishedDocIds, setPublishedDocIds] = useState<Set<string> | null>(null);

  // Load published document IDs
  useEffect(() => {
    supabase.from('documents').select('id').eq('status', 'published').then(({ data }) => {
      setPublishedDocIds(new Set((data || []).map(d => d.id)));
    });
  }, [allRoutes]);

  // Filter: visible routes based on layer visibility
  const visibleMapRoutes = useMemo(() => {
    if (!publishedDocIds) return allRoutes;
    return allRoutes.filter(r => {
      const docId = r.sourceDocumentId;
      if (!docId) return true; // manually created → always show
      if (publishedDocIds.has(docId)) return true; // published → catalog
      // draft doc → show only if workspace layer is on
      return layerFlags.workspace;
    });
  }, [allRoutes, publishedDocIds, layerFlags.workspace]);

  // Listen for layer visibility changes
  useEffect(() => {
    const handler = () => setLayerFlags(readLayerVisibility());
    window.addEventListener(LAYER_VISIBILITY_EVENT, handler);
    return () => window.removeEventListener(LAYER_VISIBILITY_EVENT, handler);
  }, []);

  // Dispatch route segments to the map
  useEffect(() => {
    // If the routes layer is off, clear all routes from map
    if (!layerFlags.routes) {
      window.dispatchEvent(new CustomEvent('map-clear-route'));
      return;
    }

    const allSegments: any[] = [];

    // When route builder is active, only show explicitly selected routes + builder segments
    // When routes panel is open with explicit selections, show only those
    // Otherwise show ALL visible routes with geometry
    const isBuilderActive = showRouteBuilder;
    const hasPanelSelection = showRoutesPanel && visibleRouteIds.size > 0;

    if (isBuilderActive || hasPanelSelection) {
      // Show only explicitly toggled routes (from allRoutes, bypasses doc filter)
      for (const routeId of visibleRouteIds) {
        const route = allRoutes.find(r => r.id === routeId);
        if (route && route.routeGeometry) {
          allSegments.push({
            geometry: route.routeGeometry,
            distance: route.totalDistance || 0,
            duration: route.totalDuration || 0,
            transportMode: route.transportMode || 'driving',
            routeId: route.id,
            routeName: route.name,
          });
        }
      }
    } else if (showRoutesPanel) {
      // Panel open but no selection: show ALL user routes with geometry
      for (const route of allRoutes) {
        if (route.routeGeometry) {
          allSegments.push({
            geometry: route.routeGeometry,
            distance: route.totalDistance || 0,
            duration: route.totalDuration || 0,
            transportMode: route.transportMode || 'driving',
            routeId: route.id,
            routeName: route.name,
          });
        }
      }
    } else {
      // General map mode: show routes respecting layer visibility
      for (const route of visibleMapRoutes) {
        if (route.routeGeometry) {
          allSegments.push({
            geometry: route.routeGeometry,
            distance: route.totalDistance || 0,
            duration: route.totalDuration || 0,
            transportMode: route.transportMode || 'driving',
            routeId: route.id,
            routeName: route.name,
          });
        }
      }
    }

    allSegments.push(...activeRouteSegments);
    if ((activeRouteSegments as any)?._stageBreaks) {
      (allSegments as any)._stageBreaks = (activeRouteSegments as any)._stageBreaks;
    }
    if ((activeRouteSegments as any)?._stageStops) {
      (allSegments as any)._stageStops = (activeRouteSegments as any)._stageStops;
    }

    const allStops: any[] = [];
    const seenCoords = new Set<string>();
    const routeIdsToShowStops = (isBuilderActive || hasPanelSelection) ? visibleRouteIds : new Set(visibleMapRoutes.map(r => r.id));
    for (const routeId of routeIdsToShowStops) {
      const route = allRoutes.find(r => r.id === routeId);
      if (route?.stops?.length) {
        allStops.push(...route.stops);
      }
      // Show waypoints for imported routes as small trail markers (deduplicated)
      if (route?.waypoints?.length && route.sourceDocumentId) {
        for (const wp of route.waypoints) {
          const key = `${wp.latitude.toFixed(5)},${wp.longitude.toFixed(5)}`;
          if (!seenCoords.has(key)) {
            seenCoords.add(key);
            allStops.push({
              name: wp.name,
              latitude: wp.latitude,
              longitude: wp.longitude,
              stopType: 'route_waypoint',
            });
          }
        }
      }
    }

    if (allSegments.length > 0) {
      window.dispatchEvent(new CustomEvent('map-show-route', { detail: { segments: allSegments, stops: allStops } }));
    } else {
      window.dispatchEvent(new CustomEvent('map-clear-route'));
    }
  }, [activeRouteSegments, visibleRouteIds, allRoutes, visibleMapRoutes, layerFlags.routes, showRouteBuilder, showRoutesPanel]);

  // Listen for route selection from map click
  useEffect(() => {
    const handleRouteSelected = (e: Event) => {
      const { routeId } = (e as CustomEvent).detail;
      if (!routeId) return;

      // Check if route is imported (GPS) — don't open builder for imported routes
      const route = allRoutes.find(r => r.id === routeId);
      if (route?.sourceDocumentId) {
        // Just toggle visibility, don't open builder
        setVisibleRouteIds(new Set([routeId]));
        return;
      }

      // Open the route builder for editing (manual routes only)
      setEditRouteId(routeId);
      setShowRouteBuilder(true);
      setShowRoutesPanel(false);
      setVisibleRouteIds(new Set([routeId]));
    };
    window.addEventListener('map-route-selected', handleRouteSelected);
    return () => window.removeEventListener('map-route-selected', handleRouteSelected);
  }, [allRoutes]);

  const handleCreateRoute = useCallback(() => {
    setEditRouteId(undefined);
    setShowRouteBuilder(true);
    setShowRoutesPanel(false);
  }, []);

  const handleEditRoute = useCallback((route: Route) => {
    setEditRouteId(route.id);
    setShowRouteBuilder(true);
    setShowRoutesPanel(false);
    // Keep the edited route visible on the map while builder loads
    setVisibleRouteIds(new Set([route.id]));
  }, []);

  const handleToggleRouteVisibility = useCallback((route: Route) => {
    setVisibleRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(route.id)) {
        next.delete(route.id);
        // Also remove children
        for (const r of allRoutes) {
          if (r.parentRouteId === route.id) next.delete(r.id);
        }
      } else {
        next.add(route.id);
        // Also add children
        for (const r of allRoutes) {
          if (r.parentRouteId === route.id) next.add(r.id);
        }
        // Also add parent + siblings if child
        if (route.parentRouteId) {
          next.add(route.parentRouteId);
          for (const r of allRoutes) {
            if (r.parentRouteId === route.parentRouteId) next.add(r.id);
          }
        }
      }
      return next;
    });
  }, [allRoutes]);

  const handleCloseRouteBuilder = useCallback(() => {
    setShowRouteBuilder(false);
    setEditRouteId(undefined);
    setActiveRouteSegments([]);
  }, []);

  return {
    showRoutesPanel,
    setShowRoutesPanel,
    showRouteBuilder,
    setShowRouteBuilder,
    showRouteSettings,
    setShowRouteSettings,
    editRouteId,
    setEditRouteId,
    activeRouteSegments,
    setActiveRouteSegments,
    visibleRouteIds,
    setVisibleRouteIds,
    handleCreateRoute,
    handleEditRoute,
    handleToggleRouteVisibility,
    handleCloseRouteBuilder,
  };
}
