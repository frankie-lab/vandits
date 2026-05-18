// recover-missing-images
//
// Retroactively searches for images for already-enriched POIs that ended up
// without `cover_url` (the 90% that fell out of the original batch run due to
// rate-limiting). Uses the shared `searchImageFromSources` helper.
//
// Contract:
//   POST /recover-missing-images
//   {
//     scope: 'all' | 'user' | 'ids',
//     userId?: string,
//     locationIds?: string[],
//     batchSize?: number,    // default 50, max 200
//     dryRun?: boolean,      // default false
//     force?: boolean,       // ignore image_recovery_attempted_at
//     retryStaleDays?: number, // default 30
//     cursor?: string        // last processed UUID; results have id > cursor
//   }
//
//   Response:
//   {
//     scanned, updated, skippedAlreadyAttempted, failedTransient,
//     nextCursor, items: [{ id, name, result, source }]
//   }
//
// Authorization: caller must be admin/master. The function uses the service
// role key for DB writes after that check.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  searchImageFromSources,
  isAttemptComplete,
  type ImageSourceCode,
} from "../_shared/image-search.ts";
import { requireCapability } from "../_shared/require-capability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type RecoveryMode = "missing" | "refresh" | "full";

interface Body {
  scope: "all" | "user" | "ids";
  // Optional: when set, the function streams per-item progress into
  // `image_recovery_jobs` via the `increment_image_recovery_progress` RPC so
  // the bottom progress bar moves smoothly per POI instead of per batch.
  jobId?: string;
  // Operation universe selector. Default 'missing' for backward compat.
  //   missing → enriquecidos sin foto en ninguna fuente (predicado clásico)
  //   refresh → todos los enriquecidos (con o sin foto)
  //   full    → todos los POIs activos
  mode?: RecoveryMode;
  userId?: string;
  locationIds?: string[];
  batchSize?: number;
  dryRun?: boolean;
  force?: boolean;
  retryStaleDays?: number;
  cursor?: string;
  // Franjas geográficas (text equality contra columnas locations.continent/country/zone)
  continent?: string;
  country?: string;
  region?: string;
  zone?: string;
  // Franjas por antigüedad (ISO timestamps contra locations.created_at)
  createdBefore?: string;
  createdAfter?: string;
}

const PARALLEL = 3;
const PER_POI_JITTER_MS = () => 200 + Math.floor(Math.random() * 300);

interface ItemLog {
  id: string;
  name: string | null;
  result: "found" | "none" | "skipped" | "transient";
  source: ImageSourceCode | null;
  durationMs: number;
}

function getMediaImageUrl(enriched: any): string | null {
  const u = enriched?.media?.cover_url
    ?? enriched?.media?.images?.[0]?.url
    ?? enriched?.imagen
    ?? null;
  return typeof u === "string" && u.length > 0 ? u : null;
}

