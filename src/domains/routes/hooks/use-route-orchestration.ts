/**
 * Hook: useRouteOrchestration
 * Domain: Routes
 * Manages route visibility on the map and route builder state.
 */
import { useState, useEffect, useCallback } from 'react';
import { Route } from '@/domains/routes/hooks/use-routes';

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

  // Dispatch route segments to the map
  useEffect(() => {
    const allSegments: any[] = [];

    for (const routeId of visibleRouteIds) {
      const route = allRoutes.find(r => r.id === routeId);
      if (route && route.routeGeometry) {
        allSegments.push({
          geometry: route.routeGeometry,
          distance: route.totalDistance || 0,
          duration: route.totalDuration || 0,
          transportMode: route.transportMode || 'driving',
          routeId: route.id,
        });
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
    for (const routeId of visibleRouteIds) {
      const route = allRoutes.find(r => r.id === routeId);
      if (route?.stops?.length) {
        allStops.push(...route.stops);
      }
    }

    

    if (allSegments.length > 0) {
      window.dispatchEvent(new CustomEvent('map-show-route', { detail: { segments: allSegments, stops: allStops } }));
    } else {
      window.dispatchEvent(new CustomEvent('map-clear-route'));
    }
  }, [activeRouteSegments, visibleRouteIds, allRoutes]);

  // Listen for route selection from map click
  useEffect(() => {
    const handleRouteSelected = (e: Event) => {
      const { routeId } = (e as CustomEvent).detail;
      if (routeId) {
        setEditRouteId(routeId);
        setShowRouteBuilder(true);
        setShowRoutesPanel(false);
        setVisibleRouteIds(new Set());
      }
    };
    window.addEventListener('map-route-selected', handleRouteSelected);
    return () => window.removeEventListener('map-route-selected', handleRouteSelected);
  }, []);

  const handleCreateRoute = useCallback(() => {
    setEditRouteId(undefined);
    setShowRouteBuilder(true);
    setShowRoutesPanel(false);
  }, []);

  const handleEditRoute = useCallback((route: Route) => {
    setEditRouteId(route.id);
    setShowRouteBuilder(true);
    setShowRoutesPanel(false);
    setVisibleRouteIds(new Set());
  }, []);

  const handleToggleRouteVisibility = useCallback((route: Route) => {
    setVisibleRouteIds(prev => {
      if (prev.has(route.id)) {
        const next = new Set(prev);
        next.delete(route.id);
        return next;
      } else {
        return new Set([route.id]);
      }
    });
  }, []);

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
