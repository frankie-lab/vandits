/**
 * Helper centralizado para resolver FKs geográficas y de tipo de lugar.
 *
 * Convierte strings (continent/country/region/zone/admin3/locality/sublocality
 * + place_type code) en UUIDs (continent_id, country_id, ..., type_id) que
 * pueden insertarse/actualizarse en `locations`.
 *
 * - Llama a la edge function `resolve-admin-area` (idempotente) para la cadena
 *   administrativa.
 * - Lee `place_types` directamente para resolver `type_id` por code.
 * - Cachea resultados en memoria por sesión para evitar round-trips repetidos
 *   durante imports masivos.
 *
 * Es la ÚNICA vía recomendada para que un punto nuevo nazca con FKs en lugar
 * de solo strings legacy.
 */
import { supabase } from '@/integrations/supabase/client';

export interface AdminAreaInput {
  continent?: string | null;
  country?: string | null;
  region?: string | null;
  zone?: string | null;
  admin3?: string | null;
  locality?: string | null;
  sublocality?: string | null;
}

export interface AdminAreaIds {
  continent_id: string | null;
  country_id: string | null;
  region_id: string | null;
  zone_id: string | null;
  admin3_id: string | null;
  locality_id: string | null;
  sublocality_id: string | null;
}

export interface ResolveAllInput extends AdminAreaInput {
  /** place_types.code (e.g., 'restaurant', 'monument', 'city') */
  placeTypeCode?: string | null;
}

export interface ResolveAllOutput extends AdminAreaIds {
  type_id: string | null;
}

const EMPTY_IDS: AdminAreaIds = {
  continent_id: null,
  country_id: null,
  region_id: null,
  zone_id: null,
  admin3_id: null,
  locality_id: null,
  sublocality_id: null,
};

const adminCache = new Map<string, AdminAreaIds>();
const typeCache = new Map<string, string | null>();
let typesLoaded = false;
let typesLoadingPromise: Promise<void> | null = null;

function chainKey(input: AdminAreaInput): string {
  return [
    input.continent, input.country, input.region, input.zone,
    input.admin3, input.locality, input.sublocality,
  ].map(s => (s ?? '').trim().toLowerCase()).join('|');
}

function isEmptyChain(input: AdminAreaInput): boolean {
  return !input.continent && !input.country && !input.region && !input.zone
    && !input.admin3 && !input.locality && !input.sublocality;
}

export async function resolveAdminFks(input: AdminAreaInput): Promise<AdminAreaIds> {
  if (isEmptyChain(input)) return { ...EMPTY_IDS };
  const key = chainKey(input);
  const cached = adminCache.get(key);
  if (cached) return { ...cached };

  try {
    const { data, error } = await supabase.functions.invoke('resolve-admin-area', {
      body: {
        continent: input.continent ?? undefined,
        country: input.country ?? undefined,
        region: input.region ?? undefined,
        zone: input.zone ?? undefined,
        admin3: input.admin3 ?? undefined,
        locality: input.locality ?? undefined,
        sublocality: input.sublocality ?? undefined,
      },
    });
    if (error) throw error;
    const ids: AdminAreaIds = { ...EMPTY_IDS, ...(data?.ids ?? {}) };
    adminCache.set(key, ids);
    return { ...ids };
  } catch (err) {
    console.warn('[resolveAdminFks] failed, returning nulls:', err);
    return { ...EMPTY_IDS };
  }
}

async function ensureTypesLoaded(): Promise<void> {
  if (typesLoaded) return;
  if (typesLoadingPromise) return typesLoadingPromise;
  typesLoadingPromise = (async () => {
    const { data, error } = await supabase
      .from('place_types')
      .select('id, code')
      .eq('is_active', true);
    if (!error && data) {
      for (const t of data) typeCache.set(t.code, t.id);
    }
    typesLoaded = true;
  })();
  return typesLoadingPromise;
}

export async function resolvePlaceTypeId(code?: string | null): Promise<string | null> {
  if (!code) return null;
  await ensureTypesLoaded();
  return typeCache.get(code) ?? null;
}

export async function resolveAllFks(input: ResolveAllInput): Promise<ResolveAllOutput> {
  const [admin, type_id] = await Promise.all([
    resolveAdminFks(input),
    resolvePlaceTypeId(input.placeTypeCode),
  ]);
  return { ...admin, type_id };
}

/** For tests / dev only: clear in-memory caches. */
export function __resetAdminFksCache() {
  adminCache.clear();
  typeCache.clear();
  typesLoaded = false;
  typesLoadingPromise = null;
}
