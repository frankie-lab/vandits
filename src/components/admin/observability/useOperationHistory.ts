/**
 * useOperationHistory (PR-BACKOFFICE-UX-CLOSURE-1 — Sec. 4).
 *
 * Observabilidad mínima por panel sin schema nuevo. Persiste en localStorage
 * (por usuario / por navegador) las últimas 10 ejecuciones de un opKey.
 *
 * Decisión explícita: NO tabla `operation_runs` en esta fase. Se prioriza
 * cero deuda de schema sobre compartir historial entre operadores.
 */
import { useCallback, useEffect, useState } from 'react';

export type OperationStatus = 'ok' | 'error' | 'cancelled' | 'running';

export interface OperationRun {
  id: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  status: OperationStatus;
  scope?: string;
  summary?: string;
}

const MAX_RUNS = 10;
const STORAGE_PREFIX = 'lovable:op-history:';

function readStore(opKey: string): OperationRun[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + opKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStore(opKey: string, runs: OperationRun[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + opKey, JSON.stringify(runs.slice(0, MAX_RUNS)));
    window.dispatchEvent(new CustomEvent('lovable:op-history-changed', { detail: { opKey } }));
  } catch {
    /* quota — silent */
  }
}

export interface OperationHandle {
  complete: (result: Omit<Partial<OperationRun>, 'id' | 'startedAt'>) => void;
}

export function useOperationHistory(opKey: string) {
  const [runs, setRuns] = useState<OperationRun[]>(() => readStore(opKey));

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.opKey === opKey) setRuns(readStore(opKey));
    }
    window.addEventListener('lovable:op-history-changed', onChange);
    return () => window.removeEventListener('lovable:op-history-changed', onChange);
  }, [opKey]);

  const start = useCallback((scope?: string): OperationHandle => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const current = readStore(opKey);
    writeStore(opKey, [{ id, startedAt, status: 'running', scope }, ...current]);
    return {
      complete: (result) => {
        const finishedAt = Date.now();
        const updated = readStore(opKey).map(r =>
          r.id === id
            ? { ...r, ...result, finishedAt, durationMs: finishedAt - r.startedAt, status: result.status ?? 'ok' }
            : r,
        );
        writeStore(opKey, updated);
      },
    };
  }, [opKey]);

  const last = runs.find(r => r.status !== 'running');
  const running = runs.find(r => r.status === 'running');

  return { runs, last, running, start };
}
