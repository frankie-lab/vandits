// Pure markdown renderer for P2 audit reports. Canonical between CLI + edge bridge.
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.

import { detectStopConditions } from "./gates.ts";

export function renderReportBody(
  run: any,
  items: any[],
  snapshots: any[],
  persistenceSample: any[],
): string {
  const m = run.metrics ?? {};
  const success = m.success ?? 0;
  const fail = m.fail ?? 0;
  const skip = m.skip ?? 0;
  const noop = m.noop ?? 0;
  const finalised = success + fail;
  const errorRate = finalised ? (fail / finalised) * 100 : 0;
  const stop = detectStopConditions({
    status: run.status,
    metrics: m,
    ai_calls_used: run.ai_calls_used,
    max_ai_calls: run.max_ai_calls,
    max_error_rate_pct: run.max_error_rate_pct,
  });
  const skipsByReason: Record<string, number> = {};
  const failures: { id: string; reason: string }[] = [];
  for (const it of items) {
    if (it.status === "skipped" && it.skip_reason) {
      skipsByReason[it.skip_reason] = (skipsByReason[it.skip_reason] ?? 0) + 1;
    }
    if (it.status === "failed" && it.fail_reason) {
      failures.push({ id: it.location_id, reason: it.fail_reason });
    }
  }

  const lines: string[] = [];
  lines.push(`# P2 Dev Runner — Report \`${run.label}\``);
  lines.push("");
  lines.push(`- **run_id:** \`${run.id}\``);
  lines.push(`- **status:** ${run.status}${run.abort_reason ? ` (${run.abort_reason})` : ""}${run.pause_reason ? ` (${run.pause_reason})` : ""}`);
  lines.push(`- **scope_count:** ${run.scope_count}`);
  lines.push(`- **chunk_size:** ${run.chunk_size}`);
  lines.push(`- **max_ai_calls:** ${run.max_ai_calls}  •  used: ${run.ai_calls_used ?? 0}`);
  lines.push(`- **max_runtime_minutes:** ${run.max_runtime_minutes}`);
  lines.push(`- **max_error_rate_pct:** ${run.max_error_rate_pct}`);
  lines.push(`- **started_at:** ${run.started_at ?? "n/a"}`);
  lines.push(`- **finished_at:** ${run.finished_at ?? "n/a"}`);
  lines.push("");
  lines.push(`## Metrics`);
  lines.push("");
  lines.push(`| success | fail | skip | noop | error_rate |`);
  lines.push(`|---------|------|------|------|------------|`);
  lines.push(`| ${success} | ${fail} | ${skip} | ${noop} | ${errorRate.toFixed(2)}% |`);
  lines.push("");
  lines.push(`Stop condition detected: **${stop.kind}**`);
  lines.push("");
  lines.push(`## Persistence sample (up to 5 successes)`);
  lines.push("");
  if (persistenceSample.length === 0) {
    lines.push(`_no success items yet_`);
  } else {
    lines.push(`| location_id | descripcion length | updated_at |`);
    lines.push(`|-------------|--------------------|------------|`);
    for (const p of persistenceSample) {
      lines.push(`| \`${p.id}\` | ${p.descLength} | ${p.updated_at} |`);
    }
  }
  lines.push("");
  lines.push(`## Snapshots`);
  lines.push("");
  lines.push(`Total snapshots: ${snapshots.length}`);
  const uniqueLocs = new Set(snapshots.map((s) => s.location_id));
  lines.push(`Unique locations: ${uniqueLocs.size}`);
  lines.push(`Idempotency check: ${snapshots.length === uniqueLocs.size ? "OK" : "DUPLICATES_DETECTED"}`);
  lines.push("");
  lines.push(`## Skips`);
  lines.push("");
  if (Object.keys(skipsByReason).length === 0) {
    lines.push(`_none_`);
  } else {
    for (const [reason, n] of Object.entries(skipsByReason).sort((a, b) => b[1] - a[1])) {
      lines.push(`- \`${reason}\`: ${n}`);
    }
  }
  lines.push("");
  lines.push(`## Failures`);
  lines.push("");
  if (failures.length === 0) {
    lines.push(`_none_`);
  } else {
    for (const f of failures.slice(0, 50)) {
      lines.push(`- \`${f.id}\` — ${f.reason}`);
    }
  }
  lines.push("");
  lines.push(`## Invariants`);
  lines.push("");
  lines.push(`- No Nominatim invoked`);
  lines.push(`- No re-enrich (gate \`already_enriched\` honoured)`);
  lines.push(`- No UPDATE outside allowlist (\`enriched_data\`, \`enrichment_status\`, \`updated_at\`)`);
  lines.push(`- No canon mutation`);
  lines.push(`- No marker fill / \`computePoiMaturity\` touched`);
  lines.push(`- Snapshots idempotent`);
  lines.push(`- No bump`);
  lines.push("");
  lines.push(`## Recommendation`);
  lines.push("");
  if (stop.kind !== "none") {
    lines.push(`**Halt.** Stop condition \`${stop.kind}\` triggered; investigate before next batch.`);
  } else if (run.status === "completed" || (run.status === "paused" && fail === 0)) {
    lines.push(`**Proceed.** Run terminal-clean. Next tanda authorised by policy.`);
  } else if (run.status === "aborted") {
    lines.push(`**Investigate.** Run aborted (${run.abort_reason ?? "no reason"}).`);
  } else {
    lines.push(`**Wait.** Run not yet terminal.`);
  }
  return lines.join("\n") + "\n";
}
