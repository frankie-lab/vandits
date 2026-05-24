import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addGlobalEventListener,
  removeGlobalEventListener,
  dispatchGlobalEvent,
} from '@/lib/global-events';

describe('global-events typed helper baseline', () => {
  beforeEach(() => {
    // jsdom resetea window entre tests; nada más que hacer.
  });

  it('listener sin payload recibe el dispatch', () => {
    const handler = vi.fn();
    const off = addGlobalEventListener('admin:open-geography', handler);
    dispatchGlobalEvent('admin:open-geography');
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it('listener con payload tipado recibe detail.tab', () => {
    const handler = vi.fn();
    const off = addGlobalEventListener('vandits:open-profile', (detail) => {
      handler(detail?.tab);
    });
    dispatchGlobalEvent('vandits:open-profile', { tab: 'travel' });
    expect(handler).toHaveBeenCalledWith('travel');
    off();
  });

  it('unsubscribe devuelto deja de recibir eventos', () => {
    const handler = vi.fn();
    const off = addGlobalEventListener('admin:open-data-sources', handler);
    dispatchGlobalEvent('admin:open-data-sources');
    off();
    dispatchGlobalEvent('admin:open-data-sources');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removeGlobalEventListener deja de recibir eventos', () => {
    const handler = vi.fn();
    addGlobalEventListener('enrichment-criteria-changed', handler);
    dispatchGlobalEvent('enrichment-criteria-changed');
    removeGlobalEventListener('enrichment-criteria-changed', handler);
    dispatchGlobalEvent('enrichment-criteria-changed');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('pending-validations-updated entrega { count, names }', () => {
    const handler = vi.fn();
    const off = addGlobalEventListener('pending-validations-updated', (detail) => {
      handler(detail.count, detail.names);
    });
    dispatchGlobalEvent('pending-validations-updated', {
      count: 3,
      names: ['a', 'b', 'c'],
    });
    expect(handler).toHaveBeenCalledWith(3, ['a', 'b', 'c']);
    off();
  });

  it('vandits:open-profile entrega { tab }', () => {
    const received: Array<{ tab?: string }> = [];
    const off = addGlobalEventListener('vandits:open-profile', (detail) => {
      received.push(detail);
    });
    dispatchGlobalEvent('vandits:open-profile', { tab: 'map' });
    dispatchGlobalEvent('vandits:open-profile', {});
    expect(received).toEqual([{ tab: 'map' }, {}]);
    off();
  });

  it('duplicate-threshold-changed entrega { threshold }', () => {
    const handler = vi.fn();
    const off = addGlobalEventListener('duplicate-threshold-changed', (detail) => {
      handler(detail.threshold);
    });
    dispatchGlobalEvent('duplicate-threshold-changed', { threshold: 250 });
    expect(handler).toHaveBeenCalledWith(250);
    off();
  });

  it('icon-library-changed entrega { library }', () => {
    const handler = vi.fn();
    const off = addGlobalEventListener('icon-library-changed', (detail) => {
      handler(detail.library);
    });
    dispatchGlobalEvent('icon-library-changed', { library: 'phosphor' });
    expect(handler).toHaveBeenCalledWith('phosphor');
    off();
  });

  it('personal-categories:reload funciona sin payload', () => {
    const handler = vi.fn();
    const off = addGlobalEventListener('personal-categories:reload', handler);
    dispatchGlobalEvent('personal-categories:reload');
    dispatchGlobalEvent('personal-categories:reload');
    expect(handler).toHaveBeenCalledTimes(2);
    off();
  });

  it('trash-updated funciona sin payload', () => {
    const handler = vi.fn();
    const off = addGlobalEventListener('trash-updated', handler);
    dispatchGlobalEvent('trash-updated');
    dispatchGlobalEvent('trash-updated');
    expect(handler).toHaveBeenCalledTimes(2);
    off();
  });
});
