// Snapshot helper for the P2 orchestrator.
//
// Phase B records a pre-dispatch snapshot of (enriched_data,
// enrichment_status) per (run_id, location_id) so any successful
// orchestrator write can be reverted. The table has UNIQUE(run_id,
// location_id) — meaning the FIRST snapshot for a pair is the canonical
// "previous" state. Retries (after watchdog reset, after a transient
// dispatch error, etc.) MUST be safe and MUST NOT overwrite the original
// previous_* values with already-mutated post-write data.
//
// Strategy: UPSERT with `ignoreDuplicates: true`. PostgREST translates
// this to `INSERT … ON CONFLICT (run_id, location_id) DO NOTHING`. The
// first attempt creates the row; every subsequent attempt is a no-op and
// returns zero rows, which we treat as `alreadyExisted = true`. Real
// errors (permission denied, missing FK, etc.) still surface as
// `error`.
//
// Contract:
//   recordPreDispatchSnapshot returns
//     { ok: true,  alreadyExisted: false } — fresh snapshot created
//     { ok: true,  alreadyExisted: true  } — pre-existing row preserved
//     { ok: false, error: string         } — real DB failure (NOT a duplicate)
//
// The caller decides:
//   - alreadyExisted=true   → continue with dispatch (retry path).
//   - ok=false              → mark item fail, abort run only on real error.

export interface SnapshotClientLike {
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): {
      select(cols: string): Promise<{ data: unknown[] | null; error: { message: string; code?: string } | null }>;
    };
  };
}

export interface SnapshotInput {
  runId: string;
  locationId: string;
  previousEnrichedData: unknown;
  previousEnrichmentStatus: string | null;
}

export type SnapshotResult =
  | { ok: true; alreadyExisted: boolean }
  | { ok: false; error: string };

export async function recordPreDispatchSnapshot(
  client: SnapshotClientLike,
  input: SnapshotInput,
): Promise<SnapshotResult> {
  const { data, error } = await client
    .from("enrichment_batch_snapshots")
    .upsert(
      {
        run_id: input.runId,
        location_id: input.locationId,
        previous_enriched_data: input.previousEnrichedData ?? null,
        previous_enrichment_status: input.previousEnrichmentStatus ?? null,
      },
      { onConflict: "run_id,location_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    return { ok: false, error: error.message };
  }
  // PostgREST returns [] when ON CONFLICT DO NOTHING skipped the insert.
  const inserted = Array.isArray(data) && data.length > 0;
  return { ok: true, alreadyExisted: !inserted };
}
