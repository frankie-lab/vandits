import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies BEFORE importing the helper.
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
  getVisibleCollectionIds,
  getTintForLocation,
  isCollectionVisible,
} from '@/domains/content/lib/collection-visibility';

const UID = 'user-1';

const cat = (id: string, color = '#ff0000', items: string[] = []): any => ({
  id,
  name: `c-${id}`,
  color,
  icon: 'folder',
  inCatalog: true,
  visibility: 'private',
  __items: items,
});
const priv = (id: string, color = '#00ff00', items: string[] = []): any => ({
  id,
  name: `p-${id}`,
  color,
  icon: 'folder',
  inCatalog: false,
  visibility: 'private',
  __items: items,
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

describe('collection-visibility', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetSessionCollectionVisibility();
    vi.clearAllMocks();
  });

  it('first login: catálogo visible, privadas ocultas por defecto', async () => {
    setupCollections([cat('c1', '#f00', ['p1']), priv('p1', '#0f0', ['p1'])]);
    await initSessionCollectionVisibility(UID);
    const visible = getVisibleCollectionIds();
    expect(visible.has('c1')).toBe(true);
    expect(visible.has('p1')).toBe(false);
  });

  it('toggle persiste en sessionStorage entre re-init', async () => {
    setupCollections([cat('c1', '#f00', ['p1'])]);
    await initSessionCollectionVisibility(UID);
    await toggleCollectionVisibility(cat('c1', '#f00', ['p1']));
    expect(isCollectionVisible('c1')).toBe(false);

    // Simular un reload: limpiar memoria pero NO sessionStorage.
    resetMemoryOnly();
    await initSessionCollectionVisibility(UID);
    expect(isCollectionVisible('c1')).toBe(false);
  });

  it('re-init idempotente con el mismo userId no borra el estado', async () => {
    setupCollections([cat('c1', '#f00', ['p1'])]);
    await initSessionCollectionVisibility(UID);
    expect(isCollectionVisible('c1')).toBe(true);
    await initSessionCollectionVisibility(UID);
    expect(isCollectionVisible('c1')).toBe(true);
  });

  it('getTintForLocation devuelve el color de la primera colección visible', async () => {
    setupCollections([cat('c1', '#abcdef', ['locA']), cat('c2', '#123456', ['locA'])]);
    await initSessionCollectionVisibility(UID);
    expect(getTintForLocation('locA')).toBe('#abcdef');
  });

  it('toggle de privada la añade como visible y permite tint', async () => {
    setupCollections([priv('p1', '#0f0', ['locB'])]);
    await initSessionCollectionVisibility(UID);
    expect(getTintForLocation('locB')).toBeNull();
    await toggleCollectionVisibility(priv('p1', '#0f0', ['locB']));
    expect(getTintForLocation('locB')).toBe('#0f0');
  });

  it('emite COLLECTION_VISIBILITY_EVENT al togglear', async () => {
    setupCollections([cat('c1', '#f00', ['x'])]);
    await initSessionCollectionVisibility(UID);
    const spy = vi.fn();
    window.addEventListener('collection-visibility-changed', spy);
    await toggleCollectionVisibility(cat('c1', '#f00', ['x']));
    expect(spy).toHaveBeenCalled();
    window.removeEventListener('collection-visibility-changed', spy);
  });
});

// Helper: limpiar solo la memoria del módulo (no sessionStorage).
function resetMemoryOnly() {
  // Truco: usamos resetSessionCollectionVisibility tras volcar y restaurar storage.
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i)!;
    snapshot[k] = sessionStorage.getItem(k)!;
  }
  resetSessionCollectionVisibility();
  for (const [k, v] of Object.entries(snapshot)) sessionStorage.setItem(k, v);
}
