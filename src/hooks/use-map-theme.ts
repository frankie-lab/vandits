/**
 * useMapTheme
 * 
 * Centralized hook for map tile theme (light/dark) with auto-theme support.
 * Persists to localStorage and syncs via custom events.
 */
import { useCallback, useEffect, useState } from 'react';

export type MapTheme = 'light' | 'dark';

const THEME_KEY = 'vandits-map-theme';
const AUTO_KEY = 'vandits-auto-theme';
const SET_EVENT = 'map-set-theme';
const CHANGED_EVENT = 'map-theme-changed';

function getStoredTheme(): MapTheme {
  try {
    const val = localStorage.getItem(THEME_KEY);
    return val === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getStoredAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useMapTheme() {
  const [theme, setThemeState] = useState<MapTheme>(getStoredTheme);
  const [autoTheme, setAutoThemeState] = useState(getStoredAuto);

  // Listen for theme change events from other components
  useEffect(() => {
    const onChanged = (e: Event) => {
      const t = (e as CustomEvent<{ theme: MapTheme }>).detail?.theme;
      if (t === 'light' || t === 'dark') {
        setThemeState(t);
        applyDarkMode(t);
      }
    };
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CHANGED_EVENT, onChanged);
  }, []);

  const setTheme = useCallback((t: MapTheme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyDarkMode(t);
    window.dispatchEvent(new CustomEvent(SET_EVENT, { detail: { theme: t } }));
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { theme: t } }));
  }, []);

  const setAutoTheme = useCallback((enabled: boolean) => {
    setAutoThemeState(enabled);
    localStorage.setItem(AUTO_KEY, String(enabled));
  }, []);

  return {
    mapTheme: theme,
    setMapTheme: setTheme,
    autoTheme,
    setAutoTheme,
  };
}

function applyDarkMode(theme: MapTheme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
