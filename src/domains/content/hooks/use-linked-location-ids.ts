/**
 * useLinkedLocationIds — keeps locations-store.linkedLocationIds in sync with
 * the set of location IDs referenced by the current user's route_waypoints.
 *
 * Used by the workspace-document-scoped-visibility rule to keep document
 * workspace points visible in the global map ONLY when they are part of an
 * itinerary. See mem://logic/map/workspace-document-scoped-visibility.
 *
 * Refresh triggers:
 *  - On mount / user change.
 *  - On the global `routes:changed` window event (emitted by use-routes.ts).
 */
import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { useAuth } from '@/domains/identity';

const ROUTES_CHANGED_EVENT = 'routes:changed';

export function useLinkedLocationIds() {
  const { user } = useAuth();
  const setLinkedLocationIds = useLocationsStore((s) => s.setLinkedLocationIds);

  const refresh = useCallback(async () => {
    if (!user) {
      setLinkedLocationIds(new Set<string>());
      return;
    }
    try {
      // route_waypoints RLS already restricts to user's routes; we just need
      // every non-null location_id from waypoints in routes owned by the user.
      const { data: routes, error: routesErr } = await supabase
        .from('routes')
        .select('id')
        .eq('user_id', user.id);
      if (routesErr) throw routesErr;

      const routeIds = (routes || []).map((r) => r.id);
      if (routeIds.length === 0) {
        setLinkedLocationIds(new Set<string>());
        return;
      }

      const { data: waypoints, error: wpErr } = await supabase
        .from('route_waypoints')
        .select('location_id')
        .in('route_id', routeIds)
        .not('location_id', 'is', null);
      if (wpErr) throw wpErr;

      const ids = new Set<string>();
      (waypoints || []).forEach((w) => {
        if (w.location_id) ids.add(w.location_id);
      });
      setLinkedLocationIds(ids);
    } catch (e) {
      console.warn('useLinkedLocationIds: failed to refresh', e);
    }
  }, [user, setLinkedLocationIds]);

  useEffect(() => {
    void refresh();
    if (typeof window === 'undefined') return;
    const handler = () => void refresh();
    window.addEventListener(ROUTES_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ROUTES_CHANGED_EVENT, handler);
  }, [refresh]);
}
