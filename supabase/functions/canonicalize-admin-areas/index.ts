// Domain: Geography — One-shot canonicalization of admin_areas.
//
// 1. Deduplica filas por iso_code (países y regiones).
// 2. Deduplica filas por (parent_id, normalize(name)) usando unaccent + lower
//    + strip de prefijos administrativos comunes ("Estado de", "Condado de"…).
// 3. Elige canónica priorizando: iso_code > nombre con tilde español > más antigua.
// 4. Llama _merge_admin_area(orphan, canonical) → re-puntar 8 FKs en locations,
//    fusionar hijos y borrar la orfana. Registra fusión en place_merge_history.
// 5. Mueve los nombres descartados a admin_area_names (kind='alias').
// 6. Refresca cache (continent/country/region/zone) en locations al final.
//
// Solo masters. POST { dryRun?: boolean }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireCapability } from '../_shared/require-capability.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const ADMIN_PREFIX_RE =
  /^(estado de |condado de |región de |regi[oó]n de |provincia de |departamento de |district of |state of |county of |province of |r[eé]gion de la |comunidad (aut[oó]noma )?de |comunidad (aut[oó]noma )?del )/i;

function normalizeName(s: string): string {
  let v = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  v = v.replace(ADMIN_PREFIX_RE, '');
  v = v.replace(/\s+/g, ' ').trim();
  return v;
}

function hasSpanishAccents(s: string): boolean {
  return /[áéíóúñü]/i.test(s);
}

interface AdminRow {
  id: string;
  name: string;
  parent_id: string | null;
  type_id: string;
  iso_code: string | null;
  created_at: string;
  aliases: string[];
}

