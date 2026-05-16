import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIXED_UID = "f04b3b95-7308-4b74-b3c7-7e819767c5fb";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const email = Deno.env.get("E2E_USER_EMAIL");
    const password = Deno.env.get("E2E_USER_PASSWORD");

    if (!email || !password) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_e2e_secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find existing user by email (paginated listUsers)
    let existing: { id: string; email?: string } | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) { existing = { id: found.id, email: found.email ?? undefined }; break; }
      if (data.users.length < 200) break;
    }

    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, action: "reset", uid: existing.id, email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create with fixed uid (best effort); if uid collision, fall back to auto
    let created = await admin.auth.admin.createUser({
      id: FIXED_UID,
      email,
      password,
      email_confirm: true,
    } as any);

    if (created.error) {
      const retry = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (retry.error) throw retry.error;
      created = retry as any;
    }

    return new Response(
      JSON.stringify({ ok: true, action: "created", uid: created.data.user?.id, email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
