/**
 * Territorial Canon — Mirror técnico (TS, cliente).
 *
 * Espejo data-driven de la tabla §1 de
 * `docs/contracts/territorial-equivalence-canon.md` (38 países PDF + RU
 * operativo = 39 entradas). Codifica reglas de jerarquía administrativa por
 * país ISO2: si tiene nivel "provincia", dónde aterriza el municipio
 * (`admin3_id` vs `locality_id`), dónde aterriza la localidad/barrio
 * (`locality_id` vs `sublocality_id`) y qué regiones uniprovinciales
 * permiten legítimamente `region_id == zone_id` (§4).
 *
 * **No-wiring**: este módulo es lookup PURO. Los consumidores
 * (`resolveAllFks`, `getLocationHierarchy`, `GeographyTree`, parsers de
 * import, `compute-geo-health`) se cablearán en PRs separados (T2A-wire).
 *
 * Espejo Deno paritario: `supabase/functions/_shared/territorial-canon.ts`.
 * Contract test: `src/test/territorial-canon-parity.test.ts`.
 */

export type MunicipioField = 'admin3' | 'locality';
export type LocalityField = 'locality' | 'sublocality';

export interface CountryCanon {
  /** ISO 3166-1 alpha-2 en MAYÚSCULAS. */
  readonly iso2: string;
  /** §1: el país tiene nivel administrativo "provincia" canónico. */
  readonly hasProvincia: boolean;
  /** §1: dónde aterriza el municipio. */
  readonly municipioField: MunicipioField;
  /** §1: dónde aterriza la localidad/barrio/pueblo. */
  readonly localityField: LocalityField;
  /**
   * §4: regiones uniprovinciales donde `region_id == zone_id` es legítimo.
   * Las entradas se guardan en forma original; el lookup compara tras
   * normalización (lowercase + NFD strip diacritics + trim).
   */
  readonly regionEqZoneWhitelist: ReadonlyArray<string>;
}

/**
 * Tabla maestra. Orden = §1 del contrato (PDF + RU operativo).
 * No reordenar sin actualizar el contract test PDF-conformance.
 */
