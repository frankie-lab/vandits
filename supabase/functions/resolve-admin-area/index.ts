// Domain: Geography — resolves/creates an administrative chain in admin_areas.
// Input: any subset of { continent, country, region, zone, admin3, locality, sublocality }
// Output: { ids: { continent_id, country_id, ... } } — UUIDs of the deepest provided level
// and all ancestors. Idempotent: existing rows are not duplicated.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LEVELS = [
  { key: 'continent',   code: 'continent' },
  { key: 'country',     code: 'country' },
  { key: 'region',      code: 'region' },
  { key: 'zone',        code: 'zone' },
  { key: 'admin3',      code: 'admin_level_3' },
  { key: 'locality',    code: 'locality' },
  { key: 'sublocality', code: 'sublocality' },
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Map place_type codes -> uuids (cached per request)
    const { data: types, error: tErr } = await supabase
      .from('place_types')
      .select('id, code')
      .in('code', LEVELS.map((l) => l.code));
    if (tErr) throw tErr;
    const typeIdByCode = new Map(types!.map((t) => [t.code, t.id as string]));

    const ids: Record<string, string | null> = {};
    let parentId: string | null = null;

    for (const lv of LEVELS) {
      const raw = body[lv.key];
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (!name) {
        ids[`${lv.key}_id`] = null;
        // Reset parent chain — niveles ausentes interrumpen la cadena
        // pero permitimos saltos: parentId se mantiene, los niveles posteriores
        // colgarán del último conocido. Esto es deliberado.
        continue;
      }
      const typeId = typeIdByCode.get(lv.code)!;

      // Try find
      const findQuery = supabase
        .from('admin_areas')
        .select('id')
        .eq('type_id', typeId)
        .ilike('name', name)
        .limit(1);
      const { data: existing } = parentId
        ? await findQuery.eq('parent_id', parentId)
        : await findQuery.is('parent_id', null);

      let id: string;
      if (existing && existing.length) {
        id = existing[0].id;
      } else {
        const { data: inserted, error: iErr } = await supabase
          .from('admin_areas')
          .insert({ type_id: typeId, name, parent_id: parentId })
          .select('id')
          .single();
        if (iErr) {
          // Race condition fallback: re-query
          const retryQuery = supabase
            .from('admin_areas')
            .select('id')
            .eq('type_id', typeId)
            .ilike('name', name)
            .limit(1);
          const { data: retry } = parentId
            ? await retryQuery.eq('parent_id', parentId)
            : await retryQuery.is('parent_id', null);
          if (retry && retry.length) id = retry[0].id;
          else throw iErr;
        } else {
          id = inserted!.id;
        }
      }
      ids[`${lv.key}_id`] = id;
      parentId = id;
    }

    return new Response(JSON.stringify({ ids }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('[resolve-admin-area] error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