function getRecoveryAttemptedAt(enriched: any): string | null {
  const v = enriched?.media?.image_recovery_attempted_at;
  return typeof v === "string" ? v : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- auth: capability `run_image_recovery` via JWT, OR trusted internal caller (service role) ---
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "auth required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const bearer = authHeader.slice("Bearer ".length).trim();

  const apiKeyHeader = req.headers.get("apikey") ?? req.headers.get("x-internal-key") ?? "";
  const isInternalCall = bearer === SERVICE_ROLE || apiKeyHeader === SERVICE_ROLE;

  let admin;
  if (isInternalCall) {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  } else {
    const gate = await requireCapability(req, "run_image_recovery");
    if (gate instanceof Response) return gate;
    admin = gate.adminClient;
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scope = body.scope;
  const batchSize = Math.min(Math.max(body.batchSize ?? 50, 1), 200);
  const dryRun = !!body.dryRun;
  const force = !!body.force;
  const retryStaleDays = Math.max(body.retryStaleDays ?? 30, 0);
  const cursor = body.cursor ?? "00000000-0000-0000-0000-000000000000";
  const jobId = typeof body.jobId === "string" && body.jobId.length > 0 ? body.jobId : null;

  // Stream per-item progress into image_recovery_jobs (best-effort, never throws).
  const bumpJob = async (deltas: {
    scanned?: number; updated?: number; noImage?: number; skipped?: number; failed?: number;
    item?: ItemLog | null;
  }) => {
    if (!jobId) return;
    try {
      await admin.rpc("increment_image_recovery_progress", {
        _job_id: jobId,
        _scanned_delta: deltas.scanned ?? 0,
        _updated_delta: deltas.updated ?? 0,
        _no_image_delta: deltas.noImage ?? 0,
        _skipped_delta: deltas.skipped ?? 0,
        _failed_delta: deltas.failed ?? 0,
        _item: deltas.item ?? null,
      });
    } catch (e) {
      console.warn("[recover-missing-images] bumpJob failed", (e as Error).message);
    }
  };

  const mode: RecoveryMode = (body.mode ?? "missing");
  if (!["missing", "refresh", "full"].includes(mode)) {
    return new Response(JSON.stringify({ error: "invalid mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!["all", "user", "ids"].includes(scope)) {
    return new Response(JSON.stringify({ error: "invalid scope" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- candidate query: cursor by id, base predicates depend on `mode` ---
  // Pre-fetch location ids that already have a row in `location_photos`
  // (gallery uploads). Used by 'missing' mode to exclude POIs that already
  // have a user photo via that channel.
  let locationIdsWithPhotos = new Set<string>();
  if (mode === "missing") {
    const { data: photoRows } = await admin
      .from("location_photos")
      .select("location_id");
    locationIdsWithPhotos = new Set<string>(
      (photoRows ?? []).map((r: any) => r.location_id),
    );
  }

  let q = admin
    .from("locations")
    .select("id, name, latitude, longitude, continent, country, region, zone, place_type, enriched_data, deleted_at, owner_user_id, user_image_url, created_at")
    .is("deleted_at", null)
    .gt("id", cursor)
    .order("id", { ascending: true })
    .limit(batchSize * 3);

  // Mode-specific base filters. Canonical "enriched" = enriched_data->>'descripcion' not empty.
  if (mode === "missing") {
    q = q
      .not("enriched_data->>descripcion", "is", null)
      .neq("enriched_data->>descripcion", "")
      .or("enriched_data->>imagen.is.null,enriched_data->>imagen.eq.")
      .or("user_image_url.is.null,user_image_url.eq.");
  } else if (mode === "refresh") {
    // Todos los enriquecidos (con o sin foto). El cooldown se aplica abajo.
    q = q
      .not("enriched_data->>descripcion", "is", null)
      .neq("enriched_data->>descripcion", "");
  }
  // mode === 'full' → no extra filter

  if (scope === "user") {
    if (!body.userId) {
      return new Response(JSON.stringify({ error: "userId required for scope=user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    q = q.eq("owner_user_id", body.userId);
  } else if (scope === "ids") {
    if (!Array.isArray(body.locationIds) || body.locationIds.length === 0) {
      return new Response(JSON.stringify({ error: "locationIds required for scope=ids" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    q = q.in("id", body.locationIds);
  }

  // Franjas geográficas (text equality, case-insensitive via ilike)
  if (body.continent && body.continent.trim()) q = q.ilike("continent", body.continent.trim());
  if (body.country && body.country.trim()) q = q.ilike("country", body.country.trim());
  if (body.region && body.region.trim()) q = q.ilike("region", body.region.trim());
  if (body.zone && body.zone.trim()) q = q.ilike("zone", body.zone.trim());
  // Franjas por antigüedad
  if (body.createdBefore) q = q.lt("created_at", body.createdBefore);
  if (body.createdAfter) q = q.gt("created_at", body.createdAfter);

  const { data: rows, error: qErr } = await q;
  if (qErr) {
    return new Response(JSON.stringify({ error: qErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // JS-level filter: still no image, and not recently attempted (unless force).
  const staleCutoff = Date.now() - retryStaleDays * 86_400_000;
  const candidates: typeof rows = [];
  let skippedAlreadyAttempted = 0;

  for (const r of rows ?? []) {
    // 'missing' is the only mode that requires there be NO existing image.
    if (mode === "missing") {
      if (getMediaImageUrl(r.enriched_data)) continue; // already has image somewhere
      if (r.user_image_url && String(r.user_image_url).length > 0) continue; // user uploaded URL
      if (locationIdsWithPhotos.has(r.id)) continue; // gallery photo exists
    }
    if (!force) {
      const attempted = getRecoveryAttemptedAt(r.enriched_data);
      if (attempted) {
        const t = Date.parse(attempted);
        if (!Number.isNaN(t) && t > staleCutoff) {
          skippedAlreadyAttempted++;
          continue;
        }
      }
    }
    candidates.push(r);
    if (candidates.length >= batchSize) break;
  }

  const items: ItemLog[] = [];
  let updated = 0;
  let noImage = 0;
  let failedTransient = 0;
  let lastId = cursor;

  // 3-parallel waves with jitter.
  for (let i = 0; i < candidates.length; i += PARALLEL) {
    const wave = candidates.slice(i, i + PARALLEL);
    await Promise.all(wave.map(async (loc: any) => {
      await new Promise((r) => setTimeout(r, PER_POI_JITTER_MS()));
      const t0 = Date.now();
      let item: ItemLog | null = null;
      let updatedDelta = 0;
      let noImageDelta = 0;
      let failedDelta = 0;
      try {
        const coords = (loc.latitude != null && loc.longitude != null)
          ? { lat: loc.latitude as number, lng: loc.longitude as number }
          : undefined;

        const { hit, telemetry } = await searchImageFromSources(
          {
            placeName: loc.name ?? loc.enriched_data?.nombre_lugar ?? "",
            placeType: loc.place_type ?? loc.enriched_data?.datos_clave?.tipo,
            country: loc.country ?? undefined,
            region: loc.region ?? undefined,
            coordinates: coords,
          },
          { includeOsm: false }, // OSM disabled by default
        );

        const complete = isAttemptComplete(telemetry);

        if (hit) {
          item = {
            id: loc.id, name: loc.name, result: "found",
            source: telemetry.finalSource, durationMs: telemetry.durationMs,
          };
          if (!dryRun) {
            const newEnriched = {
              ...(loc.enriched_data ?? {}),
              imagen: hit.url,
              imagen_fuente: `${hit.source}: ${hit.title ?? ""}`.trim(),
              media: {
                ...(loc.enriched_data?.media ?? {}),
                images: [hit],
                cover_url: hit.url,
                image_recovery_attempted_at: new Date().toISOString(),
                image_recovery: {
                  source_telemetry: telemetry,
                  recovered: true,
                },
              },
            };
            const { error: uErr } = await admin
              .from("locations")
              .update({ enriched_data: newEnriched })
              .eq("id", loc.id);
            if (!uErr) { updated++; updatedDelta = 1; }
            else console.error("update failed", loc.id, uErr.message);
          } else {
            updated++; updatedDelta = 1; // count as "would-update"
          }
        } else if (!complete) {
          // All failures were transient — DO NOT mark attempted. Will retry.
          // Counted as technical failure (failed), NOT as "no image found".
          failedTransient++; failedDelta = 1;
          item = {
            id: loc.id, name: loc.name, result: "transient",
            source: null, durationMs: telemetry.durationMs,
          };
        } else {
          // Definitive miss — every source replied without an image. This is
          // a clean technical outcome, not a failure. Mark attempted so we
          // skip the POI until retryStaleDays.
          noImage++; noImageDelta = 1;
          item = {
            id: loc.id, name: loc.name, result: "none",
            source: null, durationMs: telemetry.durationMs,
          };
          if (!dryRun) {
            const newEnriched = {
              ...(loc.enriched_data ?? {}),
              media: {
                ...(loc.enriched_data?.media ?? {}),
                image_recovery_attempted_at: new Date().toISOString(),
                image_recovery: {
                  source_telemetry: telemetry,
                  recovered: false,
                },
              },
            };
            await admin
              .from("locations")
              .update({ enriched_data: newEnriched })
              .eq("id", loc.id);
          }
        }
      } catch (err) {
        failedTransient++; failedDelta = 1;
        item = {
          id: loc.id, name: loc.name, result: "transient",
          source: null, durationMs: Date.now() - t0,
        };
        console.error("recover error", loc.id, err);
      } finally {
        if (item) items.push(item);
        if (loc.id > lastId) lastId = loc.id;
        // Stream per-POI progress to image_recovery_jobs so the UI advances
        // smoothly. scanned bumps once per processed candidate.
        await bumpJob({
          scanned: 1,
          updated: updatedDelta,
          noImage: noImageDelta,
          failed: failedDelta,
          item: item ?? null,
        });
      }
    }));
  }

  // nextCursor: lastId only if we processed full batch — otherwise null
  // (caller has reached the end of the candidate set for this scope).
  const nextCursor = candidates.length >= batchSize ? lastId : null;

  return new Response(JSON.stringify({
    scanned: candidates.length,
    updated,
    noImage,
    skippedAlreadyAttempted,
    failedTransient,
    nextCursor,
    dryRun,
    items,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
