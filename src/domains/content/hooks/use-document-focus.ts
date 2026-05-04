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
import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocationsStore } from '@/domains/content';
import { applyVisibilityFromPanel } from '@/hooks/use-layer-visibility';
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
  // Snapshot of layer visibility before entering focus, so we can restore it on exit
  const layerSnapshotRef = useRef<{ workspace: boolean; catalog: boolean } | null>(null);

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
      // Restore previous layer visibility (workspace/catalog) if we forced it on
      if (layerSnapshotRef.current) {
        applyVisibilityFromPanel({
          workspace: layerSnapshotRef.current.workspace,
          catalog: layerSnapshotRef.current.catalog,
        });
        layerSnapshotRef.current = null;
      }
      return;
    }

    // Force workspace + catalog layers visible while focusing a document,
    // since document points may be in either state. Snapshot first so we can restore.
    if (!layerSnapshotRef.current) {
      try {
        const raw = localStorage.getItem('vandits-layer-visibility');
        const parsed = raw ? JSON.parse(raw) : {};
        layerSnapshotRef.current = {
          workspace: parsed?.workspace?.visible ?? false,
          catalog: parsed?.catalog?.visible ?? true,
        };
      } catch {
        layerSnapshotRef.current = { workspace: false, catalog: true };
      }
    }
    applyVisibilityFromPanel({ workspace: true, catalog: true });

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
