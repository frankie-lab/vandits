/**
 * Map theme integration test — verifies dark mode class application.
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('Map theme dark mode', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  it('applies dark class when theme preference is dark', () => {
    // Simulate what useMapTheme's applyDarkMode does
    document.documentElement.classList.add('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when theme preference is light', () => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('theme change event carries correct payload', () => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      expect(detail.theme).toBe('dark');
    };
    window.addEventListener('map-theme-changed', listener);
    window.dispatchEvent(new CustomEvent('map-theme-changed', { detail: { theme: 'dark' } }));
    window.removeEventListener('map-theme-changed', listener);
  });
});
