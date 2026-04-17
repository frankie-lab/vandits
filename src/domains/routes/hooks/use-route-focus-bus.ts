/**
 * useRouteFocusBus — Centralizes route-related window events for `pages/Index.tsx`.
 *
 * Listens to:
 *   - `route:toggle-visibility` — flip a single route on/off and fit map to it.
 *   - `route:focus` — force a route visible and fit map to it (fetches waypoints
 *     from DB if the route geometry is not loaded yet).
 *
 * Map fitting is delegated to the existing `map-fit-bounds` window event so the
 * map renderer keeps its singleton contract.
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Route as RouteType } from '@/domains/routes';

interface UseRouteFocusBusOptions {
  allRoutes: RouteType[];
  setVisibleRouteIds: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

function fitToCoords(coords: number[][]) {
  if (!coords?.length) return;
  const lats = coords.map((c) => c[1]);
  const lngs = coords.map((c) => c[0]);
  window.dispatchEvent(
    new CustomEvent('map-fit-bounds', {
      detail: {
        bounds: [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
        padding: [60, 60],
        maxZoom: 14,
      },
    }),
  );
}

async function fitToRouteWaypoints(routeId: string) {
  const { data } = await supabase
    .from('route_waypoints')
    .select('latitude, longitude')
    .eq('route_id', routeId);
  if (!data?.length) return;
  const lats = data.map((w) => w.latitude);
  const lngs = data.map((w) => w.longitude);
  window.dispatchEvent(
    new CustomEvent('map-fit-bounds', {
      detail: {
        bounds: [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
        padding: [60, 60],
        maxZoom: 14,
      },
    }),
  );
}

export function useRouteFocusBus({ allRoutes, setVisibleRouteIds }: UseRouteFocusBusOptions) {
  // route:toggle-visibility
  useEffect(() => {
    const handler = (e: CustomEvent<{ routeId: string }>) => {
      const { routeId } = e.detail;
      setVisibleRouteIds((prev) => {
        const next = new Set(prev);
        if (next.has(routeId)) next.delete(routeId);
        else next.add(routeId);
        return next;
      });
      const route = allRoutes.find((r) => r.id === routeId);
      if (route?.routeGeometry?.coordinates?.length) {
        fitToCoords(route.routeGeometry.coordinates as number[][]);
      }
    };
    window.addEventListener('route:toggle-visibility', handler as EventListener);
    return () => window.removeEventListener('route:toggle-visibility', handler as EventListener);
  }, [allRoutes, setVisibleRouteIds]);

  // route:focus
  useEffect(() => {
    const handler = (e: CustomEvent<{ routeId: string }>) => {
      const { routeId } = e.detail;
      setVisibleRouteIds((prev) => {
        const next = new Set(prev);
        next.add(routeId);
        return next;
      });
      const route = allRoutes.find((r) => r.id === routeId);
      if (route?.routeGeometry?.coordinates?.length) {
        fitToCoords(route.routeGeometry.coordinates as number[][]);
      } else {
        fitToRouteWaypoints(routeId);
      }
    };
    window.addEventListener('route:focus', handler as EventListener);
    return () => window.removeEventListener('route:focus', handler as EventListener);
  }, [allRoutes, setVisibleRouteIds]);
}
