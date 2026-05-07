// Domain: Geography — resolves/creates an administrative chain in admin_areas.
// Input: any subset of { continent, country, region, zone, admin3, locality, sublocality }
// Output: { ids: { continent_id, country_id, ... } }
//
// HARDENED resolution order (per level):
//   1. If value matches an existing canonical row by iso_code → reuse
//   2. If value matches any row by aliases[] (case-insensitive) → reuse
//   3. If value matches by name + parent_id → reuse
//   4. Only as last resort: insert a new row (with parent_id propagated)
//
// For ISO-2 country codes, parent_id (continent) is auto-propagated from the canonical row,
// so callers that only pass `country: "FR"` end up with the right `continent_id` too.

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

const ISO2_RE = /^[A-Za-z]{2}$/;
const ISO3_RE = /^[A-Za-z]{3}$/;

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
        name = lv.placeholder;
        isPlaceholder = true;
      } else {
        ids[`${lv.key}_id`] = null;
        continue;
      }

      let resolvedId: string | null = null;
      let resolvedParentId: string | null = null;

      // ---- 1. ISO code match (canonical) — applies to ALL levels
      // Country: ISO-2/3 (e.g. "FR", "FRA")
      // Region:  ISO-3166-2 (e.g. "ES-AN", "FR-IDF")
      // Continent: M49 / 2-letter (e.g. "EU")
      if (!isPlaceholder) {
        const looksIso =
          ISO2_RE.test(name) ||
          ISO3_RE.test(name) ||
          /^[A-Za-z]{2}-[A-Za-z0-9]{1,3}$/.test(name);
        if (looksIso) {
          const isoUpper = name.toUpperCase();
          const { data: byIso } = await supabase
            .from('admin_areas')
            .select('id, parent_id')
            .eq('type_id', typeId)
            .eq('iso_code', isoUpper)
            .limit(1);
          if (byIso && byIso.length) {
            resolvedId = byIso[0].id;
            resolvedParentId = (byIso[0] as any).parent_id ?? null;
          }
        }
      }

      // ---- 2. Aliases match (case-insensitive)
      if (!resolvedId && !isPlaceholder) {
        const lower = name.toLowerCase();
        const { data: byAlias } = await supabase
          .from('admin_areas')
          .select('id, parent_id, aliases')
          .eq('type_id', typeId)
          .contains('aliases', [name])
          .limit(5);
        if (byAlias && byAlias.length) {
          // Prefer rows with a parent (canonical hierarchy)
          const sorted = [...byAlias].sort((a, b) =>
            (b.parent_id ? 1 : 0) - (a.parent_id ? 1 : 0),
          );
          resolvedId = sorted[0].id;
          resolvedParentId = (sorted[0] as any).parent_id ?? null;
        } else {
          // Try lowercase variant in aliases
          const { data: byAliasLower } = await supabase
            .from('admin_areas')
            .select('id, parent_id')
            .eq('type_id', typeId)
            .contains('aliases', [lower])
            .limit(1);
          if (byAliasLower && byAliasLower.length) {
            resolvedId = byAliasLower[0].id;
            resolvedParentId = (byAliasLower[0] as any).parent_id ?? null;
          }
        }
      }

      // ---- 3. Name + parent match (legacy fallback)
      if (!resolvedId) {
        const findQuery = supabase
          .from('admin_areas')
          .select('id, parent_id')
          .eq('type_id', typeId)
          .ilike('name', name)
          .limit(1);
        const { data: existing } = parentId
          ? await findQuery.eq('parent_id', parentId)
          : await findQuery.is('parent_id', null);
        if (existing && existing.length) {
          resolvedId = existing[0].id;
          resolvedParentId = (existing[0] as any).parent_id ?? null;
        }
      }

      // ---- 4. Insert as last resort
      if (!resolvedId) {
        const insertParent = parentId; // chain-derived
        const { data: inserted, error: iErr } = await supabase
          .from('admin_areas')
          .insert({
            type_id: typeId,
            name,
            parent_id: insertParent,
            is_placeholder: isPlaceholder,
          })
          .select('id, parent_id')
          .single();
        if (iErr) {
          // Race-condition retry
          const { data: retry } = await supabase
            .from('admin_areas')
            .select('id, parent_id')
            .eq('type_id', typeId)
            .ilike('name', name)
            .limit(1);
          if (retry && retry.length) {
            resolvedId = retry[0].id;
            resolvedParentId = (retry[0] as any).parent_id ?? null;
          } else {
            throw iErr;
          }
        } else {
          resolvedId = inserted!.id;
          resolvedParentId = (inserted as any).parent_id ?? null;
        }
        if (lv.code === 'country' && !insertParent) {
          console.warn(`[resolve-admin-area] Created orphan country "${name}" — needs canonical seed`);
        }
      }

      ids[`${lv.key}_id`] = resolvedId;

      // Propagate canonical parent into upstream id slot when missing.
      // E.g. caller passed only `country: "FR"`. Canonical FR has parent_id = Europe.
      // Set continent_id from there so locations never end up with country_id but no continent_id.
      if (resolvedParentId && i > 0) {
        const parentLv = LEVELS[i - 1];
        if (!ids[`${parentLv.key}_id`]) {
          ids[`${parentLv.key}_id`] = resolvedParentId;
        }
      }

      parentId = resolvedId;
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
