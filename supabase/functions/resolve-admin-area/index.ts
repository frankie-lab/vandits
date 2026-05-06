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
  { key: 'continent',   code: 'continent',     placeholder: '(sin continente)' },
  { key: 'country',     code: 'country',       placeholder: '(sin país)' },
  { key: 'region',      code: 'region',        placeholder: '(sin región)' },
  { key: 'zone',        code: 'zone',          placeholder: '(sin provincia)' },
  { key: 'admin3',      code: 'admin_level_3', placeholder: '(sin comarca)' },
  { key: 'locality',    code: 'locality',      placeholder: '(sin localidad)' },
  { key: 'sublocality', code: 'sublocality',   placeholder: '(sin barrio)' },
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: types, error: tErr } = await supabase
      .from('place_types')
      .select('id, code')
      .in('code', LEVELS.map((l) => l.code));
    if (tErr) throw tErr;
    const typeIdByCode = new Map(types!.map((t) => [t.code, t.id as string]));

    const ids: Record<string, string | null> = {};
    let parentId: string | null = null;
    let lastDefinedIdx = -1;

    // 1) Determinar el índice del último nivel definido (para no inventar
    // placeholders por debajo de lo que el usuario realmente proporcionó).
    let maxIdx = -1;
    for (let i = 0; i < LEVELS.length; i++) {
      const raw = body[LEVELS[i].key];
      if (typeof raw === 'string' && raw.trim().length) maxIdx = i;
    }

    for (let i = 0; i < LEVELS.length; i++) {
      const lv = LEVELS[i];
      const raw = body[lv.key];
      const provided = typeof raw === 'string' ? raw.trim() : '';
      const typeId = typeIdByCode.get(lv.code)!;

      let name: string;
      let isPlaceholder: boolean;

      if (provided) {
        name = provided;
        isPlaceholder = false;
      } else if (i < maxIdx && lastDefinedIdx >= 0) {
        // Hueco intermedio: insertar placeholder para mantener cadena coherente.
        name = lv.placeholder;
        isPlaceholder = true;
      } else {
        // Nivel ausente al final: no se rellena.
        ids[`${lv.key}_id`] = null;
        continue;
      }

      // find
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
          .insert({ type_id: typeId, name, parent_id: parentId, is_placeholder: isPlaceholder })
          .select('id')
          .single();
        if (iErr) {
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
      if (!isPlaceholder) lastDefinedIdx = i;
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
