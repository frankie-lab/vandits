// scripts/p2/lib/gates.ts
// Thin re-export of the canonical helpers in `_shared/p2/gates.ts`.
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.
export {
  detectStopConditions,
  isTerminal,
  guardBatchSize,
  type RunSnapshot,
  type StopCondition,
  type BatchSizeGuardInput,
  type BatchSizeGuardVerdict,
} from "../../../supabase/functions/_shared/p2/gates.ts";
