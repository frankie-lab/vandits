// Shared capability gate for admin edge functions.
//
// Canonical SoT of authorization predicate: `public.has_permission(uid, cap)`
// (SECURITY DEFINER) in the database. This helper is the ONLY way an edge
// function should gate an admin surface.
//
// Contract:
//   - Validates `Authorization: Bearer <jwt>` via auth.getUser().
//   - Calls `has_permission(uid, capability)` with the admin client.
//   - Returns { userId, adminClient } on success, or a Response (401/403) on failure.
//   - Fail closed: any error in the predicate ⇒ 403.
//   - Uniform error shapes: 401 { error: "unauthorized" }, 403 { error: "forbidden", capability }.
//
// Prohibido en este helper: leer `user_roles.role`. Solo capabilities.
//
// Capability literal type: compat temporal — mirror manual del enum
// `public.app_permission` (SoT real = base de datos). Si el enum cambia,
// actualizar esta unión. No duplicar este catálogo en otros sitios.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type Capability =
  // Operacionales (migration PR-ADMIN-AUDIT-1b)
  | "manage_permissions"
  | "manage_marker_config"
  | "manage_route_engine"
  | "manage_icon_library"
  | "manage_enrichment_config"
  | "view_audit_log"
  | "manage_geo_maintenance"
  | "manage_data_sources"
  | "run_image_recovery"
  | "manage_design_system"
  | "purge_user"
  | "open_back_office"
  // Clásicas
  | "manage_users"
  | "manage_roles"
  | "view_all_users"
  | "manage_all_documents"
  | "view_all_locations"
  | "manage_app_settings"
  | "manage_translations"
  | "manage_categories"
  | "view_analytics"
  | "manage_blog";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface CapabilityGateOk {
  userId: string;
  adminClient: SupabaseClient;
}

/**
 * Gate a request by capability. Returns either a success payload or a Response
 * to be returned directly by the caller. Fail-closed semantics.
 */
export async function requireCapability(
  req: Request,
  capability: Capability,
): Promise<CapabilityGateOk | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("[requireCapability] missing supabase env");
    return jsonResponse(403, { error: "forbidden", capability });
  }

  // Validate caller identity with anon client + their JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse(401, { error: "unauthorized" });
  }
  const userId = userData.user.id;

  // Admin client for the predicate call + subsequent privileged work.
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: allowed, error: rpcErr } = await adminClient.rpc("has_permission", {
    _user_id: userId,
    _permission: capability,
  });

  if (rpcErr) {
    console.error("[requireCapability] has_permission rpc error", {
      capability,
      userId,
      error: rpcErr.message,
    });
    return jsonResponse(403, { error: "forbidden", capability });
  }

  if (allowed !== true) {
    return jsonResponse(403, { error: "forbidden", capability });
  }

  return { userId, adminClient };
}
