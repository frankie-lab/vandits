import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyDispatch,
  DEFENSE_SKIP_REASONS,
  verifyPersistence,
} from "./dispatch-outcome.ts";

// ---------- classifyDispatch ----------

Deno.test("classifyDispatch: HTTP 500 -> fail http_500", () => {
  const v = classifyDispatch(false, 500, { error: "boom" });
  assertEquals(v.kind, "fail");
  if (v.kind === "fail") assertEquals(v.reason, "http_500:boom");
});

Deno.test("classifyDispatch: HTTP 200 success:false name_coordinate_mismatch -> skip:defense_*", () => {
  const v = classifyDispatch(true, 200, { success: false, reason: "name_coordinate_mismatch" });
  assertEquals(v.kind, "skip");
  if (v.kind === "skip") assertEquals(v.reason, "defense_name_coordinate_mismatch");
});

Deno.test("classifyDispatch: every catalogued defense reason maps to defense_*", () => {
  for (const r of DEFENSE_SKIP_REASONS) {
    const v = classifyDispatch(true, 200, { success: false, reason: r });
    assertEquals(v.kind, "skip", `reason=${r}`);
    if (v.kind === "skip") assertEquals(v.reason, `defense_${r}`);
  }
});

Deno.test("classifyDispatch: unknown success:false reason -> defense_other:<reason>", () => {
  const v = classifyDispatch(true, 200, { success: false, reason: "exotic_failure_mode" });
  assertEquals(v.kind, "skip");
  if (v.kind === "skip") assertEquals(v.reason, "defense_other:exotic_failure_mode");
});

Deno.test("classifyDispatch: success:true without data -> fail no_data_in_response", () => {
  const v = classifyDispatch(true, 200, { success: true });
  assertEquals(v.kind, "fail");
  if (v.kind === "fail") assertEquals(v.reason, "no_data_in_response");
});

Deno.test("classifyDispatch: success:true with data -> needs_persist", () => {
  const v = classifyDispatch(true, 200, { success: true, data: { descripcion: "x" } });
  assertEquals(v.kind, "needs_persist");
});

// ---------- verifyPersistence ----------
// This is the CRITICAL guard. enrich-location is a pure function that
// returns generated content WITHOUT persisting (root cause of the pilot-25
// false-success bug). The orchestrator must always verify post-write.

Deno.test("verifyPersistence: missing row -> fail no_row", () => {
  const v = verifyPersistence(null, null);
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.reason, "success_without_persist:no_row");
});

Deno.test("verifyPersistence: descripcion_present=false -> fail no_descripcion", () => {
  const v = verifyPersistence(
    { descripcion_present: false, updated_at: new Date().toISOString() },
    null,
  );
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.reason, "success_without_persist:no_descripcion");
});

Deno.test("verifyPersistence: descripcion ok but updated_at NOT advanced -> fail", () => {
  const baseline = "2026-05-11T15:01:30Z";
  const v = verifyPersistence(
    { descripcion_present: true, updated_at: baseline }, // same instant
    baseline,
  );
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.reason, "success_without_persist:updated_at_not_advanced");
});

Deno.test("verifyPersistence: descripcion ok AND updated_at advanced -> ok", () => {
  const baseline = "2026-05-11T15:01:30Z";
  const after = "2026-05-22T10:00:00Z";
  const v = verifyPersistence(
    { descripcion_present: true, updated_at: after },
    baseline,
  );
  assertEquals(v.ok, true);
});

Deno.test("verifyPersistence: pilot-25 regression — pilot's '5 success' rows MUST fail verification", () => {
  // All 5 pilot-25 'success' rows had: enriched_data without descripcion,
  // updated_at frozen at 2026-05-11 (baseline pre-pilot). The orchestrator
  // marked them success. With the new verifier they MUST flip to fail.
  const baseline = "2026-05-22T09:30:55Z"; // claim time
  const stillPreClaim = "2026-05-11T15:01:30Z";
  const v = verifyPersistence(
    { descripcion_present: false, updated_at: stillPreClaim },
    baseline,
  );
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.reason, "success_without_persist:no_descripcion");
});
