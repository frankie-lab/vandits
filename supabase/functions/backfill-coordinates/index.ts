// Backfill geográfico universal (Fase 4)
// Recorre locations sin geo_resolved_at y delega en resolve-coordinates
// para poblar FKs canónicos + country_code/admin1_iso/timezone/postal_code/geo_confidence/raw_geocode.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_MS = 1100; // Nominatim cortesía
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit ?? 50), 500);
    const onlyMissing = body?.onlyMissing !== false; // default true
    const userId = body?.userId as string | undefined;
    const force = body?.force === true;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let q = admin
      .from("locations")
      .select("id, latitude, longitude, owner_user_id, geo_resolved_at, country_code")
      .is("deleted_at", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (onlyMissing && !force) {
      q = q.is("geo_resolved_at", null);
    }
    if (userId) q = q.eq("owner_user_id", userId);

    const { data: rows, error } = await q;
    if (error) throw error;

    let processed = 0;
    let resolved = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const row of rows ?? []) {
      processed++;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-coordinates`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({
            locationId: row.id,
            lat: row.latitude,
            lng: row.longitude,
            persist: true,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`resolve-coordinates ${res.status}: ${txt.slice(0, 200)}`);
        }
        resolved++;
      } catch (e) {
        failed++;
        errors.push({ id: row.id, error: String((e as Error).message ?? e) });
      }
      await sleep(RATE_LIMIT_MS);
    }

    return new Response(
      JSON.stringify({ processed, resolved, failed, errors: errors.slice(0, 20) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
