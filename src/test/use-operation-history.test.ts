/**
 * PR-BACKOFFICE-UX-CLOSURE-1 — Contract test de useOperationHistory.
 *
 * Verifica:
 *   - start() escribe un run 'running'
 *   - handle.complete() lo cierra con status + durationMs
 *   - se respeta el cap MAX_RUNS = 10
 *   - el storage key tiene el prefijo canon
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOperationHistory } from '@/components/admin/observability/useOperationHistory';

const OP = 'test:demo';
const KEY = 'lovable:op-history:' + OP;

beforeEach(() => {
  window.localStorage.clear();
});

describe('useOperationHistory', () => {
  it('start + complete escribe un run cerrado', async () => {
    const { result } = renderHook(() => useOperationHistory(OP));
    let handle: ReturnType<typeof result.current.start> | null = null;
    act(() => { handle = result.current.start('scope-A'); });
    expect(result.current.running?.status).toBe('running');

    await new Promise(r => setTimeout(r, 5));
    act(() => { handle!.complete({ status: 'ok', summary: 'done' }); });

    expect(result.current.running).toBeUndefined();
    expect(result.current.last?.status).toBe('ok');
    expect(result.current.last?.summary).toBe('done');
    expect(typeof result.current.last?.durationMs).toBe('number');
  });

  it('cap a MAX_RUNS = 10 ejecuciones', () => {
    const { result } = renderHook(() => useOperationHistory(OP));
    act(() => {
      for (let i = 0; i < 15; i++) {
        const h = result.current.start();
        h.complete({ status: 'ok' });
      }
    });
    const raw = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(raw.length).toBe(10);
  });

  it('usa el prefijo canon lovable:op-history:', () => {
    const { result } = renderHook(() => useOperationHistory(OP));
    act(() => { result.current.start().complete({ status: 'ok' }); });
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });
});
