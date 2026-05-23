// Tests for the idempotent snapshot helper.
// Run with: deno test supabase/functions/enrich-batch-orchestrator/snapshot.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  recordPreDispatchSnapshot,
  type SnapshotClientLike,
} from "./snapshot.ts";

type Row = {
  id: string;
  run_id: string;
  location_id: string;
  previous_enriched_data: unknown;
  previous_enrichment_status: string | null;
};

// In-memory client that mimics the PostgREST upsert(...).select() chain
// with `ignoreDuplicates: true` (= INSERT ... ON CONFLICT DO NOTHING).
function makeClient(): { client: SnapshotClientLike; rows: Row[] } {
  const rows: Row[] = [];
  const client: SnapshotClientLike = {
    from(_table: string) {
      return {
        upsert(values: Record<string, unknown>, options) {
          return {
            select(_cols: string) {
              const runId = values.run_id as string;
              const locId = values.location_id as string;
              const existing = rows.find(
                (r) => r.run_id === runId && r.location_id === locId,
              );
              if (existing) {
                if (options.ignoreDuplicates) {
                  // CONFLICT DO NOTHING — returns no rows.
                  return Promise.resolve({ data: [], error: null });
                }
                existing.previous_enriched_data = values.previous_enriched_data;
                existing.previous_enrichment_status =
                  values.previous_enrichment_status as string | null;
                return Promise.resolve({
                  data: [{ id: existing.id }],
                  error: null,
                });
              }
              const inserted: Row = {
                id: crypto.randomUUID(),
                run_id: runId,
                location_id: locId,
                previous_enriched_data: values.previous_enriched_data,
                previous_enrichment_status:
                  (values.previous_enrichment_status as string | null) ?? null,
              };
              rows.push(inserted);
              return Promise.resolve({
                data: [{ id: inserted.id }],
                error: null,
              });
            },
          };
        },
      };
    },
  };
  return { client, rows };
}

Deno.test("snapshot: first attempt creates row", async () => {
  const { client, rows } = makeClient();
  const r = await recordPreDispatchSnapshot(client, {
    runId: "run-1",
    locationId: "loc-1",
    previousEnrichedData: { descripcion: "ORIGINAL" },
    previousEnrichmentStatus: "imported",
  });
  assertEquals(r, { ok: true, alreadyExisted: false });
  assertEquals(rows.length, 1);
  assertEquals(
    (rows[0].previous_enriched_data as { descripcion: string }).descripcion,
    "ORIGINAL",
  );
});

Deno.test("snapshot: second attempt does NOT fail (idempotent)", async () => {
  const { client } = makeClient();
  await recordPreDispatchSnapshot(client, {
    runId: "run-1",
    locationId: "loc-1",
    previousEnrichedData: { descripcion: "ORIGINAL" },
    previousEnrichmentStatus: "imported",
  });
  const second = await recordPreDispatchSnapshot(client, {
    runId: "run-1",
    locationId: "loc-1",
    previousEnrichedData: { descripcion: "POST_WRITE_VALUE" },
    previousEnrichmentStatus: "enriched",
  });
  assertEquals(second, { ok: true, alreadyExisted: true });
});

Deno.test("snapshot: second attempt does NOT overwrite original previous_* values", async () => {
  const { client, rows } = makeClient();
  await recordPreDispatchSnapshot(client, {
    runId: "run-1",
    locationId: "loc-1",
    previousEnrichedData: { descripcion: "ORIGINAL" },
    previousEnrichmentStatus: "imported",
  });
  // Simulate the post-watchdog re-claim: enrich-location has already
  // mutated locations.enriched_data; the orchestrator MUST keep the
  // original baseline so rollback is still meaningful.
  await recordPreDispatchSnapshot(client, {
    runId: "run-1",
    locationId: "loc-1",
    previousEnrichedData: { descripcion: "POST_WRITE_VALUE_MUST_NOT_LEAK" },
    previousEnrichmentStatus: "enriched",
  });
  assertEquals(rows.length, 1);
  assertEquals(
    (rows[0].previous_enriched_data as { descripcion: string }).descripcion,
    "ORIGINAL",
  );
  assertEquals(rows[0].previous_enrichment_status, "imported");
});

Deno.test("snapshot: distinct (run_id, location_id) creates separate rows", async () => {
  const { client, rows } = makeClient();
  await recordPreDispatchSnapshot(client, {
    runId: "run-1",
    locationId: "loc-A",
    previousEnrichedData: null,
    previousEnrichmentStatus: null,
  });
  await recordPreDispatchSnapshot(client, {
    runId: "run-1",
    locationId: "loc-B",
    previousEnrichedData: null,
    previousEnrichmentStatus: null,
  });
  await recordPreDispatchSnapshot(client, {
    runId: "run-2",
    locationId: "loc-A",
    previousEnrichedData: null,
    previousEnrichmentStatus: null,
  });
  assertEquals(rows.length, 3);
});

Deno.test("snapshot: real DB error surfaces as ok=false", async () => {
  const client: SnapshotClientLike = {
    from() {
      return {
        upsert() {
          return {
            select() {
              return Promise.resolve({
                data: null,
                error: { message: "permission denied for table enrichment_batch_snapshots", code: "42501" },
              });
            },
          };
        },
      };
    },
  };
  const r = await recordPreDispatchSnapshot(client, {
    runId: "run-1",
    locationId: "loc-1",
    previousEnrichedData: null,
    previousEnrichmentStatus: null,
  });
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.error.includes("permission denied"), true);
  }
});

Deno.test("snapshot: watchdog re-claim scenario — survives retry without abort", async () => {
  // This is the exact P2 Pilot-25 v3 regression: item attempts=2 after a
  // watchdog reset triggered a duplicate-key snapshot insert and aborted
  // the entire run. With the idempotent helper, the second call MUST be
  // a soft no-op so the orchestrator can proceed with dispatch.
  const { client } = makeClient();
  const firstAttempt = await recordPreDispatchSnapshot(client, {
    runId: "6b44e704-0539-4af6-bc76-23a0c9a02a92",
    locationId: "286a8239-5ea8-4f31-9918-f475b7601ca7",
    previousEnrichedData: null,
    previousEnrichmentStatus: "imported",
  });
  assertEquals(firstAttempt, { ok: true, alreadyExisted: false });

  // Worker dies, watchdog resets the item to pending, /start re-claims it.
  const reclaim = await recordPreDispatchSnapshot(client, {
    runId: "6b44e704-0539-4af6-bc76-23a0c9a02a92",
    locationId: "286a8239-5ea8-4f31-9918-f475b7601ca7",
    previousEnrichedData: null,
    previousEnrichmentStatus: "imported",
  });
  assertEquals(reclaim.ok, true);
  if (reclaim.ok) assertEquals(reclaim.alreadyExisted, true);
});
