/**
 * data-sources.ts — Helper único compartido para leer la tabla `data_sources`.
 *
 * Las edge functions deben respetar los toggles del panel admin "Fuentes de datos".
 * Este helper centraliza la lectura para no duplicar lógica ni queries inline.
 *
 * Failsafe: si la consulta falla (DB caída, falta de service-role, etc.), devuelve
 *   `null` que significa "no filtrar, asumir todo habilitado" — así un fallo de
 *   infraestructura nunca rompe el enriquecimiento o la búsqueda real.
 *
 * Cache: 60s en memoria del worker. Los toggles de admin se propagan en ≤1 min,
 *   suficiente para una config de administrador y evita machacar Postgres en
 *   batches grandes (batch-enrich llama a enrich-location en bucle).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export type DataSourceKind = 'search' | 'enrichment' | 'scraper';

interface CacheEntry {
  fetchedAt: number;
  codes: Set<string> | null;
}

const TTL_MS = 60_000;
const cache = new Map<DataSourceKind, CacheEntry>();

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL');
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Devuelve el Set de `code`s con `enabled=true` para un `kind`.
 * Devuelve `null` si la consulta falla (= "no filtrar").
 */
export async function getEnabledSourceCodes(
  kind: DataSourceKind
): Promise<Set<string> | null> {
  const now = Date.now();
  const hit = cache.get(kind);
  if (hit && now - hit.fetchedAt < TTL_MS) {
    return hit.codes;
  }

  try {
    const supa = getServiceClient();
    if (!supa) {
      cache.set(kind, { fetchedAt: now, codes: null });
      return null;
    }
    const { data, error } = await supa
      .from('data_sources')
      .select('code, enabled')
      .eq('kind', kind);
    if (error || !Array.isArray(data)) {
      cache.set(kind, { fetchedAt: now, codes: null });
      return null;
    }
    const codes = new Set<string>();
    for (const row of data as Array<{ code: string; enabled: boolean }>) {
      if (row.enabled) codes.add(row.code);
    }
    cache.set(kind, { fetchedAt: now, codes });
    return codes;
  } catch (e) {
    console.warn('[data-sources] fetch failed, defaulting to all-enabled:', e);
    cache.set(kind, { fetchedAt: now, codes: null });
    return null;
  }
}

/**
 * `null` (helper falló) → permitido. `Set` → solo si está dentro.
 */
export function isSourceEnabled(
  enabledSet: Set<string> | null,
  code: string
): boolean {
  if (enabledSet === null) return true;
  return enabledSet.has(code);
}

/**
 * Invalidar cache manualmente (testing).
 */
export function clearDataSourcesCache() {
  cache.clear();
}
