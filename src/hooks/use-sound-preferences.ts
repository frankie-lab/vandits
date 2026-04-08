/**
 * useSoundPreferences
 * 
 * Centralized hook for sound preferences.
 * Wraps the existing sounds.ts utilities with React state for UI reactivity.
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
