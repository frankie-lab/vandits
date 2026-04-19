/**
 * Tests for the marker-size-config Level-B channel.
 *
 * This module is intentionally a singleton with its own listener bus
 * (NOT the preferences bus) — it is admin-level visual config. These
 * tests pin its public contract so refactors don't silently break the
 * map renderer that depends on it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  },
}));

import {
  getMarkerSizeConfig,
  updateMarkerSizeConfig,
  invalidateMarkerSizeCache,
  onMarkerSizeConfigChange,
  type MarkerSizeMap,
} from '@/components/map/useMarkerSizeConfig';

describe('useMarkerSizeConfig (Level-B singleton)', () => {
  beforeEach(() => {
    invalidateMarkerSizeCache();
  });

  it('getMarkerSizeConfig returns defaults synchronously before any fetch resolves', () => {
    const cfg = getMarkerSizeConfig();
    expect(cfg).toBeDefined();
    expect(cfg.enriched).toBeDefined();
    expect(cfg.enriched.base_normal).toBeGreaterThan(0);
    expect(cfg.imported).toBeDefined();
    expect(cfg.empty).toBeDefined();
  });

  it('updateMarkerSizeConfig notifies all subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onMarkerSizeConfigChange(a);
    const unsubB = onMarkerSizeConfigChange(b);

    const next: MarkerSizeMap = {
      ...getMarkerSizeConfig(),
      enriched: {
        base_normal: 99,
        base_selected: 99,
        base_focused: 99,
        base_recent: 99,
        hover_size: null,
        marker_shape: 'circle',
        fill_color: '#000',
        fill_color_light: '#fff',
      },
    };
    updateMarkerSizeConfig(next);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0].enriched.base_normal).toBe(99);

    unsubA();
    unsubB();
  });

  it('onMarkerSizeConfigChange returns a working unsubscribe', () => {
    const fn = vi.fn();
    const unsub = onMarkerSizeConfigChange(fn);
    unsub();

    updateMarkerSizeConfig(getMarkerSizeConfig());
    expect(fn).not.toHaveBeenCalled();
  });

  it('invalidateMarkerSizeCache resets the cache so getMarkerSizeConfig falls back to defaults', () => {
    const custom: MarkerSizeMap = {
      ...getMarkerSizeConfig(),
      home: {
        base_normal: 1,
        base_selected: 1,
        base_focused: 1,
        base_recent: 1,
        hover_size: null,
        marker_shape: 'circle',
        fill_color: '#000',
        fill_color_light: '#fff',
      },
    };
    updateMarkerSizeConfig(custom);
    expect(getMarkerSizeConfig().home.base_normal).toBe(1);

    invalidateMarkerSizeCache();
    // After invalidation the next sync read returns defaults until fetch resolves.
    expect(getMarkerSizeConfig().home.base_normal).not.toBe(1);
  });
});
