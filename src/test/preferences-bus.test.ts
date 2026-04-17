import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitPrefChanged, onPrefChanged } from '@/shared/preferences/preferencesBus';

describe('preferencesBus (bridge)', () => {
  beforeEach(() => {
    // No-op; window event bus is global, listeners are explicitly torn down per test.
  });

  it('delivers an emitted change to subscribers', () => {
    const spy = vi.fn();
    const unsub = onPrefChanged(spy);

    emitPrefChanged({
      unitId: 'ux.appearance',
      scope: 'user',
      overrides: { theme: 'dark' },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      unitId: 'ux.appearance',
      scope: 'user',
      overrides: { theme: 'dark' },
    });

    unsub();
  });

  it('stops delivering after unsubscribe', () => {
    const spy = vi.fn();
    const unsub = onPrefChanged(spy);
    unsub();

    emitPrefChanged({ unitId: 'ux.audio', scope: 'user', overrides: { muted: true } });

    expect(spy).not.toHaveBeenCalled();
  });

  it('supports multiple independent subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onPrefChanged(a);
    const unsubB = onPrefChanged(b);

    emitPrefChanged({ unitId: 'ux.layout', scope: 'system', overrides: { density: 'compact' } });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubA();
    emitPrefChanged({ unitId: 'ux.layout', scope: 'system', overrides: { density: 'cozy' } });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    unsubB();
  });
});
