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
import { shouldDropZone } from '../_shared/zone-region-guard.ts';
import {
  regionHasNoProvincia,
  getCountryCanon,
} from '../_shared/territorial-canon.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// IMPORTANT: la columna locations.zone_id alberga la PROVINCIA (ISO 3166-2 nivel 2).
// La columna locations.admin3_id alberga la COMARCA / condado / county.
const LEVELS = [
  { key: 'continent',   code: 'continent',     placeholder: '(sin continente)' },
  { key: 'country',     code: 'country',       placeholder: '(sin país)' },
  { key: 'region',      code: 'region',        placeholder: '(sin región)' },
  { key: 'zone',        code: 'province',      placeholder: '(sin provincia)' },
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

      // Per-level ISO hint from caller meta (e.g. country.iso_code = "FR").
      const metaIso: string | undefined = (() => {
        const m = body?.meta?.[lv.key];
        const v = m && typeof m === 'object' ? (m as any).iso_code : undefined;
        return typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : undefined;
      })();

      // ---- 1. ISO code match (canonical) — applies to ALL levels
      // Country: ISO-2/3 (e.g. "FR", "FRA")
      // Region:  ISO-3166-2 (e.g. "ES-AN", "FR-IDF")
      // Continent: M49 / 2-letter (e.g. "EU")
      if (!isPlaceholder) {
        const candidates: string[] = [];
        if (metaIso) candidates.push(metaIso);
        const looksIso =
          ISO2_RE.test(name) ||
          ISO3_RE.test(name) ||
          /^[A-Za-z]{2}-[A-Za-z0-9]{1,3}$/.test(name);
        if (looksIso) candidates.push(name.toUpperCase());
        for (const isoUpper of candidates) {
          const { data: byIso } = await supabase
            .from('admin_areas')
            .select('id, parent_id')
            .eq('type_id', typeId)
            .eq('iso_code', isoUpper)
            .limit(1);
          if (byIso && byIso.length) {
            resolvedId = byIso[0].id;
            resolvedParentId = (byIso[0] as any).parent_id ?? null;
            break;
          }
        }
      }

      // ---- 2. admin_area_names match (multilingual).
      // CRITICAL: when we already have a parent in the chain, REQUIRE the matched
      // row to hang under that parent. Otherwise we'd reuse e.g. "Centro" (PT)
      // for a French point because PT-Centro happens to share the name.
      if (!resolvedId && !isPlaceholder) {
        const lower = name.toLowerCase();
        const { data: byMultiLang } = await supabase
          .from('admin_area_names')
          .select('area_id, admin_areas!inner(id, parent_id, type_id)')
          .ilike('name', name)
          .eq('admin_areas.type_id', typeId)
          .limit(20);
        if (byMultiLang && byMultiLang.length) {
          const filtered = parentId
            ? byMultiLang.filter((r) => ((r as any).admin_areas?.parent_id ?? null) === parentId)
            : byMultiLang;
          if (filtered.length) {
            const hit = filtered[0] as any;
            resolvedId = hit.admin_areas?.id ?? hit.area_id;
            resolvedParentId = hit.admin_areas?.parent_id ?? null;
          }
        }
        // ---- 2b. Aliases array on admin_areas (legacy)
        if (!resolvedId) {
          const { data: byAlias } = await supabase
            .from('admin_areas')
            .select('id, parent_id, aliases')
            .eq('type_id', typeId)
            .or(`aliases.cs.{${name}},aliases.cs.{${lower}}`)
            .limit(20);
          if (byAlias && byAlias.length) {
            const filtered = parentId
              ? byAlias.filter((r) => r.parent_id === parentId)
              : byAlias;
            if (filtered.length) {
              resolvedId = filtered[0].id;
              resolvedParentId = (filtered[0] as any).parent_id ?? null;
            }
          }
        }
      }

      // ---- 3a. Name + parent + same type match (canonical fallback)
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

      // ---- 3b. CROSS-LEVEL dedup: same name+parent under any other type.
      //     If found we REUSE it (and reclassify to the requested type when the
      //     incoming classification looks more specific). Prevents creating a
      //     "Galicia" twin at type=zone when one already exists at type=region.
      if (!resolvedId && !isPlaceholder) {
        const crossQuery = supabase
          .from('admin_areas')
          .select('id, parent_id, type_id, iso_code')
          .neq('type_id', typeId)
          .ilike('name', name)
          .limit(5);
        const { data: crossMatches } = parentId
          ? await crossQuery.eq('parent_id', parentId)
          : await crossQuery.is('parent_id', null);
        if (crossMatches && crossMatches.length) {
          // Prefer rows with iso_code (canonical).
          const sorted = [...crossMatches].sort(
            (a, b) => (b.iso_code ? 1 : 0) - (a.iso_code ? 1 : 0),
          );
          const hit = sorted[0];
          // Only reclassify when the existing row has no ISO (not canonical).
          if (!hit.iso_code) {
            try {
              await supabase.rpc('_reclassify_admin_area', {
                _node_id: hit.id,
                _new_type: typeId,
                _new_parent: parentId,
              });
            } catch (e) {
              console.warn('[resolve-admin-area] reclassify failed', e);
            }
          }
          resolvedId = hit.id;
          resolvedParentId = (hit as any).parent_id ?? null;
        }
      }

      // ---- 4. Insert as last resort
      if (!resolvedId) {
        const insertParent = parentId; // chain-derived
        // Optional per-level metadata: body.meta = { region: { admin_type_local, name_lang }, ... }
        const meta = (body?.meta?.[lv.key] ?? {}) as {
          admin_type_local?: string;
          name_lang?: string;
          source?: string;
        };
        const { data: inserted, error: iErr } = await supabase
          .from('admin_areas')
          .insert({
            type_id: typeId,
            name,
            parent_id: insertParent,
            is_placeholder: isPlaceholder,
            admin_type_local: meta.admin_type_local ?? null,
            name_lang: meta.name_lang ?? null,
            source: meta.source ?? 'osm',
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

    // R8 (Fase 7): zone ≠ region — si el caller envió la misma cadena como
    // región y como provincia/zona, NO asignamos zone_id (queda NULL).
    // region_id permanece intacto. No duplicamos la región como provincia.
    if (shouldDropZone(body.zone, body.region)) {
      ids['zone_id'] = null;
    }

    // T2A-wire §1.b — Excepciones regionales (regionsWithoutProvincia).
    // Lookup iso_code de country & region resueltos para aplicar veto via
    // canon (sin hardcode de PT-20/PT-30). Adicional: 1 SELECT cuando hay
    // region_id, 0 round-trips si la región no se resolvió.
    let regionIsoCode: string | null = null;
    let countryIsoCode: string | null = null;
    let regionForbidsProvincia = false;
    const regionId = ids['region_id'];
    const countryId = ids['country_id'];
    if (regionId || countryId) {
      try {
        const lookupIds = [regionId, countryId].filter((x): x is string => !!x);
        const { data: isoRows } = await supabase
          .from('admin_areas')
          .select('id, iso_code')
          .in('id', lookupIds);
        if (isoRows) {
          for (const row of isoRows) {
            if (row.id === regionId) regionIsoCode = (row as any).iso_code ?? null;
            if (row.id === countryId) countryIsoCode = (row as any).iso_code ?? null;
          }
        }
      } catch (e) {
        console.warn('[resolve-admin-area] iso_code lookup failed', e);
      }
    }
    // Derivar iso2 país: prioriza iso_code canónico; fallback a body.country si ISO2.
    const iso2Candidate = countryIsoCode && countryIsoCode.length >= 2
      ? countryIsoCode.slice(0, 2).toUpperCase()
      : (typeof body.country === 'string' && ISO2_RE.test(body.country.trim())
          ? body.country.trim().toUpperCase()
          : null);
    if (iso2Candidate && regionIsoCode && regionHasNoProvincia(iso2Candidate, regionIsoCode)) {
      regionForbidsProvincia = true;
      if (ids['zone_id']) {
        console.warn('[resolve-admin-area] canon-region-zone-forbidden', {
          iso2: iso2Candidate,
          regionIsoCode,
          droppedZoneId: true,
        });
        ids['zone_id'] = null;
      }
    }
    const canonForCountry = iso2Candidate ? getCountryCanon(iso2Candidate) : null;

    return new Response(JSON.stringify({
      ids,
      meta: {
        region_iso_code: regionIsoCode,
        canon: {
          iso2: canonForCountry?.iso2 ?? null,
          regionForbidsProvincia,
        },
      },
    }), {
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
