import { describe, it, expect, beforeEach } from 'vitest';
import { loadPendingDuplicates, savePendingDuplicates, loadResolvedDuplicates, saveResolvedDuplicates } from '@/domains/content/store/duplicates-helpers';

describe('duplicates-helpers localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no pending duplicates stored', () => {
    expect(loadPendingDuplicates()).toEqual([]);
  });

  it('saves and loads pending duplicates', () => {
    const mockDuplicates = [
      { newLocation: { id: 'new-1', name: 'A' }, existingLocation: { id: 'old-1', name: 'B' }, distance: 50 },
    ] as any;
    savePendingDuplicates(mockDuplicates);
    const loaded = loadPendingDuplicates();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].newLocation.id).toBe('new-1');
  });

  it('returns empty array when no resolved duplicates stored', () => {
    expect(loadResolvedDuplicates()).toEqual([]);
  });

  it('saves and loads resolved duplicate pair IDs', () => {
    saveResolvedDuplicates(['pair-1', 'pair-2']);
    expect(loadResolvedDuplicates()).toEqual(['pair-1', 'pair-2']);
  });
});
