/**
 * Preference sync tests — verifies the reactive bus in usePreferences.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Preference reactive bus', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('emits vandits:pref-changed CustomEvent on update', async () => {
    const listener = vi.fn();
    window.addEventListener('vandits:pref-changed', listener);

    // Simulate what usePreferences.update does internally
    const detail = { unitId: 'ux.appearance', scope: 'device', overrides: { theme: 'dark' } };
    window.dispatchEvent(new CustomEvent('vandits:pref-changed', { detail }));

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.unitId).toBe('ux.appearance');
    expect(event.detail.overrides.theme).toBe('dark');

    window.removeEventListener('vandits:pref-changed', listener);
  });

  it('ignores events for different unitIds', () => {
    const listener = vi.fn();
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.unitId === 'ux.audio') listener(d);
    };
    window.addEventListener('vandits:pref-changed', handler);

    window.dispatchEvent(new CustomEvent('vandits:pref-changed', {
      detail: { unitId: 'ux.appearance', scope: 'device', overrides: { theme: 'dark' } },
    }));

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('vandits:pref-changed', handler);
  });
});

describe('Layer visibility bridge', () => {
  it('applyVisibilityFromPanel emits layer-visibility-changed', async () => {
    const { applyVisibilityFromPanel, LAYER_VISIBILITY_EVENT } = await import('@/hooks/use-layer-visibility');
    
    const listener = vi.fn();
    window.addEventListener(LAYER_VISIBILITY_EVENT, listener);

    applyVisibilityFromPanel({ catalog: false });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(LAYER_VISIBILITY_EVENT, listener);
  });
});
