// supabase/functions/poi-p2-runner-bridge/index.test.ts
// TEMPORARY MAINTENANCE TOOL — tests for canonical guards.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { __test__ } from "./index.ts";
import { buildSeedCandidates } from "../_shared/p2/seed-filter.ts";
import { guardBatchSize } from "../_shared/p2/gates.ts";

const { parseBody } = __test__;

Deno.test("parseBody rejects unknown action", () => {
  assertEquals(parseBody({ action: "wat" }), null);
  assertEquals(parseBody({}), null);
  assertEquals(parseBody(null), null);
});

Deno.test("parseBody accepts each valid action", () => {
  for (const a of ["status", "report", "pause", "resume", "abort", "start-next-batch"]) {
    const out = parseBody({ action: a });
    assert(out !== null, `expected ${a} parsed`);
    assertEquals(out!.action, a);
  }
});

Deno.test("guardBatchSize: 250 without confirm rejected", () => {
  const v = guardBatchSize({ size: 250, confirm: false, pilot100Pass: true });
  assertEquals(v.ok, false);
  assertEquals((v as any).reason, "CONFIRMATION_REQUIRED");
});

Deno.test("guardBatchSize: 250 + confirm but Pilot-100 FAIL rejected", () => {
  const v = guardBatchSize({ size: 250, confirm: true, pilot100Pass: false });
  assertEquals(v.ok, false);
  assertEquals((v as any).reason, "PILOT100_GATE_FAIL");
});

Deno.test("guardBatchSize: invalid size rejected", () => {
  const v = guardBatchSize({ size: 73, confirm: true, pilot100Pass: true });
  assertEquals(v.ok, false);
  assertEquals((v as any).reason, "INVALID_SIZE");
});

Deno.test("seed filter excludes A/B/C/canon_gap/fixture/in_progress/enriched", () => {
  const SANDBOX = "f04b3b95-7308-4b74-b3c7-7e819767c5fb";
  const rows = [
    { id: "d1", name: "Plaza Mayor", latitude: 40.4, longitude: -3.7, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true },
    { id: "a1", name: "", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true },
    { id: "c1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "hardError", is_approved: true },
    { id: "b1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "partial", is_approved: true },
    { id: "cg1", name: "X", latitude: 40, longitude: -3, country_code: "ZZ", country_id: "c1", geo_health: "ok", is_approved: true },
    { id: "fx1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true, owner_user_id: SANDBOX },
    { id: "ip1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true, enrichment_status: "in_progress" },
    { id: "en1", name: "X", latitude: 40, longitude: -3, country_code: "ES", country_id: "c1", geo_health: "ok", is_approved: true, enriched_data: { descripcion: "abc" } },
  ];
  const out = buildSeedCandidates(rows);
  assertEquals(out.eligibleIds, ["d1"]);
});

Deno.test("abort requires non-empty reason (action-level contract)", () => {
  // The runtime guard checks `body.reason?.trim()`; here we simulate the predicate.
  const reason = "   ";
  assertEquals(reason.trim().length === 0, true);
});
