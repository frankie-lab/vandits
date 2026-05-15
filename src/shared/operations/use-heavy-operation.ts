/**
 * useHeavyOperation — thin React wrapper around heavy-operations-store.
 *
 * Indeterminate-by-default. Use directly from event handlers; ALWAYS call
 * `start` BEFORE the heavy work (e.g. setFilters) so the badge appears in
 * the next React frame.
 *
 * See mem://logic/operations/heavy-operations-feedback.
 */
import { useMemo } from 'react';
import {
  startOperation,
  markRunning,
  setProgress,
  finishOperation,
  failOperation,
  useHeavyOpsStore,
  type StartOperationInput,
} from './heavy-operations-store';

export function useHeavyOperation() {
  return useMemo(
    () => ({
      start: (input: StartOperationInput) => startOperation(input),
      markRunning,
      setProgress,
      finish: finishOperation,
      fail: failOperation,
      isActive: (operationId: string) => {
        const op = useHeavyOpsStore.getState().ops[operationId];
        return !!op && (op.status === 'pending' || op.status === 'running');
      },
    }),
    [],
  );
}