function pickCanonical(rows: AdminRow[]): AdminRow {
  return [...rows].sort((a, b) => {
    const aIso = a.iso_code ? 1 : 0;
    const bIso = b.iso_code ? 1 : 0;
    if (aIso !== bIso) return bIso - aIso;
    const aAcc = hasSpanishAccents(a.name) ? 1 : 0;
    const bAcc = hasSpanishAccents(b.name) ? 1 : 0;
    if (aAcc !== bAcc) return bAcc - aAcc;
    return a.created_at.localeCompare(b.created_at);
  })[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Master-only
  const authHeader = req.headers.get('Authorization') ?? '';
  const accessToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  let isMaster = !!accessToken && accessToken === serviceRoleKey;
  let userId: string | null = null;
  if (!isMaster && accessToken) {
    const { data: ud } = await admin.auth.getUser(accessToken);
    userId = ud?.user?.id ?? null;
    if (userId) {
      const { data: roleRow } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'master')
        .maybeSingle();
      isMaster = !!roleRow;
    }
  }
  if (!isMaster) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const dryRun = !!body.dryRun;

  const summary = {
    iso_groups_collapsed: 0,
    name_groups_collapsed: 0,
    rows_merged: 0,
    aliases_seeded: 0,
    cache_rows_refreshed: 0,
    dryRun,
    sample: [] as Array<{ canonical: string; merged_from: string[] }>,
  };

  // Paginated fetch (admin_areas can exceed PostgREST default 1000-row cap).
  async function fetchAllAdminAreas(): Promise<AdminRow[]> {
    const PAGE = 1000;
    const out: AdminRow[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await admin
        .from('admin_areas')
        .select('id, name, parent_id, type_id, iso_code, created_at, aliases')
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = (data ?? []) as AdminRow[];
      out.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  let rows: AdminRow[];
  try {
    rows = await fetchAllAdminAreas();
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ---- PASS 1: collapse by iso_code (within same type_id) ----
  const isoGroups = new Map<string, AdminRow[]>();
  for (const r of rows) {
    if (!r.iso_code) continue;
    const key = `${r.type_id}::${r.iso_code.toUpperCase()}`;
    const arr = isoGroups.get(key) ?? [];
    arr.push(r);
    isoGroups.set(key, arr);
  }

  const mergedIds = new Set<string>();

  for (const [, group] of isoGroups) {
    if (group.length < 2) continue;
    const canonical = pickCanonical(group);
    const orphans = group.filter((r) => r.id !== canonical.id);
    summary.iso_groups_collapsed++;
    const mergedFrom: string[] = [];
    for (const orphan of orphans) {
      if (mergedIds.has(orphan.id)) continue;
      mergedFrom.push(orphan.name);
      if (!dryRun) {
        // Seed alias before merge (cascade will drop it otherwise)
        await admin.from('admin_area_names').upsert(
          {
            area_id: canonical.id,
            language: 'und',
            name: orphan.name,
            name_kind: 'alias',
            source: 'canonicalize',
            confidence: 70,
          },
          { onConflict: 'area_id,language,name_kind,name', ignoreDuplicates: true },
        );
        // Existing aliases too
        for (const al of orphan.aliases ?? []) {
          await admin.from('admin_area_names').upsert(
            {
              area_id: canonical.id,
              language: 'und',
              name: al,
              name_kind: 'alias',
              source: 'canonicalize',
              confidence: 60,
            },
            { onConflict: 'area_id,language,name_kind,name', ignoreDuplicates: true },
          );
          summary.aliases_seeded++;
        }
        summary.aliases_seeded++;
        await admin.rpc('_merge_admin_area', { _orphan: orphan.id, _canonical: canonical.id });
        await admin.from('place_merge_history').insert({
          source_place_id: orphan.id,
          target_place_id: canonical.id,
          reason: `iso_code=${canonical.iso_code}`,
          merged_by: userId,
        });
      }
      mergedIds.add(orphan.id);
      summary.rows_merged++;
    }
    if (summary.sample.length < 20) {
      summary.sample.push({ canonical: `${canonical.name} (${canonical.iso_code})`, merged_from: mergedFrom });
    }
  }

  // ---- PASS 2: collapse by (type_id, parent_id, normalized name) ----
  // Re-fetch (paginated) to skip rows already merged.
  let remaining: AdminRow[];
  try {
    remaining = await fetchAllAdminAreas();
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const nameGroups = new Map<string, AdminRow[]>();
  for (const r of remaining) {
    const key = `${r.type_id}::${r.parent_id ?? 'NULL'}::${normalizeName(r.name)}`;
    const arr = nameGroups.get(key) ?? [];
    arr.push(r);
    nameGroups.set(key, arr);
  }

  for (const [, group] of nameGroups) {
    if (group.length < 2) continue;
    const canonical = pickCanonical(group);
    const orphans = group.filter((r) => r.id !== canonical.id);
    summary.name_groups_collapsed++;
    const mergedFrom: string[] = [];
    for (const orphan of orphans) {
      mergedFrom.push(orphan.name);
      if (!dryRun) {
        await admin.from('admin_area_names').upsert(
          {
            area_id: canonical.id,
            language: 'und',
            name: orphan.name,
            name_kind: 'alias',
            source: 'canonicalize',
            confidence: 70,
          },
          { onConflict: 'area_id,language,name_kind,name', ignoreDuplicates: true },
        );
        for (const al of orphan.aliases ?? []) {
          await admin.from('admin_area_names').upsert(
            {
              area_id: canonical.id,
              language: 'und',
              name: al,
              name_kind: 'alias',
              source: 'canonicalize',
              confidence: 60,
            },
            { onConflict: 'area_id,language,name_kind,name', ignoreDuplicates: true },
          );
          summary.aliases_seeded++;
        }
        summary.aliases_seeded++;
        await admin.rpc('_merge_admin_area', { _orphan: orphan.id, _canonical: canonical.id });
        await admin.from('place_merge_history').insert({
          source_place_id: orphan.id,
          target_place_id: canonical.id,
          reason: `name+parent: "${normalizeName(canonical.name)}"`,
          merged_by: userId,
        });
      }
      summary.rows_merged++;
    }
    if (summary.sample.length < 40) {
      summary.sample.push({ canonical: canonical.name, merged_from: mergedFrom });
    }
  }

  // ---- PASS 3: refresh text cache in locations from canonical FK names ----
  if (!dryRun) {
    const { data: refreshed, error: refErr } = await admin.rpc(
      'refresh_locations_admin_cache',
    );
    if (refErr) {
      console.warn('[canonicalize] refresh_locations_admin_cache failed', refErr);
    } else {
      summary.cache_rows_refreshed = (refreshed as number) ?? 0;
    }
  }

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});
