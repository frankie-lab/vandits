// scripts/p2/lib/env.ts
// Resolve required environment for the P2 dev runner.
// Fails fast with a clear message — no implicit fallbacks.

export interface DevRunnerEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  orchestratorBase: string;
}

export function loadEnv(): DevRunnerEnv {
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) {
    throw new Error("env_missing: SUPABASE_URL (or VITE_SUPABASE_URL) required");
  }
  if (!serviceRoleKey) {
    throw new Error("env_missing: SUPABASE_SERVICE_ROLE_KEY required");
  }
  const orchestratorBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/enrich-batch-orchestrator`;
  return { supabaseUrl, serviceRoleKey, orchestratorBase };
}
