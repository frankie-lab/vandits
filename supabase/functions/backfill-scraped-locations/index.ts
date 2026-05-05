// Backfill puntual para locations importadas desde scraping web.
// Para cada location con custom_data.source y custom_data.source_url:
//  - Asegura tag #<Source> en custom_data.tags
//  - Copia custom_data.image a user_image_url si está vacío
//  - Resuelve FKs geo (continent/country/region/zone/admin3/locality/sublocality)
//  - Limpia enriched_data/enrichment_status que el flujo viejo pudo haber sembrado
//    SOLO si la "fuente" del enriched_data es scrape (no toca IA real).
// NO toca puntos enriquecidos por IA. Idempotente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function resolveAdminFks(input: {
  country?: string | null; region?: string | null; locality?: string | null;
}): Promise<Record<string, string | null>> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/resolve-admin-area`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) return {};
    const json = await res.json();
    return json?.ids ?? json ?? {};
  } catch { return {}; }
}

function sourceLabel(source: string | null | undefined): string {
  return (source ?? 'web')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  const documentId = url.searchParams.get('documentId');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500'), 2000);
  const dryRun = url.searchParams.get('dryRun') === '1';

  let q = supabase
    .from('locations')
    .select('id, name, latitude, longitude, country, region, continent_id, country_id, region_id, zone_id, admin3_id, locality_id, sublocality_id, user_image_url, custom_data, enriched_data, enrichment_status, owner_user_id, document_id')
    .is('deleted_at', null)
    .not('custom_data->>source', 'is', null)
    .limit(limit);
  if (userId) q = q.eq('owner_user_id', userId);
  if (documentId) q = q.eq('document_id', documentId);

  const { data: rows, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let processed = 0, updated = 0, skipped = 0;
  const errors: { id: string; msg: string }[] = [];

  for (const r of rows ?? []) {
    processed++;
    try {
      const cd = (r.custom_data ?? {}) as Record<string, any>;
      const source: string = cd.source ?? 'web';
      const tag = `#${sourceLabel(source)}`;
      const tags: string[] = Array.isArray(cd.tags) ? [...cd.tags] : [];
      const tagsHasSource = tags.some((t) => t?.toLowerCase() === tag.toLowerCase());
      const newTags = tagsHasSource ? tags : [tag, ...tags];

      const heroNeedsFix = !r.user_image_url && cd.image;
      const fksMissing =
        !r.continent_id || !r.country_id || !r.region_id || !r.locality_id;

      // Si el enriched_data fue sembrado por scrape antiguo (fuente conocida y descripcion vacía/proviene de cd), lo limpiamos.
      const ed = r.enriched_data as Record<string, any> | null;
      const edFromScrape = !!ed && (ed.fuente === source || ed.source_url === cd.source_url);
      const clearEnriched = edFromScrape;

      const updates: Record<string, any> = {};
      if (!tagsHasSource) {
        updates.custom_data = { ...cd, tags: newTags };
      }
      if (heroNeedsFix) updates.user_image_url = cd.image;
      if (clearEnriched) {
        updates.enriched_data = null;
        updates.enrichment_status = null;
      }

      if (fksMissing) {
        const fks = await resolveAdminFks({
          country: r.country ?? null,
          region: r.region ?? null,
          locality: cd.locality ?? null,
        });
        if (fks.continent_id && !r.continent_id) updates.continent_id = fks.continent_id;
        if (fks.country_id && !r.country_id) updates.country_id = fks.country_id;
        if (fks.region_id && !r.region_id) updates.region_id = fks.region_id;
        if (fks.zone_id && !r.zone_id) updates.zone_id = fks.zone_id;
        if (fks.admin3_id && !r.admin3_id) updates.admin3_id = fks.admin3_id;
        if (fks.locality_id && !r.locality_id) updates.locality_id = fks.locality_id;
        if (fks.sublocality_id && !r.sublocality_id) updates.sublocality_id = fks.sublocality_id;
      }

      if (Object.keys(updates).length === 0) { skipped++; continue; }

      if (!dryRun) {
        const { error: upErr } = await supabase
          .from('locations')
          .update(updates)
          .eq('id', r.id);
        if (upErr) { errors.push({ id: r.id, msg: upErr.message }); continue; }
      }
      updated++;
    } catch (e) {
      errors.push({ id: r.id, msg: e instanceof Error ? e.message : String(e) });
    }
  }

  return new Response(
    JSON.stringify({ processed, updated, skipped, errors, dryRun }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
