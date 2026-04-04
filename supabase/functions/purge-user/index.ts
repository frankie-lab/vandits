import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is master or admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin/master role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdminOrMaster = roles?.some(
      (r: { role: string }) => r.role === "master" || r.role === "admin"
    );

    if (!isAdminOrMaster) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request
    const { targetUserId } = await req.json();
    if (!targetUserId || typeof targetUserId !== "string") {
      return new Response(
        JSON.stringify({ error: "targetUserId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prevent purging yourself
    if (targetUserId === user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot purge your own account" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get all documents of target user
    const { data: docs, error: docsError } = await adminClient
      .from("documents")
      .select("id")
      .eq("user_id", targetUserId);

    if (docsError) {
      throw new Error(`Error fetching documents: ${docsError.message}`);
    }

    const docIds = docs?.map((d: { id: string }) => d.id) || [];
    let deletedLocations = 0;
    let deletedDocuments = 0;
    let deletedNotes = 0;
    let deletedPhotos = 0;
    let deletedAchievements = 0;

    if (docIds.length > 0) {
      // Delete locations belonging to those documents
      const { count: locCount } = await adminClient
        .from("locations")
        .delete({ count: "exact" })
        .in("document_id", docIds);
      deletedLocations = locCount || 0;

      // Delete the documents themselves
      const { count: docCount } = await adminClient
        .from("documents")
        .delete({ count: "exact" })
        .eq("user_id", targetUserId);
      deletedDocuments = docCount || 0;
    }

    // Delete user's notes
    const { count: notesCount } = await adminClient
      .from("location_notes")
      .delete({ count: "exact" })
      .eq("user_id", targetUserId);
    deletedNotes = notesCount || 0;

    // Delete user's photos
    const { count: photosCount } = await adminClient
      .from("location_photos")
      .delete({ count: "exact" })
      .eq("user_id", targetUserId);
    deletedPhotos = photosCount || 0;

    // Delete user's achievements
    const { count: achievementsCount } = await adminClient
      .from("user_achievements")
      .delete({ count: "exact" })
      .eq("user_id", targetUserId);
    deletedAchievements = achievementsCount || 0;

    // Get target user info for the response
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("username, display_name")
      .eq("id", targetUserId)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        targetUser: targetProfile?.display_name || targetProfile?.username || targetUserId,
        purged: {
          locations: deletedLocations,
          documents: deletedDocuments,
          notes: deletedNotes,
          photos: deletedPhotos,
          achievements: deletedAchievements,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Purge error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
