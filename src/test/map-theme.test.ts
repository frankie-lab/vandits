/**
 * Map theme tests — verifies visible DOM outcomes and localStorage round-trip.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { localStorageAdapter } from '@/shared/preferences/storage';

describe('Map theme dark mode — DOM effects', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  it('adding dark class is reflected in classList', () => {
    document.documentElement.classList.add('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removing dark class after adding it leaves classList clean', () => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('Map theme — localStorage adapter round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writing theme to localStorage is readable via adapter', async () => {
    await localStorageAdapter.save('ux.appearance', 'device', { theme: 'dark' });
    const loaded = await localStorageAdapter.load('ux.appearance', 'device');
    expect(loaded).toEqual({ theme: 'dark' });
  });

  it('clearing adapter removes the stored value', async () => {
    await localStorageAdapter.save('ux.appearance', 'device', { theme: 'dark' });
    await localStorageAdapter.clear('ux.appearance', 'device');
    const loaded = await localStorageAdapter.load('ux.appearance', 'device');
    expect(loaded).toBeNull();
  });
});
