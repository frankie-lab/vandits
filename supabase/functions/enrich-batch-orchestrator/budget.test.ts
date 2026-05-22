// Deno unit tests for the P2 orchestrator budget guard.
// Run: deno test supabase/functions/enrich-batch-orchestrator/budget.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateBudget,
  RunBudgetSnapshot,
  validateSeedConfig,
} from "./budget.ts";

const baseRun = (over: Partial<RunBudgetSnapshot> = {}): RunBudgetSnapshot => ({
  status: "running",
  max_ai_calls: 25,
  ai_calls_used: 0,
  max_runtime_minutes: 60,
  max_error_rate_pct: 5,
  started_at: new Date(Date.now() - 60_000).toISOString(),
  metrics: { success: 0, fail: 0, skip: 0, noop: 0 },
  ...over,
});

Deno.test("continue when fresh", () => {
  assertEquals(evaluateBudget(baseRun()).action, "continue");
});

Deno.test("pause when max_ai_calls reached", () => {
  const v = evaluateBudget(baseRun({ ai_calls_used: 25 }));
  assertEquals(v.action, "pause");
  if (v.action === "pause") assertEquals(v.reason, "max_ai_calls_reached");
});

Deno.test("pause when runtime exceeded", () => {
  const v = evaluateBudget(
    baseRun({
      max_runtime_minutes: 30,
      started_at: new Date(Date.now() - 31 * 60_000).toISOString(),
    }),
  );
  assertEquals(v.action, "pause");
  if (v.action === "pause") assertEquals(v.reason, "max_runtime_reached");
});

Deno.test("abort when error rate > threshold after >=50 finalised", () => {
  const v = evaluateBudget(
    baseRun({
      metrics: { success: 90, fail: 10, skip: 0, noop: 0 },
      max_error_rate_pct: 5,
    }),
  );
  assertEquals(v.action, "abort");
  if (v.action === "abort") assertEquals(v.reason, "error_rate_exceeded");
});

Deno.test("error rate ignored below 50 finalised", () => {
  const v = evaluateBudget(
    baseRun({ metrics: { success: 10, fail: 5, skip: 0, noop: 0 } }),
  );
  assertEquals(v.action, "continue");
});

Deno.test("manual pause respected", () => {
  const v = evaluateBudget(baseRun({ status: "paused" }));
  assertEquals(v.action, "pause");
  if (v.action === "pause") assertEquals(v.reason, "already_paused");
});

Deno.test("terminal statuses abort the loop", () => {
  for (const s of ["aborted", "completed"]) {
    const v = evaluateBudget(baseRun({ status: s }));
    assertEquals(v.action, "abort");
  }
});

Deno.test("seed config: rejects oversized scope without confirm_full_run", () => {
  const err = validateSeedConfig({
    scope_count: 1259,
    max_ai_calls: 1259,
    confirm_full_run: false,
  });
  assertEquals(err, "full_run_requires_confirm_full_run_flag");
});

Deno.test("seed config: requires max_ai_calls >= scope_count for full run", () => {
  const err = validateSeedConfig({
    scope_count: 1259,
    max_ai_calls: 500,
    confirm_full_run: true,
  });
  assertEquals(err, "full_run_requires_max_ai_calls_gte_scope_count");
});

Deno.test("seed config: pilot 25 passes", () => {
  assertEquals(
    validateSeedConfig({
      scope_count: 25,
      max_ai_calls: 25,
      confirm_full_run: false,
    }),
    null,
  );
});

Deno.test("seed config: pilot 50 passes", () => {
  assertEquals(
    validateSeedConfig({
      scope_count: 50,
      max_ai_calls: 50,
      confirm_full_run: false,
    }),
    null,
  );
});

Deno.test("seed config: full run 1259 with confirm and adequate budget passes", () => {
  assertEquals(
    validateSeedConfig({
      scope_count: 1259,
      max_ai_calls: 1259,
      confirm_full_run: true,
    }),
    null,
  );
});

Deno.test("seed config: rejects zero/negative", () => {
  assertEquals(
    validateSeedConfig({
      scope_count: 0,
      max_ai_calls: 25,
      confirm_full_run: false,
    }),
    "scope_count_must_be_positive",
  );
  assertEquals(
    validateSeedConfig({
      scope_count: 25,
      max_ai_calls: 0,
      confirm_full_run: false,
    }),
    "max_ai_calls_must_be_positive",
  );
});
