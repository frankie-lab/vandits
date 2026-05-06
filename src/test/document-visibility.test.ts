import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/collection.service', () => ({
  collectionService: {
    findByUser: vi.fn(),
    getItems: vi.fn(),
  },
}));
vi.mock('@/shared/loading', () => ({
  startLoading: vi.fn(),
  endLoading: vi.fn(),
}));

import { collectionService } from '@/services/collection.service';
import {
  initSessionCollectionVisibility,
  resetSessionCollectionVisibility,
  toggleCollectionVisibility,
} from '@/domains/content/lib/collection-visibility';
import { isLocationVisibleInGlobalMap } from '@/domains/content/lib/document-visibility';

const UID = 'user-1';

const mkCol = (id: string, inCatalog: boolean, items: string[]): any => ({
  id, name: id, color: '#000', icon: 'folder', inCatalog,
  visibility: 'private', __items: items,
});

function setupCollections(cols: any[]) {
  (collectionService.findByUser as any).mockResolvedValue(cols);
  (collectionService.getItems as any).mockImplementation(async (cid: string) => {
    const c = cols.find(x => x.id === cid);
    return (c?.__items || []).map((id: string) => ({
      id: `${cid}-${id}`, collectionId: cid, itemType: 'place', itemId: id, position: 0,
    }));
  });
}

const loc = (id: string, isApproved: boolean): any => ({ id, isApproved });

describe('isLocationVisibleInGlobalMap (matriz ADR-004)', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    resetSessionCollectionVisibility();
    vi.clearAllMocks();
  });

  it('aprobado sin colección catálogo → visible', async () => {
    setupCollections([]);
    await initSessionCollectionVisibility(UID);
    expect(isLocationVisibleInGlobalMap(loc('a', true))).toBe(true);
  });

  it('aprobado con colección catálogo visible (default) → visible', async () => {
    setupCollections([mkCol('c1', true, ['a'])]);
    await initSessionCollectionVisibility(UID);
    expect(isLocationVisibleInGlobalMap(loc('a', true))).toBe(true);
  });

  it('aprobado con colección catálogo OCULTA → NO visible', async () => {
    setupCollections([mkCol('c1', true, ['a'])]);
    await initSessionCollectionVisibility(UID);
    await toggleCollectionVisibility(mkCol('c1', true, ['a'])); // off
    expect(isLocationVisibleInGlobalMap(loc('a', true))).toBe(false);
  });

  it('aprobado en 2 catálogo, una visible → visible', async () => {
    setupCollections([mkCol('c1', true, ['a']), mkCol('c2', true, ['a'])]);
    await initSessionCollectionVisibility(UID);
    await toggleCollectionVisibility(mkCol('c1', true, ['a'])); // c1 off, c2 on
    expect(isLocationVisibleInGlobalMap(loc('a', true))).toBe(true);
  });

  it('no aprobado sin colección privada visible → NO visible', async () => {
    setupCollections([mkCol('p1', false, ['a'])]);
    await initSessionCollectionVisibility(UID);
    expect(isLocationVisibleInGlobalMap(loc('a', false))).toBe(false);
  });

  it('no aprobado con colección PRIVADA visible → visible (forzado)', async () => {
    setupCollections([mkCol('p1', false, ['a'])]);
    await initSessionCollectionVisibility(UID);
    await toggleCollectionVisibility(mkCol('p1', false, ['a'])); // privada → on
    expect(isLocationVisibleInGlobalMap(loc('a', false))).toBe(true);
  });
});
