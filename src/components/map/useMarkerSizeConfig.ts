import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MarkerSizeEntry {
  base_normal: number;
  base_selected: number;
  base_focused: number;
  base_recent: number;
  hover_size: number | null;
  marker_shape: string;
  fill_color: string;
  fill_color_light: string;
}

export type MarkerSizeMap = Record<string, MarkerSizeEntry>;

const DEFAULTS: MarkerSizeMap = {
  own_new: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 12, hover_size: null, marker_shape: 'circle', fill_color: '#6b7280', fill_color_light: '#9ca3af' },
  own_enriched: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 18, hover_size: 24, marker_shape: 'pin', fill_color: '#22c55e', fill_color_light: '#4ade80' },
  // Catalog markers: sky-blue to distinguish from workspace (gray/orange)
  catalog_new: { base_normal: 14, base_selected: 18, base_focused: 20, base_recent: 14, hover_size: null, marker_shape: 'circle', fill_color: '#0ea5e9', fill_color_light: '#38bdf8' },
  catalog_empty: { base_normal: 14, base_selected: 18, base_focused: 20, base_recent: 14, hover_size: null, marker_shape: 'circle', fill_color: '#0ea5e9', fill_color_light: '#38bdf8' },
  catalog_enriched: { base_normal: 14, base_selected: 18, base_focused: 20, base_recent: 20, hover_size: 26, marker_shape: 'pin', fill_color: '#0ea5e9', fill_color_light: '#38bdf8' },
  followed_new: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 12, hover_size: null, marker_shape: 'circle', fill_color: '#3b82f6', fill_color_light: '#60a5fa' },
  followed_enriched: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 20, hover_size: 24, marker_shape: 'circle', fill_color: '#3b82f6', fill_color_light: '#60a5fa' },
  own_empty: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 12, hover_size: null, marker_shape: 'circle', fill_color: '#f97316', fill_color_light: '#fb923c' },
  druid_new: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 12, hover_size: null, marker_shape: 'circle', fill_color: '#a855f7', fill_color_light: '#c084fc' },
  druid_enriched: { base_normal: 28, base_selected: 36, base_focused: 40, base_recent: 44, hover_size: null, marker_shape: 'pin', fill_color: '#a855f7', fill_color_light: '#c084fc' },
  curator_default: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 12, hover_size: null, marker_shape: 'circle', fill_color: '#94a3b8', fill_color_light: '#cbd5e1' },
  curator_enriched: { base_normal: 28, base_selected: 36, base_focused: 40, base_recent: 44, hover_size: null, marker_shape: 'pin', fill_color: '#14b8a6', fill_color_light: '#5eead4' },
  // System markers
  photo_thumbnail: { base_normal: 44, base_selected: 52, base_focused: 56, base_recent: 44, hover_size: null, marker_shape: 'square', fill_color: '#6366f1', fill_color_light: '#818cf8' },
  home: { base_normal: 24, base_selected: 28, base_focused: 32, base_recent: 24, hover_size: null, marker_shape: 'circle', fill_color: '#16a34a', fill_color_light: '#4ade80' },
  user_gps: { base_normal: 14, base_selected: 18, base_focused: 20, base_recent: 14, hover_size: null, marker_shape: 'circle', fill_color: '#3b82f6', fill_color_light: '#60a5fa' },
  nearby_result: { base_normal: 10, base_selected: 14, base_focused: 16, base_recent: 10, hover_size: null, marker_shape: 'circle', fill_color: '#6b7280', fill_color_light: '#9ca3af' },
  // Route markers
  route_waypoint: { base_normal: 18, base_selected: 22, base_focused: 24, base_recent: 18, hover_size: null, marker_shape: 'circle', fill_color: '#0d9488', fill_color_light: '#2dd4bf' },
  route_flag: { base_normal: 36, base_selected: 40, base_focused: 44, base_recent: 36, hover_size: null, marker_shape: 'circle', fill_color: '#dc2626', fill_color_light: '#f87171' },
  route_stage_break: { base_normal: 28, base_selected: 32, base_focused: 36, base_recent: 28, hover_size: null, marker_shape: 'circle', fill_color: '#f59e0b', fill_color_light: '#fbbf24' },
  route_stop_overnight: { base_normal: 32, base_selected: 36, base_focused: 40, base_recent: 32, hover_size: null, marker_shape: 'circle', fill_color: '#f59e0b', fill_color_light: '#fbbf24' },
  route_stop_refuel: { base_normal: 32, base_selected: 36, base_focused: 40, base_recent: 32, hover_size: null, marker_shape: 'circle', fill_color: '#ef4444', fill_color_light: '#f87171' },
  route_stop_port: { base_normal: 26, base_selected: 30, base_focused: 34, base_recent: 26, hover_size: null, marker_shape: 'circle', fill_color: '#0891b2', fill_color_light: '#22d3ee' },
  route_stop_airport: { base_normal: 26, base_selected: 30, base_focused: 34, base_recent: 26, hover_size: null, marker_shape: 'circle', fill_color: '#9333ea', fill_color_light: '#c084fc' },
  route_stop_custom: { base_normal: 32, base_selected: 36, base_focused: 40, base_recent: 32, hover_size: null, marker_shape: 'circle', fill_color: '#6b7280', fill_color_light: '#9ca3af' },
};