export const TERRITORIAL_CANON: Readonly<Record<string, CountryCanon>> = Object.freeze({
  ES: { iso2: 'ES', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Asturias', 'Cantabria', 'La Rioja', 'Madrid', 'Murcia', 'Navarra', 'Illes Balears', 'Ceuta', 'Melilla'] },
  FR: { iso2: 'FR', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  IT: { iso2: 'IT', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  GB: { iso2: 'GB', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  US: { iso2: 'US', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['District of Columbia'] },
  PT: { iso2: 'PT', hasProvincia: true, municipioField: 'admin3', localityField: 'locality', regionEqZoneWhitelist: [] },
  RO: { iso2: 'RO', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  DE: { iso2: 'DE', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Berlin', 'Hamburg', 'Bremen'] },
  FI: { iso2: 'FI', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  TR: { iso2: 'TR', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  MA: { iso2: 'MA', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  NO: { iso2: 'NO', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  PL: { iso2: 'PL', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Warszawa', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk'] },
  GR: { iso2: 'GR', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  NG: { iso2: 'NG', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  CH: { iso2: 'CH', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Genève', 'Basel-Stadt', 'Neuchâtel', 'Appenzell Innerrhoden', 'Appenzell Ausserrhoden', 'Glarus', 'Uri', 'Zug', 'Schaffhausen', 'Nidwalden', 'Obwalden'] },
  AT: { iso2: 'AT', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Wien'] },
  NL: { iso2: 'NL', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  UA: { iso2: 'UA', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  SE: { iso2: 'SE', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  CN: { iso2: 'CN', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Beijing', 'Shanghai', 'Tianjin', 'Chongqing'] },
  AR: { iso2: 'AR', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Ciudad Autónoma de Buenos Aires', 'CABA'] },
  BR: { iso2: 'BR', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  CA: { iso2: 'CA', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  CL: { iso2: 'CL', hasProvincia: true, municipioField: 'admin3', localityField: 'locality', regionEqZoneWhitelist: [] },
  NZ: { iso2: 'NZ', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  AU: { iso2: 'AU', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  ZA: { iso2: 'ZA', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  BE: { iso2: 'BE', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Brussels-Capital', 'Bruxelles-Capitale', 'Brussel'] },
  EG: { iso2: 'EG', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Cairo', 'Alexandria', 'Port Said', 'Suez', 'Luxor'] },
  ID: { iso2: 'ID', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['DKI Jakarta', 'Jakarta'] },
  JP: { iso2: 'JP', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  MX: { iso2: 'MX', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  DZ: { iso2: 'DZ', hasProvincia: true, municipioField: 'admin3', localityField: 'locality', regionEqZoneWhitelist: [] },
  CO: { iso2: 'CO', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  KR: { iso2: 'KR', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Ulsan'] },
  PH: { iso2: 'PH', hasProvincia: true, municipioField: 'admin3', localityField: 'locality', regionEqZoneWhitelist: ['Manila', 'Cebu City', 'Davao City', 'Quezon City'] },
  IN: { iso2: 'IN', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Chandigarh', 'Lakshadweep', 'Delhi'] },
  RU: { iso2: 'RU', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Moskva', 'Moscow', 'Saint Petersburg', 'Sankt-Peterburg', 'Sevastopol'] },
});

/**
 * §3 fallback para ISO2 desconocido (Islandia, Mónaco, Liechtenstein, etc.
 * y cualquier país fuera del PDF). Tratar como `hasProvincia=false`.
 */
const UNKNOWN_CANON: CountryCanon = Object.freeze({
  iso2: 'ZZ',
  hasProvincia: false,
  municipioField: 'locality',
  localityField: 'sublocality',
  regionEqZoneWhitelist: [],
});

function normalizeIso2(iso2: string | null | undefined): string | null {
  if (!iso2) return null;
  const trimmed = iso2.trim().toUpperCase();
  if (trimmed.length !== 2) return null;
  return trimmed;
}

/**
 * Normalización para lookup de `regionEqZoneWhitelist`: lowercase + NFD strip
 * diacritics + trim. Tolerante a "Moscú"/"Moscu", "Genève"/"Geneve", etc.
 */
function normalizeRegionKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Devuelve la entrada canónica del país, o `null` si ISO2 inválido / no
 * presente en la tabla. Usar `hasProvincia(iso2)` etc. para defaults seguros.
 */
export function getCountryCanon(iso2: string | null | undefined): CountryCanon | null {
  const key = normalizeIso2(iso2);
  if (!key) return null;
  return TERRITORIAL_CANON[key] ?? null;
}

/**
 * `true` si el país tiene nivel provincia canónico. ISO desconocido → `false`
 * (regla conservadora §3: no inventar provincia).
 */
export function hasProvincia(iso2: string | null | undefined): boolean {
  return (getCountryCanon(iso2) ?? UNKNOWN_CANON).hasProvincia;
}

/**
 * Campo donde el municipio aterriza para el país dado. ISO desconocido →
 * `'locality'` (regla conservadora §3).
 */
export function getMunicipioField(iso2: string | null | undefined): MunicipioField {
  return (getCountryCanon(iso2) ?? UNKNOWN_CANON).municipioField;
}

/**
 * Campo donde la localidad/barrio aterriza para el país dado. ISO desconocido
 * → `'sublocality'`.
 */
export function getLocalityField(iso2: string | null | undefined): LocalityField {
  return (getCountryCanon(iso2) ?? UNKNOWN_CANON).localityField;
}

/**
 * §4: `true` si para el país dado la región nombrada está en la lista blanca
 * de uniprovinciales (donde `region_id == zone_id` es legítimo). ISO o región
 * vacíos → `false`.
 */
export function allowsRegionEqualsZone(
  iso2: string | null | undefined,
  regionName: string | null | undefined,
): boolean {
  const canon = getCountryCanon(iso2);
  if (!canon || !regionName) return false;
  const target = normalizeRegionKey(regionName);
  if (!target) return false;
  for (const entry of canon.regionEqZoneWhitelist) {
    if (normalizeRegionKey(entry) === target) return true;
  }
  return false;
}

/** Países declarados `has_provincia=false` (§2). Util para tests/diagnóstico. */
export const COUNTRIES_WITHOUT_PROVINCIA: ReadonlyArray<string> = Object.freeze(
  Object.values(TERRITORIAL_CANON).filter((c) => !c.hasProvincia).map((c) => c.iso2),
);

/** Total de entradas (debe ser 39: 38 PDF + RU). */
export const TERRITORIAL_CANON_SIZE = Object.keys(TERRITORIAL_CANON).length;
