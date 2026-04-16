/**
 * useSoundPreferences
 * 
 * Wrapper hook that bridges the ux.audio preferences with the
 * existing sounds.ts utilities. Provides React state for UI reactivity.
 * 
 * Reads from localStorage for backward compatibility during migration.
 * Will be fully backed by the preference system once ux.audio is persisted.
 */
import { useCallback, useState } from 'react';
import {
  areSoundsEnabled,
  setSoundsEnabled as persistSoundsEnabled,
  getSoundPreferences,
  setSoundPreference as persistSoundPreference,
  playSuccessChime,
  type SoundAction,
} from '@/lib/sounds';

// Ensure UX units are registered
import '@/shared/preferences/units';

export function useSoundPreferences() {
  const [globalEnabled, setGlobalEnabledState] = useState(areSoundsEnabled);
  const [prefs, setPrefsState] = useState(getSoundPreferences);

  const setGlobalEnabled = useCallback((enabled: boolean) => {
    persistSoundsEnabled(enabled);
    setGlobalEnabledState(enabled);
    if (enabled) playSuccessChime();
  }, []);

  const toggleGlobal = useCallback(() => {
    const next = !areSoundsEnabled();
    persistSoundsEnabled(next);
    setGlobalEnabledState(next);
    if (next) playSuccessChime();
    return next;
  }, []);

  const setSoundPreference = useCallback((action: SoundAction, enabled: boolean) => {
    persistSoundPreference(action, enabled);
    setPrefsState(prev => ({ ...prev, [action]: enabled }));
  }, []);

  return {
    globalEnabled,
    setGlobalEnabled,
    toggleGlobal,
    preferences: prefs,
    setSoundPreference,
  };
}