let cachedConfig: MarkerSizeMap | null = null;
let fetchPromise: Promise<MarkerSizeMap> | null = null;
type Listener = (config: MarkerSizeMap) => void;
const listeners = new Set<Listener>();

function notifyListeners(config: MarkerSizeMap) {
  listeners.forEach((fn) => fn(config));
}

/** Eagerly fetch config on module load so map always has DB values */
function ensureFetched(): Promise<MarkerSizeMap> {
  if (!fetchPromise) {
    fetchPromise = fetchConfig().then((result) => {
      cachedConfig = result;
      notifyListeners(result);
      return result;
    });
  }
  return fetchPromise;
}

// Start fetching immediately on module import
ensureFetched();

async function fetchConfig(): Promise<MarkerSizeMap> {
  const { data, error } = await supabase
    .from('marker_size_config')
    .select('*');
  
  if (error || !data) {
    console.warn('Failed to load marker size config, using defaults', error);
    return DEFAULTS;
  }

  const map: MarkerSizeMap = { ...DEFAULTS };
  for (const row of data as any[]) {
    map[row.marker_type] = {
      base_normal: row.base_normal,
      base_selected: row.base_selected,
      base_focused: row.base_focused,
      base_recent: row.base_recent,
      hover_size: row.hover_size,
      marker_shape: row.marker_shape,
      fill_color: row.fill_color || DEFAULTS[row.marker_type]?.fill_color || '#6b7280',
      fill_color_light: row.fill_color_light || DEFAULTS[row.marker_type]?.fill_color_light || '#9ca3af',
    };
  }
  return map;
}

export function getMarkerSizeConfig(): MarkerSizeMap {
  return cachedConfig || DEFAULTS;
}

/** Live-update the cached config and notify all subscribers (map, previews, etc.) */
export function updateMarkerSizeConfig(config: MarkerSizeMap) {
  cachedConfig = config;
  notifyListeners(config);
}

export function invalidateMarkerSizeCache() {
  cachedConfig = null;
  fetchPromise = null;
  ensureFetched();
}

/** Subscribe to live config changes. Returns unsubscribe function. */
export function onMarkerSizeConfigChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useMarkerSizeConfig() {
  const [config, setConfig] = useState<MarkerSizeMap>(cachedConfig || DEFAULTS);

  useEffect(() => {
    const unsub = onMarkerSizeConfigChange(setConfig);

    if (cachedConfig) {
      setConfig(cachedConfig);
    } else {
      ensureFetched().then(setConfig);
    }

    return unsub;
  }, []);

  return config;
}

export function getBaseSize(entry: MarkerSizeEntry, isRecentlyEnriched: boolean, isFocused: boolean, isSelected: boolean): number {
  if (isRecentlyEnriched) return entry.base_recent;
  if (isFocused) return entry.base_focused;
  if (isSelected) return entry.base_selected;
  return entry.base_normal;
}

export function getHoverSize(entry: MarkerSizeEntry): number | null {
  return entry.hover_size;
}
