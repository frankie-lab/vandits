// Minimal Deno tests for the P2 dev runner.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSeedCandidates } from "../lib/seed.ts";
import { guardBatchSize, detectStopConditions, isTerminal } from "../lib/gates.ts";
import { evaluatePilot100 } from "../lib/pilot100-gate.ts";
import { renderReportBody } from "../lib/report.ts";

Deno.test("1. status is read-only — buildSeedCandidates pure", () => {
  const rows = [{ id: "x", name: "Test", latitude: 0, longitude: 0 }];
  const out = buildSeedCandidates(rows);
  // No throw, returns plain object. No DB, no fetch.
  assert("eligibleIds" in out && "rejected" in out);
});

Deno.test("2. next-batch blocks when active run not terminal", () => {
  assertEquals(isTerminal("running"), false);
  assertEquals(isTerminal("pending"), false);
  assertEquals(isTerminal("completed"), true);
  assertEquals(isTerminal("paused"), true);
  assertEquals(isTerminal("aborted"), true);
});

Deno.test("3. next-batch size 250 blocks when Pilot-100 not PASS", () => {
  const v = guardBatchSize({ size: 250, confirm: true, pilot100Pass: false });
  assertEquals(v.ok, false);
  assertEquals((v as any).reason, "PILOT100_GATE_FAIL");
});

Deno.test("4. batch_size > 100 requires --confirm", () => {
  const v = guardBatchSize({ size: 250, confirm: false, pilot100Pass: true });
  assertEquals(v.ok, false);
  assertEquals((v as any).reason, "CONFIRMATION_REQUIRED");
  const ok = guardBatchSize({ size: 250, confirm: true, pilot100Pass: true });
  assertEquals(ok.ok, true);
  const bad = guardBatchSize({ size: 73, confirm: true, pilot100Pass: true });
  assertEquals(bad.ok, false);
  assertEquals((bad as any).reason, "INVALID_SIZE");
});

Deno.test("5. seed excludes A/B/C/canon_gap/fixture/hardError/in_progress/enriched", () => {
  const SANDBOX = "f04b3b95-7308-4b74-b3c7-7e819767c5fb";
  const rows = [
    // D valid (ES + ok + approved + has name + no descripcion)
    { id: "d1", name: "Plaza Mayor", latitude: 40.4, longitude: -3.7, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true },
    // A: no name
    { id: "a1", name: "", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true },
    // C: hardError
    { id: "c1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "hardError", is_approved: true },
    // B: partial geo
    { id: "b1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "partial", is_approved: true },
    // canon_gap
    { id: "cg1", name: "X", latitude: 40, longitude: -3, country_code: "ZZ", country_id: "c1", geo_health: "ok", is_approved: true },
    // fixture (sandbox owner)
    { id: "fx1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true, owner_user_id: SANDBOX },
    // in_progress
    { id: "ip1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true, enrichment_status: "in_progress" },
    // already enriched
    { id: "en1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true, enriched_data: { descripcion: "abc" } },
    // nominal exclusion by name
    { id: "ne1", name: "Tolar Grande", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true },
  ];
  const out = buildSeedCandidates(rows);
  assertEquals(out.eligibleIds, ["d1"]);
  assert(out.rejected.length === rows.length - 1);
});

Deno.test("6. renderReportBody includes all mandatory sections", () => {
  const run = {
    id: "r1", label: "demo", status: "completed", scope_count: 5, chunk_size: 1,
    max_ai_calls: 5, ai_calls_used: 5, max_runtime_minutes: 60, max_error_rate_pct: 5,
    started_at: "2026-05-23T15:00:00Z", finished_at: "2026-05-23T15:10:00Z",
    created_at: "2026-05-23T14:55:00Z",
    metrics: { success: 4, fail: 0, skip: 1, noop: 0 },
  };
  const body = renderReportBody(run, [{ status: "skipped", skip_reason: "canon_gap", location_id: "x" }], [{ location_id: "x" }], []);
  for (const section of ["# P2 Dev Runner", "## Metrics", "## Persistence sample", "## Snapshots", "## Skips", "## Failures", "## Invariants", "## Recommendation"]) {
    assert(body.includes(section), `missing section: ${section}`);
  }
});

Deno.test("Pilot-100 gate evaluator", () => {
  assertEquals(evaluatePilot100(null).pass, false);
  assertEquals(evaluatePilot100({ id: "r", label: "pilot100-x", status: "running", metrics: { success: 100, fail: 0, skip: 0 } }).pass, false);
  assertEquals(evaluatePilot100({ id: "r", label: "pilot100-x", status: "completed", metrics: { success: 60, fail: 0, skip: 10 } }).pass, true);
  assertEquals(evaluatePilot100({ id: "r", label: "pilot100-x", status: "completed", metrics: { success: 60, fail: 5, skip: 10 } }).pass, false);
});

Deno.test("detectStopConditions: nominatim flagged", () => {
  const v = detectStopConditions({ status: "running", metrics: { last_errors: ["something nominatim failure"] } });
  assertEquals(v.kind, "nominatim_detected");
});
