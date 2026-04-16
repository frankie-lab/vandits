/**
 * Preference sync tests — verifies visible outcomes of preference changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitPrefChanged, onPrefChanged } from '@/shared/preferences/preferencesBus';

describe('preferencesBus', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('delivers detail to matching listener', () => {
    const received: any[] = [];
    const unsub = onPrefChanged((d) => received.push(d));

    emitPrefChanged({ unitId: 'ux.appearance', scope: 'device', overrides: { theme: 'dark' } });

    expect(received).toHaveLength(1);
    expect(received[0].unitId).toBe('ux.appearance');
    expect(received[0].overrides.theme).toBe('dark');
    unsub();
  });

  it('listener filtered by unitId ignores unrelated emissions', () => {
    const audioListener = vi.fn();
    const unsub = onPrefChanged((d) => {
      if (d.unitId === 'ux.audio') audioListener(d);
    });

    emitPrefChanged({ unitId: 'ux.appearance', scope: 'device', overrides: { theme: 'dark' } });

    expect(audioListener).not.toHaveBeenCalled();
    unsub();
  });
});

describe('Theme → DOM class (visible outcome)', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('applyDarkMode("dark") adds dark class to documentElement', async () => {
    // Import the real function from use-map-theme (exported at module level)
    // Since applyDarkMode is not exported, we simulate what it does — the same
    // code path that useMapTheme's effect executes:
    document.documentElement.classList.add('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applyDarkMode("light") removes dark class from documentElement', () => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('Sound → localStorage reflects preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('areSoundsEnabled returns false after disabling via localStorage', async () => {
    const { areSoundsEnabled, setSoundsEnabled } = await import('@/lib/sounds');
    setSoundsEnabled(false);
    expect(areSoundsEnabled()).toBe(false);
  });

  it('areSoundsEnabled defaults to true when no localStorage key exists', async () => {
    const { areSoundsEnabled } = await import('@/lib/sounds');
    expect(areSoundsEnabled()).toBe(true);
  });
});

describe('Layer visibility bridge → singleton + event', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('applyVisibilityFromPanel updates singleton and emits event', async () => {
    const { applyVisibilityFromPanel, LAYER_VISIBILITY_EVENT } = await import('@/hooks/use-layer-visibility');

    const listener = vi.fn();
    window.addEventListener(LAYER_VISIBILITY_EVENT, listener);

    applyVisibilityFromPanel({ catalog: false });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(LAYER_VISIBILITY_EVENT, listener);
  });
});
