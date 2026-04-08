import { useCallback, useEffect, useState } from 'react';
import type { ViewMode } from '@/components/map/map-constants';

const MAP_VIEW_MODE_KEY = 'vandits-map-view-mode';
const MAP_VIEW_MODE_EVENT = 'map-view-mode';

const isViewMode = (value: unknown): value is ViewMode =>
  value === 'markers' || value === 'heatmap' || value === 'hybrid';

const getStoredViewMode = (): ViewMode => {
  if (typeof window === 'undefined') return 'markers';
  const stored = window.localStorage.getItem(MAP_VIEW_MODE_KEY);
  return isViewMode(stored) ? stored : 'markers';
};

export function useMapViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>(getStoredViewMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleModeChange = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: ViewMode }>).detail?.mode;
      if (isViewMode(mode)) {
        setViewModeState(mode);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MAP_VIEW_MODE_KEY) return;
      setViewModeState(getStoredViewMode());
    };

    window.addEventListener(MAP_VIEW_MODE_EVENT, handleModeChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(MAP_VIEW_MODE_EVENT, handleModeChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);

    if (typeof window === 'undefined') return;

    window.localStorage.setItem(MAP_VIEW_MODE_KEY, mode);
    window.dispatchEvent(new CustomEvent(MAP_VIEW_MODE_EVENT, { detail: { mode } }));
  }, []);

  return [viewMode, setViewMode] as const;
}
