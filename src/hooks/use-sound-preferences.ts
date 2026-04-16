/**
 * useSoundPreferences — Backed by ux.audio preference system.
 *
 * Reads audio preferences from usePreferences('ux.audio') and
 * bridges them with the sounds.ts playback utilities.
 *
 * The sounds.ts functions still check localStorage directly for
 * backward compat during the migration window; this hook writes
 * to both the preference system AND localStorage so consumers
 * that call isSoundActionEnabled() directly still work.
 */
import { useCallback, useMemo } from 'react';
import { usePreferences } from '@/shared/preferences/usePreferences';
import { localStorageAdapter } from '@/shared/preferences/storage';
import {
  setSoundsEnabled as persistLegacySoundsEnabled,
  setSoundPreference as persistLegacySoundPref,
  playSuccessChime,
  type SoundAction,
} from '@/lib/sounds';

// Ensure UX units are registered
import '@/shared/preferences/units';

export function useSoundPreferences() {
  const { preferences, update } = usePreferences({
    unitId: 'ux.audio',
    adapter: localStorageAdapter, // audio prefs are device-local
  });

  const globalEnabled = (preferences.globalEnabled ?? true) as boolean;

  const setGlobalEnabled = useCallback((enabled: boolean) => {
    update('device', 'globalEnabled', enabled);
    // Legacy bridge for sounds.ts direct callers
    persistLegacySoundsEnabled(enabled);
    if (enabled) playSuccessChime();
  }, [update]);

  const toggleGlobal = useCallback(() => {
    const next = !globalEnabled;
    update('device', 'globalEnabled', next);
    persistLegacySoundsEnabled(next);
    if (next) playSuccessChime();
    return next;
  }, [globalEnabled, update]);

  const setSoundPreference = useCallback((action: SoundAction, enabled: boolean) => {
    // Map legacy action keys to preference field keys
    const fieldMap: Record<SoundAction, string> = {
      enrichment_complete: 'enrichmentSound',
      file_upload: 'importSound',
      export_complete: 'exportSound',
      duplicate_resolved: 'enrichmentSound', // no dedicated field, falls back
      geocode_complete: 'enrichmentSound',   // no dedicated field, falls back
      route_calculated: 'routeSound',
    };
    const fieldKey = fieldMap[action] ?? action;
    update('device', fieldKey, enabled);
    // Legacy bridge
    persistLegacySoundPref(action, enabled);
  }, [update]);

  // Build preferences map from resolved values
  const prefs = useMemo(() => ({
    enrichment_complete: (preferences.enrichmentSound ?? true) as boolean,
    file_upload: (preferences.importSound ?? true) as boolean,
    export_complete: (preferences.exportSound ?? true) as boolean,
    duplicate_resolved: (preferences.enrichmentSound ?? true) as boolean,
    geocode_complete: (preferences.enrichmentSound ?? true) as boolean,
    route_calculated: (preferences.routeSound ?? true) as boolean,
  }), [preferences]);

  return {
    globalEnabled,
    setGlobalEnabled,
    toggleGlobal,
    preferences: prefs,
    setSoundPreference,
  };
}
