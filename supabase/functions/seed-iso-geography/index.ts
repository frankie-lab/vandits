// Domain: Geography — Phase 3 seed for ISO 3166-1 (countries) and ISO 3166-2
// (admin level 1 subdivisions) into `admin_areas`.
//
// Idempotent: matches existing rows by iso_code (α2 for countries, α2-XX for
// subdivisions) and only ENRICHES blank canonical fields. Never overwrites a
// human-edited `name`. New rows are created with parent_id wired to the
// continent / country.
//
// Data sources (stable, public, no auth):
//   - mledoze/countries (countries.json): cca2, cca3, ccn3, name.common,
//     translations.spa.common, name.native, region (continent).
//   - olahol/iso-3166-2.json: subdivisions per country (code, name, type).
//
// Input: { mode?: 'countries' | 'subdivisions' | 'all', limit?: number }
// Output: { countriesUpserted, subdivisionsUpserted, errors }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const COUNTRIES_URL =
  'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const SUBDIVISIONS_URL =
  'https://raw.githubusercontent.com/olahol/iso-3166-2.json/master/iso-3166-2.json';

const REGION_TO_CONTINENT_ES: Record<string, string> = {
  Africa: 'África',
  Americas: 'América', // ajustaremos N/S por subregion
  Asia: 'Asia',
  Europe: 'Europa',
  Oceania: 'Oceanía',
  Antarctic: 'Antártida',
};

interface RawCountry {
  cca2: string;
  cca3: string;
  ccn3?: string;
  name: { common: string; official: string; native?: Record<string, { common: string }> };
  translations?: Record<string, { common: string; official: string }>;
  region: string;
  subregion?: string;
  timezones?: string[];
}

interface RawSubdivision {
  name: string;
  type?: string;
}
type SubdivisionsByCountry = Record<string, { name: string; divisions: Record<string, string> }>;

