// Pure budget-guard helpers for the P2 server-side orchestrator.
// No IA, no DB writes. Used by the run loop AND by Deno tests.
//
// Reference: docs/audits/poi-identity-p2-server-orchestrator-plan.md §A1 + §A6.

export interface RunBudgetSnapshot {
  status: string;
  max_ai_calls: number;
  ai_calls_used: number;
  max_runtime_minutes: number;
  max_error_rate_pct: number;
  started_at?: string | null;
  metrics?: {
    success?: number;
    fail?: number;
    skip?: number;
    noop?: number;
  } | null;
}

export type BudgetVerdict =
  | { action: "continue" }
  | { action: "pause"; reason: string }
  | { action: "abort"; reason: string };

/**
 * Centralised budget guard. Called BEFORE each item dispatch and BETWEEN chunks.
 * Returns pause when the run can still be resumed (budget-style limit), and
 * abort for terminal conditions (error rate, manual abort).
 */
export function evaluateBudget(
  run: RunBudgetSnapshot,
  nowMs: number = Date.now(),
): BudgetVerdict {
  // Manual pause respected.
  if (run.status === "paused") {
    return { action: "pause", reason: "already_paused" };
  }
  if (run.status === "aborted" || run.status === "completed") {
    return { action: "abort", reason: `terminal_${run.status}` };
  }

  // 1. AI calls budget
  if (run.ai_calls_used >= run.max_ai_calls) {
    return { action: "pause", reason: "max_ai_calls_reached" };
  }

  // 2. Runtime budget (only meaningful once started)
  if (run.started_at) {
    const elapsedMin = (nowMs - Date.parse(run.started_at)) / 60_000;
    if (elapsedMin >= run.max_runtime_minutes) {
      return { action: "pause", reason: "max_runtime_reached" };
    }
  }

  // 3. Error-rate stop condition (terminal, requires manual review)
  const success = run.metrics?.success ?? 0;
  const fail = run.metrics?.fail ?? 0;
  const finalised = success + fail;
  if (finalised >= 50) {
    const ratePct = (fail / finalised) * 100;
    if (ratePct > run.max_error_rate_pct) {
      return { action: "abort", reason: "error_rate_exceeded" };
    }
  }

  return { action: "continue" };
}

/**
 * Pre-flight validation for the seed payload. Rejects oversized or unsafe
 * configurations unless the caller explicitly confirms a full run.
 */
export interface SeedConfig {
  scope_count: number;
  max_ai_calls: number;
  confirm_full_run: boolean;
}

export function validateSeedConfig(cfg: SeedConfig): string | null {
  if (cfg.scope_count <= 0) return "scope_count_must_be_positive";
  if (cfg.max_ai_calls <= 0) return "max_ai_calls_must_be_positive";
  // Full-run guard: if the scope exceeds the pilot ceiling (50),
  // the caller MUST opt in explicitly.
  if (cfg.scope_count > 50 && !cfg.confirm_full_run) {
    return "full_run_requires_confirm_full_run_flag";
  }
  if (cfg.max_ai_calls < cfg.scope_count && cfg.confirm_full_run) {
    return "full_run_requires_max_ai_calls_gte_scope_count";
  }
  return null;
}
