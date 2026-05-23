// Pure Pilot-100 PASS evaluator. Canonical between CLI + edge bridge.
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.

export interface Pilot100GateResult {
  pass: boolean;
  reason: string;
  runId?: string;
  label?: string;
}

export interface RunForGate {
  id: string;
  label: string;
  status: string;
  metrics: {
    success?: number;
    fail?: number;
    skip?: number;
  } | null;
}

export function evaluatePilot100(run: RunForGate | null): Pilot100GateResult {
  if (!run) return { pass: false, reason: "no_pilot100_run_found" };
  if (!(run.status === "completed" || run.status === "paused")) {
    return { pass: false, reason: `pilot100_not_terminal:${run.status}`, runId: run.id, label: run.label };
  }
  const success = run.metrics?.success ?? 0;
  const fail = run.metrics?.fail ?? 0;
  const skip = run.metrics?.skip ?? 0;
  if (fail > 0) return { pass: false, reason: `pilot100_has_failures:${fail}`, runId: run.id, label: run.label };
  const finalised = success + fail + skip;
  if (finalised === 0) return { pass: false, reason: "pilot100_no_metrics", runId: run.id, label: run.label };
  const ratio = success / finalised;
  if (ratio < 0.4) return { pass: false, reason: `pilot100_success_ratio_low:${ratio.toFixed(2)}`, runId: run.id, label: run.label };
  return { pass: true, reason: "ok", runId: run.id, label: run.label };
}
