// scripts/p2/lib/http.ts
// Thin HTTP client around the enrich-batch-orchestrator edge function.
// All calls use the service-role key (master equivalent server-side).

import type { DevRunnerEnv } from "./env.ts";

export interface OrchestratorClient {
  status(runId: string): Promise<Record<string, unknown>>;
  pause(runId: string, reason?: string): Promise<Record<string, unknown>>;
  start(runId: string): Promise<Record<string, unknown>>;
  watchdog(runId: string, staleMinutes?: number): Promise<Record<string, unknown>>;
  seed(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function makeOrchestratorClient(env: DevRunnerEnv): OrchestratorClient {
  const headers = {
    "Authorization": `Bearer ${env.serviceRoleKey}`,
    "apikey": env.serviceRoleKey,
    "Content-Type": "application/json",
  };
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${env.orchestratorBase}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`orchestrator_${path}_failed: ${res.status} ${JSON.stringify(json)}`);
    }
    return json;
  };
  const get = async (path: string) => {
    const res = await fetch(`${env.orchestratorBase}${path}`, { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`orchestrator_${path}_failed: ${res.status} ${JSON.stringify(json)}`);
    }
    return json;
  };
  return {
    status: (runId) => get(`/status?run_id=${encodeURIComponent(runId)}`),
    pause: (runId, reason) => post("/pause", { run_id: runId, reason: reason ?? "manual" }),
    start: (runId) => post("/start", { run_id: runId }),
    watchdog: (runId, staleMinutes) =>
      post("/watchdog", { run_id: runId, stale_minutes: staleMinutes ?? 5 }),
    seed: (payload) => post("/seed", payload),
  };
}
