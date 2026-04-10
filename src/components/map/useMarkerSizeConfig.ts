import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MarkerSizeEntry {
  base_normal: number;
  base_selected: number;
  base_focused: number;
  base_recent: number;
  hover_size: number | null;
  marker_shape: string;
}

export type MarkerSizeMap = Record<string, MarkerSizeEntry>;

const DEFAULTS: MarkerSizeMap = {
  own_new: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 12, hover_size: null, marker_shape: 'circle' },
  own_enriched: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 18, hover_size: 24, marker_shape: 'pin' },
  followed_new: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 12, hover_size: null, marker_shape: 'circle' },
  followed_enriched: { base_normal: 12, base_selected: 16, base_focused: 18, base_recent: 20, hover_size: 24, marker_shape: 'circle' },
  druid_new: { base_normal: 26, base_selected: 30, base_focused: 32, base_recent: 26, hover_size: null, marker_shape: 'icon' },
  druid_enriched: { base_normal: 28, base_selected: 36, base_focused: 40, base_recent: 44, hover_size: null, marker_shape: 'pin' },
  curator_default: { base_normal: 26, base_selected: 30, base_focused: 32, base_recent: 26, hover_size: null, marker_shape: 'icon' },
  curator_enriched: { base_normal: 28, base_selected: 36, base_focused: 40, base_recent: 44, hover_size: null, marker_shape: 'pin' },
};

let cachedConfig: MarkerSizeMap | null = null;
let fetchPromise: Promise<MarkerSizeMap> | null = null;
type Listener = (config: MarkerSizeMap) => void;
const listeners = new Set<Listener>();

function notifyListeners(config: MarkerSizeMap) {
  listeners.forEach((fn) => fn(config));
}

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
}

/** Subscribe to live config changes. Returns unsubscribe function. */
export function onMarkerSizeConfigChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useMarkerSizeConfig() {
  const [config, setConfig] = useState<MarkerSizeMap>(cachedConfig || DEFAULTS);

  useEffect(() => {
    // Subscribe to live changes
    const unsub = onMarkerSizeConfigChange(setConfig);

    if (cachedConfig) {
      setConfig(cachedConfig);
    } else {
      if (!fetchPromise) {
        fetchPromise = fetchConfig();
      }
      fetchPromise.then((result) => {
        cachedConfig = result;
        setConfig(result);
      });
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
