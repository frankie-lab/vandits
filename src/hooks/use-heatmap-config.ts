/**
 * useHeatmapConfig
 * 
 * Centralized hook for heatmap zoom threshold preference.
 * Persists to localStorage and syncs via custom event.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'vandits-heatmap-zoom-threshold';
const EVENT_NAME = 'heatmap-zoom-threshold-changed';
const DEFAULT_THRESHOLD = 10;

function getStored(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val ? parseInt(val, 10) : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}

export function useHeatmapConfig() {
  const [threshold, setThresholdState] = useState(getStored);

  // Listen for external changes (e.g. from UserProfileEditor)
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent).detail?.threshold;
      if (typeof t === 'number') setThresholdState(t);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const setThreshold = useCallback((value: number) => {
    setThresholdState(value);
    localStorage.setItem(STORAGE_KEY, value.toString());
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { threshold: value } }));
  }, []);

  return { heatmapZoomThreshold: threshold, setHeatmapZoomThreshold: setThreshold };
}
