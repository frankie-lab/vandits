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
import {
  getCountryCanon,
  allowsRegionEqualsZone,
} from '@/shared/geography/territorial-canon';
import { nameToIso2 } from '@/shared/geo/country-iso';

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
    const rawIds: AdminAreaIds = { ...EMPTY_IDS, ...(data?.ids ?? {}) };
    // T2A-wire — sanitización data-driven según TERRITORIAL_CANON.
    const ids = applyCanonToResolvedFks(rawIds, input);
    adminCache.set(key, ids);
    return { ...ids };
  } catch (err) {
    console.warn('[resolveAdminFks] failed, returning nulls:', err);
    return { ...EMPTY_IDS };
  }
}

/**
 * T2A-wire — Post-procesa los IDs resueltos según el canon territorial.
 *
 * Defensa en profundidad: aunque la edge `resolve-admin-area` devuelva FKs
 * para niveles "imposibles" en el país (e.g. `zone_id` para SE/NO/BR/AU/JP),
 * aquí se descartan. Reglas §1, §4 del contrato territorial.
 *
 * Idempotente. País desconocido = passthrough (fallback legacy).
 */
function applyCanonToResolvedFks(
  ids: AdminAreaIds,
  input: AdminAreaInput,
): AdminAreaIds {
  const iso2 = nameToIso2(input.country ?? null);
  const canon = getCountryCanon(iso2);
  if (!canon) return ids;

  const out: AdminAreaIds = { ...ids };

  // §1: hasProvincia=false ⇒ zone_id SIEMPRE null.
  if (!canon.hasProvincia && out.zone_id) {
    out.zone_id = null;
  }

  // §1: municipioField='locality' ⇒ admin3_id SIEMPRE null; promueve a locality_id.
  if (canon.municipioField === 'locality' && out.admin3_id) {
    if (!out.locality_id) out.locality_id = out.admin3_id;
    out.admin3_id = null;
  }

  // §4: region==zone sólo si la región está en whitelist uniprovincial.
  if (out.zone_id && out.region_id && out.zone_id === out.region_id) {
    const legit = allowsRegionEqualsZone(canon.iso2, input.region ?? '');
    if (!legit) out.zone_id = null;
  }

  // T2A-wire (§1.b) — TODO: aplicar `regionHasNoProvincia(iso2, regionIsoCode)`
  // para descartar `zone_id` bajo regiones declaradas sin provincia (PT-20
  // Açores, PT-30 Madeira). Requiere que la edge `resolve-admin-area` devuelva
  // `region_iso_code` derivado de `admin_areas.iso_code` por `region_id`.
  // Hook preparado — defensa server-side completa pendiente en follow-up:
  // `docs/audits/t2a-wire-regional-exceptions-edge-ticket.md`.
  // El cliente NO tiene aquí acceso síncrono al iso_code; NO se hardcodea
  // nada (sin lookup por nombre de región). Fase 1 cubre la UI via vista
  // `v_locations_resolved.region_iso_code` y `getLocationHierarchy`.

  return out;
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
