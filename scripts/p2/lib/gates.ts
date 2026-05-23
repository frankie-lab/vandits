// scripts/p2/lib/gates.ts
// Stop conditions + batch-size guard for the P2 dev runner.

export interface RunSnapshot {
  status: string;
  metrics?: {
    success?: number;
    fail?: number;
    skip?: number;
    noop?: number;
    last_errors?: string[];
  } | null;
  ai_calls_used?: number;
  max_ai_calls?: number;
  max_error_rate_pct?: number;
}

export type StopCondition =
  | { kind: "none" }
  | { kind: "error_rate_exceeded"; pct: number }
  | { kind: "nominatim_detected"; sample: string }
  | { kind: "ai_calls_reached" };

export function detectStopConditions(run: RunSnapshot): StopCondition {
  const success = run.metrics?.success ?? 0;
  const fail = run.metrics?.fail ?? 0;
  const finalised = success + fail;
  const cap = run.max_error_rate_pct ?? 5;
  if (finalised >= 50) {
    const pct = (fail / finalised) * 100;
    if (pct > cap) return { kind: "error_rate_exceeded", pct };
  }
  const errors = run.metrics?.last_errors ?? [];
  for (const e of errors) {
    if (/nominatim/i.test(e)) return { kind: "nominatim_detected", sample: e };
  }
  if ((run.ai_calls_used ?? 0) >= (run.max_ai_calls ?? Infinity)) {
    return { kind: "ai_calls_reached" };
  }
  return { kind: "none" };
}

export function isTerminal(status: string): boolean {
  return status === "completed" || status === "aborted" || status === "paused";
}

export interface BatchSizeGuardInput {
  size: number;
  confirm: boolean;
  pilot100Pass: boolean;
}

export type BatchSizeGuardVerdict =
  | { ok: true }
  | { ok: false; reason: "INVALID_SIZE" | "CONFIRMATION_REQUIRED" | "PILOT100_GATE_FAIL" };

/**
 * Allowed sizes: 25, 100, 250.
 * size > 100 requires both --confirm AND a passing Pilot-100 gate.
 */
export function guardBatchSize(input: BatchSizeGuardInput): BatchSizeGuardVerdict {
  if (![25, 100, 250].includes(input.size)) return { ok: false, reason: "INVALID_SIZE" };
  if (input.size > 100) {
    if (!input.confirm) return { ok: false, reason: "CONFIRMATION_REQUIRED" };
    if (!input.pilot100Pass) return { ok: false, reason: "PILOT100_GATE_FAIL" };
  }
  return { ok: true };
}
