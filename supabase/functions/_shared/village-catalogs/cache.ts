/**
 * Cache helpers para village_catalog_entries.
 * Lectura/upsert sobre la tabla, evitando refetch dentro del TTL.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import type { VillageEntry } from './types.ts';

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL');
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getFreshEntries(
  catalogCode: string,
  ttlDays: number,
): Promise<VillageEntry[] | null> {
  const supa = getServiceClient();
  if (!supa) return null;
  const since = new Date(Date.now() - ttlDays * 86_400_000).toISOString();
  const { data, error } = await supa
    .from('village_catalog_entries')
    .select('*')
    .eq('catalog_code', catalogCode)
    .gte('last_refreshed_at', since)
    .limit(2000);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data as unknown as VillageEntry[];
}

export async function upsertEntries(entries: VillageEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const supa = getServiceClient();
  if (!supa) return;
  // Chunk to keep payload small.
  const chunkSize = 200;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize).map((e) => ({
      ...e,
      last_refreshed_at: new Date().toISOString(),
    }));
    const { error } = await supa
      .from('village_catalog_entries')
      .upsert(chunk, { onConflict: 'catalog_code,source_url' });
    if (error) console.warn('[village-cache] upsert error:', error.message);
  }
}

export async function updateEntryCoords(
  catalogCode: string,
  sourceUrl: string,
  lat: number,
  lng: number,
): Promise<void> {
  const supa = getServiceClient();
  if (!supa) return;
  const { error } = await supa
    .from('village_catalog_entries')
    .update({ latitude: lat, longitude: lng })
    .eq('catalog_code', catalogCode)
    .eq('source_url', sourceUrl);
  if (error) console.warn('[village-cache] coord update error:', error.message);
}
