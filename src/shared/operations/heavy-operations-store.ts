/**
 * heavy-operations-store — Cross-cutting feedback for heavy client ops.
 *
 * Phase 1 wiring: only `MyCatalogQuickFilters` (popover) starts ops here.
 * Other sources (`enrichment`, `import`, `geocoding`, `render`) are declared
 * but not wired yet — they have their own dedicated lanes / stores.
 *
 * Contract:
 *   - `startOperation` returns false when `blockReentry` and an op with the
 *     same `operationId` is already pending/running. Caller must early-return.
 *   - Lifecycle: pending → (markRunning?) → done | error.
 *   - Indeterminate by default. `setProgress` flips to determinate (and only
 *     then `progress`/`etaMs` are exposed). ETA is NEVER inferred.
 *   - Auto-purge: `done` after 1.5s, `error` after 4s.
 *   - Safety timeout: every op carries an internal watchdog (default 10s for
 *     `filter`). If still pending/running on expiry → `failOperation` with
 *     'Tiempo agotado…'. This guards against missing finish events.
 *
 * See mem://logic/operations/heavy-operations-feedback.
 */
import { create } from 'zustand';

export type HeavyOpStatus = 'pending' | 'running' | 'done' | 'error';
export type HeavyOpSource =
  | 'filter'
  | 'subset-fit'
  | 'enrichment'
  | 'import'
  | 'geocoding'
  | 'render';

export interface HeavyOperation {
  operationId: string;
  label: string;
  status: HeavyOpStatus;
  source: HeavyOpSource;
  indeterminate: boolean;
  progress: number | null;
  etaMs: number | null;
  startedAt: number;
  finishedAt?: number;
  blockReentry?: boolean;
  resultLabel?: string;
  errorMessage?: string;
}

export interface StartOperationInput {
  operationId: string;
  label: string;
  source: HeavyOpSource;
  indeterminate?: boolean;
  blockReentry?: boolean;
  /** Safety watchdog in ms. Defaults: filter 10000, others 30000. */
  safetyTimeoutMs?: number;
  safetyMessage?: string;
}

interface HeavyOpsState {
  ops: Record<string, HeavyOperation>;
}

const DEFAULT_TIMEOUT: Record<HeavyOpSource, number> = {
  filter: 10000,
  'subset-fit': 10000,
  enrichment: 0, // 0 = no watchdog
  import: 0,
  geocoding: 0,
  render: 15000,
};

const PURGE_DONE_MS = 1500;
const PURGE_ERROR_MS = 4000;

const watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
const purges = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimers(opId: string) {
  const w = watchdogs.get(opId);
  if (w) {
    clearTimeout(w);
    watchdogs.delete(opId);
  }
  const p = purges.get(opId);
  if (p) {
    clearTimeout(p);
    purges.delete(opId);
  }
}

export const useHeavyOpsStore = create<HeavyOpsState>(() => ({ ops: {} }));

function isAlive(op: HeavyOperation | undefined): boolean {
  return !!op && (op.status === 'pending' || op.status === 'running');
}

export function startOperation(input: StartOperationInput): boolean {
  const { operationId, label, source } = input;
  const indeterminate = input.indeterminate ?? true;
  const blockReentry = input.blockReentry ?? false;

  const existing = useHeavyOpsStore.getState().ops[operationId];
  if (blockReentry && isAlive(existing)) return false;

  // If a stale done/error sits under the same id, drop it before reusing.
  clearTimers(operationId);

  const op: HeavyOperation = {
    operationId,
    label,
    source,
    status: 'pending',
    indeterminate,
    progress: indeterminate ? null : 0,
    etaMs: null,
    startedAt: Date.now(),
    blockReentry,
  };

  useHeavyOpsStore.setState((s) => ({ ops: { ...s.ops, [operationId]: op } }));

  const timeoutMs = input.safetyTimeoutMs ?? DEFAULT_TIMEOUT[source];
  if (timeoutMs > 0) {
    const handle = setTimeout(() => {
      const cur = useHeavyOpsStore.getState().ops[operationId];
      if (isAlive(cur)) {
        failOperation(
          operationId,
          input.safetyMessage ?? 'Tiempo agotado aplicando operación',
        );
      }
    }, timeoutMs);
    watchdogs.set(operationId, handle);
  }

  return true;
}

export function markRunning(
  operationId: string,
  patch?: Partial<Pick<HeavyOperation, 'label'>>,
): void {
  useHeavyOpsStore.setState((s) => {
    const cur = s.ops[operationId];
    if (!cur || cur.status === 'done' || cur.status === 'error') return s;
    return {
      ops: {
        ...s.ops,
        [operationId]: { ...cur, ...patch, status: 'running' },
      },
    };
  });
}

export function setProgress(
  operationId: string,
  pct: number,
  etaMs?: number | null,
): void {
  useHeavyOpsStore.setState((s) => {
    const cur = s.ops[operationId];
    if (!cur || cur.status === 'done' || cur.status === 'error') return s;
    const clamped = Math.max(0, Math.min(100, pct));
    return {
      ops: {
        ...s.ops,
        [operationId]: {
          ...cur,
          status: cur.status === 'pending' ? 'running' : cur.status,
          indeterminate: false,
          progress: clamped,
          etaMs: typeof etaMs === 'number' ? etaMs : cur.etaMs,
        },
      },
    };
  });
}

export function finishOperation(
  operationId: string,
  opts?: { resultLabel?: string },
): void {
  const cur = useHeavyOpsStore.getState().ops[operationId];
  if (!cur) return;
  clearTimers(operationId);
  useHeavyOpsStore.setState((s) => ({
    ops: {
      ...s.ops,
      [operationId]: {
        ...cur,
        status: 'done',
        finishedAt: Date.now(),
        resultLabel: opts?.resultLabel ?? cur.resultLabel,
      },
    },
  }));
  const handle = setTimeout(() => {
    useHeavyOpsStore.setState((s) => {
      if (!s.ops[operationId]) return s;
      const next = { ...s.ops };
      delete next[operationId];
      return { ops: next };
    });
    purges.delete(operationId);
  }, PURGE_DONE_MS);
  purges.set(operationId, handle);
}

export function failOperation(operationId: string, errorMessage: string): void {
  const cur = useHeavyOpsStore.getState().ops[operationId];
  if (!cur) return;
  clearTimers(operationId);
  useHeavyOpsStore.setState((s) => ({
    ops: {
      ...s.ops,
      [operationId]: {
        ...cur,
        status: 'error',
        finishedAt: Date.now(),
        errorMessage,
        resultLabel: errorMessage,
      },
    },
  }));
  const handle = setTimeout(() => {
    useHeavyOpsStore.setState((s) => {
      if (!s.ops[operationId]) return s;
      const next = { ...s.ops };
      delete next[operationId];
      return { ops: next };
    });
    purges.delete(operationId);
  }, PURGE_ERROR_MS);
  purges.set(operationId, handle);
}

export function getActiveOperations(): HeavyOperation[] {
  return Object.values(useHeavyOpsStore.getState().ops);
}

export function useActiveHeavyOperations(): HeavyOperation[] {
  // Select the stable `ops` record reference; derive array via useMemo so we
  // don't return a fresh array each render (which would loop useSyncExternalStore).
  const ops = useHeavyOpsStore((s) => s.ops);
  return useMemo(() => Object.values(ops), [ops]);
}
