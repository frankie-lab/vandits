// Types and constants for the map system

export type ViewMode = 'markers';
export type CriteriaStatus = 'current' | 'previous' | 'unknown' | 'new';

export const CRITERIA_STORAGE_KEY = 'geodata-enrichment-criteria';

// Lucide icon SVG paths for map markers (24x24 viewBox)
export const MARKER_ICON_PATHS: Record<string, string> = {
  'map-pin': 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'target': 'M22 12h-4 M6 12H2 M12 6V2 M12 22v-4 M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  'compass': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12Z',
  'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z',
  'flag': 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  'heart': 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  'mountain': 'M8 3l4 8 5-5 5 15H2L8 3Z',
};

// Legacy alias — keep backward compat for any remaining imports
export const CURATOR_ICON_PATHS = MARKER_ICON_PATHS;
