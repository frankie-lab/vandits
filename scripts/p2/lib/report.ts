// scripts/p2/lib/report.ts
// IO wrapper around the canonical pure markdown renderer.
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { DevRunnerEnv } from "./env.ts";
import { renderReportBody } from "../../../supabase/functions/_shared/p2/report-render.ts";

export { renderReportBody };

export interface ReportInput {
  env: DevRunnerEnv;
  runId: string;
  outputDir?: string;
}

export interface ReportOutput {
  path: string;
  body: string;
}

function fmtTimestamp(iso: string): string {
  return iso.replace(/[-:.]/g, "").replace(/Z$/, "Z");
}

function safeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export async function writeReport(input: ReportInput): Promise<ReportOutput> {
  const client = createClient(input.env.supabaseUrl, input.env.serviceRoleKey);
  const { data: run, error: runErr } = await client
    .from("enrichment_batch_runs").select("*").eq("id", input.runId).single();
  if (runErr || !run) throw new Error(`run_not_found: ${runErr?.message}`);
  const { data: items, error: itemsErr } = await client
    .from("enrichment_batch_items")
    .select("location_id, status, skip_reason, fail_reason").eq("run_id", input.runId);
  if (itemsErr) throw new Error(`items_lookup_failed: ${itemsErr.message}`);
  const { data: snapshots, error: snapErr } = await client
    .from("enrichment_batch_snapshots")
    .select("location_id, taken_at").eq("run_id", input.runId);
  if (snapErr) throw new Error(`snapshots_lookup_failed: ${snapErr.message}`);

  const successIds = (items ?? [])
    .filter((it: any) => it.status === "success").slice(0, 5).map((it: any) => it.location_id);
  let persistenceSample: { id: string; descLength: number; updated_at: string }[] = [];
  if (successIds.length > 0) {
    const { data: locs } = await client
      .from("locations").select("id, enriched_data, updated_at").in("id", successIds);
    persistenceSample = (locs ?? []).map((l: any) => ({
      id: l.id,
      descLength: typeof l.enriched_data?.descripcion === "string"
        ? l.enriched_data.descripcion.length : 0,
      updated_at: l.updated_at,
    }));
  }

  const body = renderReportBody(run, items ?? [], snapshots ?? [], persistenceSample);
  const outDir = input.outputDir ?? "docs/audits";
  const fileName = `poi-identity-p2-${safeLabel(run.label)}-${fmtTimestamp(run.created_at)}.md`;
  const path = `${outDir}/${fileName}`;
  await Deno.mkdir(outDir, { recursive: true });
  await Deno.writeTextFile(path, body);
  return { path, body };
}
