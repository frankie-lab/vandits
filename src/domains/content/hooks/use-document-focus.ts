/**
 * useDocumentFocus — Centralizes the "view document on map" mode for `pages/Index.tsx`.
 *
 * Listens to:
 *   - `document:view-on-map` (set/clear active document focus)
 *   - `document:status-visibility` (hide/show whole documents from the map)
 *
 * Side-effects:
 *   - Updates locations-store filters (`filterByDocumentId`, `filterByDocumentName`,
 *     `filterByDocumentMatchIds`, `hiddenDocumentIds`).
 *   - Picks the right set of route ids to make visible (parent + children).
 */
import { useEffect, useState, useCallback } from 'react';
import { useLocationsStore } from '@/domains/content';
import type { Route as RouteType } from '@/domains/routes';

export interface ActiveDocumentView {
  docId: string;
  docName?: string;
  routeIds?: string[];
  matchingCatalogIds?: string[];
}

interface UseDocumentFocusOptions {
  allRoutes: RouteType[];
  setVisibleRouteIds: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

export function useDocumentFocus({ allRoutes, setVisibleRouteIds }: UseDocumentFocusOptions) {
  const [activeDocumentView, setActiveDocumentView] = useState<ActiveDocumentView | null>(null);

  // Listen for document:view-on-map (set/clear)
  useEffect(() => {
    const handler = (e: CustomEvent<{
      docId?: string;
      docName?: string;
      routeIds?: string[];
      matchingCatalogIds?: string[];
    } | null>) => {
      const detail = e.detail;
      if (!detail?.docId) {
        setActiveDocumentView(null);
        return;
      }
      setActiveDocumentView({
        docId: detail.docId,
        docName: detail.docName,
        routeIds: detail.routeIds || [],
        matchingCatalogIds: detail.matchingCatalogIds || [],
      });
    };
    window.addEventListener('document:view-on-map', handler as EventListener);
    return () => window.removeEventListener('document:view-on-map', handler as EventListener);
  }, []);

  // Apply filters + visible routes whenever the focus changes
  useEffect(() => {
    if (!activeDocumentView) {
      useLocationsStore.getState().setFilters({
        filterByDocumentId: undefined,
        filterByDocumentName: undefined,
        filterByDocumentMatchIds: undefined,
      });
      setVisibleRouteIds(new Set());
      return;
    }

    const parentRouteIds = allRoutes
      .filter(route => route.sourceDocumentId === activeDocumentView.docId)
      .map(route => route.id);
    const childRouteIds = allRoutes
      .filter(route => route.parentRouteId && parentRouteIds.includes(route.parentRouteId))
      .map(route => route.id);
    const resolvedRouteIds = [...parentRouteIds, ...childRouteIds];
    const nextRouteIds = resolvedRouteIds.length > 0
      ? resolvedRouteIds
      : (activeDocumentView.routeIds || []);

    useLocationsStore.getState().setFilters({
      filterByDocumentId: activeDocumentView.docId,
      filterByDocumentName: activeDocumentView.docName,
      filterByDocumentMatchIds: activeDocumentView.matchingCatalogIds,
    });
    setVisibleRouteIds(new Set(nextRouteIds));
  }, [activeDocumentView, allRoutes, setVisibleRouteIds]);

  // Listen for document:status-visibility (hide whole docs by status)
  useEffect(() => {
    const handler = (e: CustomEvent<{
      visibleStatuses: Record<string, boolean>;
      docs: { id: string; status: string }[];
    }>) => {
      const { visibleStatuses, docs } = e.detail;
      const hiddenIds = docs.filter(d => !visibleStatuses[d.status]).map(d => d.id);
      useLocationsStore.getState().setFilters({
        hiddenDocumentIds: hiddenIds.length > 0 ? hiddenIds : undefined,
      });
    };
    window.addEventListener('document:status-visibility', handler as EventListener);
    return () => window.removeEventListener('document:status-visibility', handler as EventListener);
  }, []);

  const clearFocus = useCallback(() => setActiveDocumentView(null), []);

  return { activeDocumentView, clearFocus };
}
