import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveVisibility,
  applyVisibilityFromPanel,
  type LayerVisibilityState,
  type MarkerContext,
} from '@/hooks/use-layer-visibility';

// ── resolveVisibility ─────────────────────────────────────────

describe('resolveVisibility', () => {
  const baseLayers: LayerVisibilityState = {
    own: { visible: true, entityHidden: [], minVisibilityZooms: new Map() },
    catalog: { visible: true, entityHidden: [], minVisibilityZooms: new Map() },
    workspace: { visible: false, entityHidden: [], minVisibilityZooms: new Map() },
    followed: { visible: true, entityHidden: ['hidden-user-1'], minVisibilityZooms: new Map() },
  };

  it('returns visible for an active layer', () => {
    const ctx: MarkerContext = { layerType: 'own' };
    const result = resolveVisibility(ctx, 10, baseLayers);
    expect(result.opacity).toBe(1);
    expect(result.pointerEvents).toBe('auto');
  });

  it('returns hidden for a disabled layer', () => {
    const ctx: MarkerContext = { layerType: 'workspace' };
    const result = resolveVisibility(ctx, 10, baseLayers);
    expect(result.opacity).toBe(0);
    expect(result.pointerEvents).toBe('none');
  });

  it('returns hidden for an entity in entityHidden list', () => {
    const ctx: MarkerContext = { layerType: 'followed', entityId: 'hidden-user-1' };
    const result = resolveVisibility(ctx, 10, baseLayers);
    expect(result.opacity).toBe(0);
  });

  it('returns visible for an entity NOT in entityHidden list', () => {
    const ctx: MarkerContext = { layerType: 'followed', entityId: 'visible-user-2' };
    const result = resolveVisibility(ctx, 10, baseLayers);
    expect(result.opacity).toBe(1);
  });

  it('returns hidden when zoom is below minVisibilityZoom for entity', () => {
    const layers: LayerVisibilityState = {
      ...baseLayers,
      catalog: {
        visible: true,
        entityHidden: [],
        minVisibilityZooms: new Map([['entity-a', 12]]),
      },
    };
    const ctx: MarkerContext = { layerType: 'catalog', entityId: 'entity-a' };
    expect(resolveVisibility(ctx, 8, layers).opacity).toBe(0);
    expect(resolveVisibility(ctx, 12, layers).opacity).toBe(1);
    expect(resolveVisibility(ctx, 15, layers).opacity).toBe(1);
  });

  it('returns hidden for unknown layer type', () => {
    const ctx: MarkerContext = { layerType: 'nonexistent' as any };
    const result = resolveVisibility(ctx, 10, baseLayers);
    expect(result.opacity).toBe(0);
  });

  it('handles null minVisibilityZoom (no restriction)', () => {
    const layers: LayerVisibilityState = {
      ...baseLayers,
      catalog: {
        visible: true,
        entityHidden: [],
        minVisibilityZooms: new Map([['entity-b', null]]),
      },
    };
    const ctx: MarkerContext = { layerType: 'catalog', entityId: 'entity-b' };
    expect(resolveVisibility(ctx, 1, layers).opacity).toBe(1);
  });
});

// ── applyVisibilityFromPanel ──────────────────────────────────

describe('applyVisibilityFromPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists toggle to localStorage', () => {
    // Initialize storage with defaults
    localStorage.setItem('vandits-layer-visibility', JSON.stringify({
      own: { visible: true },
      catalog: { visible: true },
      workspace: { visible: false },
      followed: { visible: true, entityHidden: [] },
      routes: { visible: true },
      points: { visible: true },
    }));

    applyVisibilityFromPanel({ catalog: false });

    const stored = JSON.parse(localStorage.getItem('vandits-layer-visibility')!);
    expect(stored.catalog.visible).toBe(false);
    expect(stored.own.visible).toBe(true); // unchanged
  });

  it('emits layer-visibility-changed event', () => {
    localStorage.setItem('vandits-layer-visibility', JSON.stringify({
      own: { visible: true },
      catalog: { visible: true },
      workspace: { visible: false },
      followed: { visible: true, entityHidden: [] },
      routes: { visible: true },
      points: { visible: true },
    }));

    const handler = vi.fn();
    window.addEventListener('layer-visibility-changed', handler);

    applyVisibilityFromPanel({ workspace: true });

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('layer-visibility-changed', handler);
  });
});
