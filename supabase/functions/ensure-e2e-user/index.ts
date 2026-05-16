// Edge function: ensure-e2e-user
// Idempotently creates/resets the Playwright E2E user.
// Uses SUPABASE_SERVICE_ROLE_KEY auto-injected in the edge runtime.
// Protected by a shared bootstrap token (header x-bootstrap-token) so it
// cannot be invoked anonymously despite verify_jwt = false.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CANONICAL_EMAIL = "sandbox-agent@vandits.test";
const CANONICAL_UID = "f04b3b95-7308-4b74-b3c7-7e819767c5fb";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bootstrap-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("E2E_BOOTSTRAP_TOKEN");
  const provided = req.headers.get("x-bootstrap-token");
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { password?: string; email?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const email = body.email ?? CANONICAL_EMAIL;
  const password = body.password;
  if (!password || password.length < 8) {
    return new Response(JSON.stringify({ error: "missing or weak password" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find existing by email via listUsers (paginated, but our user fits page 1 in practice)
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) {
    return new Response(JSON.stringify({ error: "list_failed", detail: listErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password, email_confirm: true,
    });
    if (error) {
      return new Response(JSON.stringify({ error: "update_failed", detail: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      ok: true, action: "reset", uid: existing.id, canonical: existing.id === CANONICAL_UID,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { source: "e2e-test-user", label: "Sandbox Agent" },
  });
  if (createErr || !created.user) {
    return new Response(JSON.stringify({ error: "create_failed", detail: createErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({
    ok: true, action: "created", uid: created.user.id, canonical: created.user.id === CANONICAL_UID,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