function continentNameEs(country: RawCountry): string {
  const r = country.region;
  if (r === 'Americas') {
    return country.subregion?.includes('South') ? 'América del Sur' : 'América del Norte';
  }
  return REGION_TO_CONTINENT_ES[r] ?? r;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const mode = (body.mode ?? 'all') as 'countries' | 'subdivisions' | 'all';
  const limit = typeof body.limit === 'number' ? body.limit : undefined;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Resolve type_ids once.
  const { data: typeRows } = await admin
    .from('place_types')
    .select('id, code')
    .in('code', ['continent', 'country', 'region']);
  const typeId = Object.fromEntries((typeRows ?? []).map((r) => [r.code, r.id])) as
    Record<string, string>;
  if (!typeId.continent || !typeId.country || !typeId.region) {
    return json({ error: 'place_types missing (continent/country/region)' }, 500);
  }

  const errors: string[] = [];
  let countriesUpserted = 0;
  let subdivisionsUpserted = 0;

  // ---- Cache de continentes por nombre (id resuelto on-the-fly) ----
  const continentIdByName = new Map<string, string>();
  async function ensureContinent(nameEs: string): Promise<string | null> {
    if (continentIdByName.has(nameEs)) return continentIdByName.get(nameEs)!;
    const { data: existing } = await admin
      .from('admin_areas')
      .select('id')
      .eq('type_id', typeId.continent)
      .ilike('name', nameEs)
      .maybeSingle();
    let id = existing?.id ?? null;
    if (!id) {
      const { data: ins, error } = await admin
        .from('admin_areas')
        .insert({ name: nameEs, type_id: typeId.continent, source: 'iso-seed' })
        .select('id')
        .single();
      if (error) {
        errors.push(`continent ${nameEs}: ${error.message}`);
        return null;
      }
      id = ins.id;
    }
    continentIdByName.set(nameEs, id!);
    return id;
  }

  // ---------- COUNTRIES ----------
  let countriesData: RawCountry[] = [];
  if (mode === 'countries' || mode === 'all') {
    try {
      const res = await fetch(COUNTRIES_URL);
      countriesData = (await res.json()) as RawCountry[];
    } catch (e) {
      return json({ error: `countries fetch failed: ${(e as Error).message}` }, 502);
    }

    const slice = limit ? countriesData.slice(0, limit) : countriesData;
    for (const c of slice) {
      try {
        const cc = c.cca2.toUpperCase();
        const continentEs = continentNameEs(c);
        const continentId = await ensureContinent(continentEs);

        const nameEn = c.name.common;
        const nameEs = c.translations?.spa?.common ?? nameEn;
        const nameNative = c.name.native
          ? Object.values(c.name.native)[0]?.common
          : undefined;
        const translations: Record<string, string> = {};
        if (c.translations?.spa?.common) translations.es = c.translations.spa.common;
        if (c.translations?.fra?.common) translations.fr = c.translations.fra.common;
        if (c.translations?.deu?.common) translations.de = c.translations.deu.common;
        if (c.translations?.ita?.common) translations.it = c.translations.ita.common;
        if (c.translations?.por?.common) translations.pt = c.translations.por.common;
        if (nameNative) translations[c.cca2.toLowerCase()] = nameNative;
        translations.en = nameEn;

        // Match existing by iso_code + country type.
        const { data: existing } = await admin
          .from('admin_areas')
          .select('id, name, iso_code_alpha3, m49_code, name_translations, parent_id')
          .eq('type_id', typeId.country)
          .eq('iso_code', cc)
          .maybeSingle();

        const tz = c.timezones?.[0] ?? null;

        if (existing) {
          const patch: Record<string, unknown> = {};
          if (!existing.iso_code_alpha3) patch.iso_code_alpha3 = c.cca3;
          if (!existing.m49_code && c.ccn3) patch.m49_code = parseInt(c.ccn3, 10);
          if (!existing.parent_id && continentId) patch.parent_id = continentId;
          // Merge translations (no overwrite of existing keys).
          const merged = { ...translations, ...(existing.name_translations ?? {}) };
          if (JSON.stringify(merged) !== JSON.stringify(existing.name_translations ?? {})) {
            patch.name_translations = merged;
          }
          if (Object.keys(patch).length > 0) {
            const { error } = await admin.from('admin_areas').update(patch).eq('id', existing.id);
            if (error) errors.push(`country ${cc} update: ${error.message}`);
            else countriesUpserted++;
          }
        } else {
          const { error } = await admin.from('admin_areas').insert({
            name: nameEs,
            type_id: typeId.country,
            parent_id: continentId,
            iso_code: cc,
            iso_code_alpha3: c.cca3,
            m49_code: c.ccn3 ? parseInt(c.ccn3, 10) : null,
            name_lang: 'es',
            name_translations: translations,
            timezone: tz,
            source: 'iso-seed',
          });
          if (error) errors.push(`country ${cc} insert: ${error.message}`);
          else countriesUpserted++;
        }
      } catch (e) {
        errors.push(`country ${c.cca2}: ${(e as Error).message}`);
      }
    }
  }

  // ---------- SUBDIVISIONS (ISO 3166-2 nivel 1) ----------
  if (mode === 'subdivisions' || mode === 'all') {
    let subs: SubdivisionsByCountry = {};
    try {
      const res = await fetch(SUBDIVISIONS_URL);
      subs = (await res.json()) as SubdivisionsByCountry;
    } catch (e) {
      return json({
        error: `subdivisions fetch failed: ${(e as Error).message}`,
        countriesUpserted,
      }, 502);
    }

    // Resolve all country ids in one batch.
    const ccs = Object.keys(subs).map((s) => s.toUpperCase());
    const { data: countryRows } = await admin
      .from('admin_areas')
      .select('id, iso_code')
      .eq('type_id', typeId.country)
      .in('iso_code', ccs);
    const countryIdByCC = new Map<string, string>(
      (countryRows ?? []).map((r) => [r.iso_code as string, r.id as string]),
    );

    const ccList = limit ? Object.keys(subs).slice(0, limit) : Object.keys(subs);
    for (const ccRaw of ccList) {
      const cc = ccRaw.toUpperCase();
      const countryId = countryIdByCC.get(cc);
      if (!countryId) continue;
      const dict = subs[ccRaw]?.divisions ?? {};
      for (const [subCode, subNameRaw] of Object.entries(dict)) {
        const sub: RawSubdivision = { name: subNameRaw, type: undefined };
        try {
          // ISO 3166-2 codes look like "ES-MD"; many sources strip the prefix.
          const fullCode = subCode.includes('-') ? subCode.toUpperCase() : `${cc}-${subCode.toUpperCase()}`;
          const { data: existing } = await admin
            .from('admin_areas')
            .select('id, admin_type_local, parent_id')
            .eq('type_id', typeId.region)
            .eq('iso_code', fullCode)
            .maybeSingle();

          if (existing) {
            const patch: Record<string, unknown> = {};
            if (!existing.admin_type_local && sub.type) patch.admin_type_local = sub.type;
            if (!existing.parent_id) patch.parent_id = countryId;
            if (Object.keys(patch).length > 0) {
              const { error } = await admin.from('admin_areas').update(patch).eq('id', existing.id);
              if (error) errors.push(`sub ${fullCode} update: ${error.message}`);
              else subdivisionsUpserted++;
            }
          } else {
            // Avoid creating a duplicate if an unkeyed twin exists by name+parent.
            const { data: twin } = await admin
              .from('admin_areas')
              .select('id, iso_code')
              .eq('type_id', typeId.region)
              .eq('parent_id', countryId)
              .ilike('name', sub.name)
              .maybeSingle();
            if (twin && !twin.iso_code) {
              const { error } = await admin
                .from('admin_areas')
                .update({
                  iso_code: fullCode,
                  admin_type_local: sub.type ?? null,
                  source: 'iso-seed',
                })
                .eq('id', twin.id);
              if (error) errors.push(`sub ${fullCode} attach: ${error.message}`);
              else subdivisionsUpserted++;
            } else if (!twin) {
              const { error } = await admin.from('admin_areas').insert({
                name: sub.name,
                type_id: typeId.region,
                parent_id: countryId,
                iso_code: fullCode,
                admin_type_local: sub.type ?? null,
                source: 'iso-seed',
              });
              if (error) errors.push(`sub ${fullCode} insert: ${error.message}`);
              else subdivisionsUpserted++;
            }
          }
        } catch (e) {
          errors.push(`sub ${ccRaw}/${subCode}: ${(e as Error).message}`);
        }
      }
    }
  }

  return json({
    countriesUpserted,
    subdivisionsUpserted,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
  }, 200);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
