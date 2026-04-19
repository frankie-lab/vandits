/**
 * useMapTheme — Backed by ux.appearance preference system.
 *
 * Reads `theme` from usePreferences('ux.appearance') and applies
 * dark-mode class as an imperative side-effect.
 *
 * Also bridges with `ux.map.chrome.mapTheme` (auto | light | dark) so the
 * Preferences → Mapa panel can drive the same setting that used to live in
 * the floating toolbar.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { usePreferences } from '@/shared/preferences/usePreferences';
import { localStorageAdapter } from '@/shared/preferences/storage';

// Ensure UX units are registered
import '@/shared/preferences/units';

export type MapTheme = 'light' | 'dark';

const AUTO_KEY = 'vandits-auto-theme';

// ── Imperative side-effect ───────────────────────────────────
function applyDarkMode(theme: MapTheme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Keep legacy event names for map tile layer sync
const SET_EVENT = 'map-set-theme';
const CHANGED_EVENT = 'map-theme-changed';

export function useMapTheme() {
  const { preferences, loading, update } = usePreferences({
    unitId: 'ux.appearance',
    adapter: localStorageAdapter, // theme is device-local, no DB round-trip
  });

  // Map chrome preferences (drives the new Preferences → Mapa selector)
  const mapChrome = usePreferences({
    unitId: 'ux.map.chrome',
    adapter: localStorageAdapter,
  });

  const theme = useMemo<MapTheme>(() => {
    const val = preferences.theme;
    return val === 'dark' ? 'dark' : 'light';
  }, [preferences.theme]);

  // Apply dark mode whenever theme changes
  useEffect(() => {
    if (!loading) {
      applyDarkMode(theme);
    }
  }, [theme, loading]);

  // Listen for legacy theme events from map components
  useEffect(() => {
    const onChanged = (e: Event) => {
      const t = (e as CustomEvent<{ theme: MapTheme }>).detail?.theme;
      if (t === 'light' || t === 'dark') {
        update('device', 'theme', t);
      }
    };
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CHANGED_EVENT, onChanged);
  }, [update]);

  const setMapTheme = useCallback((t: MapTheme) => {
    update('device', 'theme', t);
    // Emit legacy events for map tile layer
    window.dispatchEvent(new CustomEvent(SET_EVENT, { detail: { theme: t } }));
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { theme: t } }));
  }, [update]);

  // Auto-theme (stored separately — simple localStorage toggle)
  const autoTheme = useMemo(() => {
    try { return localStorage.getItem(AUTO_KEY) === 'true'; } catch { return false; }
  }, []);

  const setAutoTheme = useCallback((enabled: boolean) => {
    localStorage.setItem(AUTO_KEY, String(enabled));
  }, []);

  // ── Bridge: react to changes coming from Preferences → Mapa ─────
  useEffect(() => {
    if (mapChrome.loading) return;
    const choice = mapChrome.preferences.mapTheme as 'auto' | 'light' | 'dark' | undefined;
    if (!choice) return;

    if (choice === 'auto') {
      if (!autoTheme) setAutoTheme(true);
      // The solar-time effect in FloatingToolbar will pick the actual light/dark.
      return;
    }
    // Manual choice — disable auto and force the chosen theme.
    if (autoTheme) setAutoTheme(false);
    if (theme !== choice) {
      setMapTheme(choice);
    }
  }, [mapChrome.loading, mapChrome.preferences.mapTheme, autoTheme, theme, setAutoTheme, setMapTheme]);

  return {
    mapTheme: theme,
    setMapTheme,
    autoTheme,
    setAutoTheme,
  };
}
