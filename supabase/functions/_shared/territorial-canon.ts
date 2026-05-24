/**
 * Territorial Canon — Mirror técnico (Deno, edge functions).
 *
 * Espejo paritario de `src/shared/geography/territorial-canon.ts`. Codifica
 * §1, §3 y §4 de `docs/contracts/territorial-equivalence-canon.md`. Sin
 * dependencias de cliente. Cualquier divergencia con el mirror TS debe
 * fallar el contract test `src/test/territorial-canon-parity.test.ts`.
 */

export type MunicipioField = 'admin3' | 'locality';
export type LocalityField = 'locality' | 'sublocality';

export interface CountryCanon {
  readonly iso2: string;
  readonly hasProvincia: boolean;
  readonly municipioField: MunicipioField;
  readonly localityField: LocalityField;
  readonly regionEqZoneWhitelist: ReadonlyArray<string>;
  /** T2A-wire — Excepciones regionales (§1.b). Lookup case-sensitive por iso_code. */
  readonly regionsWithoutProvincia?: ReadonlyArray<string>;
}

export const TERRITORIAL_CANON: Readonly<Record<string, CountryCanon>> = Object.freeze({
  ES: { iso2: 'ES', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Asturias', 'Cantabria', 'La Rioja', 'Madrid', 'Murcia', 'Navarra', 'Illes Balears', 'Ceuta', 'Melilla'] },
  FR: { iso2: 'FR', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  IT: { iso2: 'IT', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  GB: { iso2: 'GB', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  US: { iso2: 'US', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['District of Columbia'] },
  PT: { iso2: 'PT', hasProvincia: true, municipioField: 'admin3', localityField: 'locality', regionEqZoneWhitelist: [], regionsWithoutProvincia: ['PT-20', 'PT-30'] },
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
  RU: { iso2: 'RU', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: ['Moskva', 'Moscow', 'Moscú', 'Saint Petersburg', 'Sankt-Peterburg', 'Sevastopol'] },
  // Ola P0 — World Canon Coverage Patch (v1.3.18). Ver mirror TS para fuente.
  IE: { iso2: 'IE', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  HR: { iso2: 'HR', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  RS: { iso2: 'RS', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  BG: { iso2: 'BG', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  HU: { iso2: 'HU', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  ML: { iso2: 'ML', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  SK: { iso2: 'SK', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  CZ: { iso2: 'CZ', hasProvincia: true, municipioField: 'admin3', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  SI: { iso2: 'SI', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
  IS: { iso2: 'IS', hasProvincia: false, municipioField: 'locality', localityField: 'sublocality', regionEqZoneWhitelist: [] },
});

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

function normalizeRegionKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function getCountryCanon(iso2: string | null | undefined): CountryCanon | null {
  const key = normalizeIso2(iso2);
  if (!key) return null;
  return TERRITORIAL_CANON[key] ?? null;
}

export function hasProvincia(iso2: string | null | undefined): boolean {
  return (getCountryCanon(iso2) ?? UNKNOWN_CANON).hasProvincia;
}

export function getMunicipioField(iso2: string | null | undefined): MunicipioField {
  return (getCountryCanon(iso2) ?? UNKNOWN_CANON).municipioField;
}

export function getLocalityField(iso2: string | null | undefined): LocalityField {
  return (getCountryCanon(iso2) ?? UNKNOWN_CANON).localityField;
}

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

/**
 * T2A-wire — §1.b: lookup data-driven de excepciones regionales (PT-20, PT-30,
 * etc.). Case-sensitive sobre iso_code completo. Sin hardcode fuera de canon.
 */
export function regionHasNoProvincia(
  iso2: string | null | undefined,
  regionIsoCode: string | null | undefined,
): boolean {
  const canon = getCountryCanon(iso2);
  if (!canon || !canon.regionsWithoutProvincia || !canon.regionsWithoutProvincia.length) return false;
  if (typeof regionIsoCode !== 'string') return false;
  const code = regionIsoCode.trim();
  if (!code) return false;
  for (const entry of canon.regionsWithoutProvincia) {
    if (entry === code) return true;
  }
  return false;
}


export const COUNTRIES_WITHOUT_PROVINCIA: ReadonlyArray<string> = Object.freeze(
  Object.values(TERRITORIAL_CANON).filter((c) => !c.hasProvincia).map((c) => c.iso2),
);

export const TERRITORIAL_CANON_SIZE = Object.keys(TERRITORIAL_CANON).length;
