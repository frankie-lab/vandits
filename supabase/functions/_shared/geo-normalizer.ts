// Domain: Geography — Normaliza Nominatim address → 7 niveles canónicos.
// Una sola fuente de verdad por país. Para añadir un país nuevo, añade una entrada en COUNTRY_RULES.
// Niveles: continent, country, region, zone, admin3, locality, sublocality.
// Cada campo de Nominatim aparece en UN ÚNICO nivel: si el mismo valor cae en varios candidatos,
// se conserva en el nivel más alto y los inferiores quedan vacíos.

export interface NominatimAddress {
  country?: string;
  country_code?: string;
  state?: string;
  region?: string;
  province?: string;
  state_district?: string;
  county?: string;
  district?: string;
  municipality?: string;
  city_district?: string;
  borough?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  road?: string;
  house_number?: string;
  postcode?: string;
  [k: string]: unknown;
}

export interface CanonicalGeo {
  continent?: string;
  country?: string;
  /** ISO 3166-1 alpha-2 (mayúsculas), e.g. "ES", "FR". */
  country_code?: string;
  region?: string;        // admin_nivel_1: comunidad/región/estado
  /** Tipo administrativo local del nivel 1 ("Comunidad Autónoma", "Région", "State"…). */
  region_type?: string;
  zone?: string;          // admin_nivel_2: provincia/departamento/condado
  zone_type?: string;
  admin3?: string;        // comarca/municipio mayor
  admin3_type?: string;
  locality?: string;      // ciudad/villa/pueblo
  sublocality?: string;   // barrio/distrito
  street?: string;
  postal_address?: string;
  /** Código postal (UPU). */
  postal_code?: string;
}

type FieldKey = keyof NominatimAddress;

// Mapeo por país: cada nivel es una lista de candidatos en orden de preferencia.
// La lista GENÉRICA cubre el resto del mundo.
interface CountryRule {
  region: FieldKey[];
  zone: FieldKey[];
  admin3: FieldKey[];
  locality: FieldKey[];
  sublocality: FieldKey[];
}

// REGLA UNIVERSAL (ISO 3166-2):
//   region    = nivel admin 1 (CCAA, state, région, Bundesland) → Nominatim "state"
//   zone      = nivel admin 2 PROVINCIA (province, county, département) → Nominatim "province" PRIMERO
//   admin3    = nivel admin 3 COMARCA (county en ES/IT, distrito municipal en otros)
// Nominatim a veces NO devuelve `province` y solo `county`. En ese caso preferimos
// `state_district` antes que `county` para España/Italia/Portugal porque `county`
// suele contener la COMARCA, no la provincia.
const GENERIC: CountryRule = {
  region: ['state', 'region'],
  zone: ['province', 'state_district', 'county'],
  admin3: ['district', 'municipality', 'city_district', 'borough'],
  locality: ['city', 'town', 'village', 'hamlet'],
  sublocality: ['suburb', 'neighbourhood', 'quarter'],
};

const COUNTRY_RULES: Record<string, CountryRule> = {
  // España: state=CCAA, province=provincia oficial, county=comarca
  es: { region: ['state'], zone: ['province', 'state_district'], admin3: ['county', 'municipality'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Francia: state=région, province/state_district=département, county=arrondissement
  fr: { region: ['state'], zone: ['province', 'state_district', 'county'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Italia: state=regione, province=provincia, county=zona/comune mayor
  it: { region: ['state'], zone: ['province', 'state_district'], admin3: ['county', 'municipality'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Alemania: state=Land, county/state_district=Kreis, municipality=Gemeinde
  de: { region: ['state'], zone: ['county', 'state_district', 'province'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'borough', 'neighbourhood'] },
  // Reino Unido: state=nación constituyente, county=condado
  gb: { region: ['state'], zone: ['county', 'state_district', 'province'], admin3: ['city_district', 'borough', 'district'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  uk: { region: ['state'], zone: ['county', 'state_district', 'province'], admin3: ['city_district', 'borough', 'district'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // USA: state=estado, county=condado
  us: { region: ['state'], zone: ['county', 'state_district'], admin3: ['city_district'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['neighbourhood', 'suburb', 'quarter'] },
  // Portugal: state/district=distrito, municipality=concelho, suburb=freguesia
  pt: { region: ['state', 'district'], zone: ['province', 'state_district', 'county'], admin3: ['municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Canadá: state=provincia/territorio, county=condado
  ca: { region: ['state'], zone: ['county', 'state_district', 'province'], admin3: ['city_district', 'borough'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['neighbourhood', 'suburb', 'quarter'] },
  // Países nórdicos: state=región/condado
  se: { ...GENERIC },
  no: { ...GENERIC },
  dk: { ...GENERIC },
  fi: { ...GENERIC },
  // Latam — siguen patrón estándar
  mx: { region: ['state'], zone: ['county', 'municipality'], admin3: ['city_district', 'borough'], locality: ['city', 'town', 'village'], sublocality: ['neighbourhood', 'suburb', 'quarter'] },
  ar: { region: ['state'], zone: ['county', 'state_district'], admin3: ['municipality'], locality: ['city', 'town', 'village'], sublocality: ['neighbourhood', 'suburb', 'quarter'] },
  br: { region: ['state'], zone: ['state_district', 'region'], admin3: ['municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Japón: state=都道府県 (prefectura), county=郡, city/special ward
  jp: { region: ['state'], zone: ['county', 'state_district'], admin3: ['city_district', 'municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // China: state=provincia, prefectura/condado
  cn: { region: ['state'], zone: ['state_district', 'province'], admin3: ['county', 'city_district', 'municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // India: state=estado, district=distrito, taluk/tehsil
  in: { region: ['state'], zone: ['state_district', 'county'], admin3: ['district', 'municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Suiza: state=cantón, district=distrito, municipality=Gemeinde
  ch: { region: ['state'], zone: ['county', 'state_district', 'province'], admin3: ['district', 'municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Bélgica: state=región, province=provincia, arrondissement
  be: { region: ['state'], zone: ['province', 'state_district'], admin3: ['county', 'municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Países Bajos: state=provincia, gemeente
  nl: { region: ['state'], zone: ['province', 'state_district'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Austria: state=Bundesland, Bezirk
  at: { region: ['state'], zone: ['county', 'state_district'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Irlanda: state/region, county
  ie: { region: ['state', 'region'], zone: ['county', 'state_district'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Australia: state=estado/territorio, LGA
  au: { region: ['state'], zone: ['county', 'state_district'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village', 'suburb'], sublocality: ['neighbourhood', 'quarter'] },
  // Nueva Zelanda: state=región, district
  nz: { region: ['state', 'region'], zone: ['district', 'county'], admin3: ['city_district', 'municipality'], locality: ['city', 'town', 'village', 'suburb'], sublocality: ['neighbourhood', 'quarter'] },
  // Sudáfrica: state=provincia, district municipality
  za: { region: ['state'], zone: ['state_district', 'county'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Israel: state=distrito, subdistrito
  il: { region: ['state'], zone: ['state_district', 'county'], admin3: ['city_district', 'municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // EAU: state=emirato, región
  ae: { region: ['state'], zone: ['region', 'state_district'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
};

// Continente derivado de country_code ISO-3166 alpha-2 (datos estables, sin red).
const CC_TO_CONTINENT: Record<string, string> = {
  // Europa
  es: 'Europa', pt: 'Europa', fr: 'Europa', it: 'Europa', de: 'Europa', gb: 'Europa', uk: 'Europa',
  ie: 'Europa', nl: 'Europa', be: 'Europa', lu: 'Europa', ch: 'Europa', at: 'Europa',
  pl: 'Europa', cz: 'Europa', sk: 'Europa', hu: 'Europa', ro: 'Europa', bg: 'Europa',
  gr: 'Europa', si: 'Europa', hr: 'Europa', rs: 'Europa', ba: 'Europa', mk: 'Europa', al: 'Europa',
  se: 'Europa', no: 'Europa', dk: 'Europa', fi: 'Europa', is: 'Europa', ee: 'Europa', lv: 'Europa', lt: 'Europa',
  ua: 'Europa', by: 'Europa', md: 'Europa', ru: 'Europa',
  mt: 'Europa', cy: 'Europa', ad: 'Europa', mc: 'Europa', sm: 'Europa', va: 'Europa', li: 'Europa', me: 'Europa', xk: 'Europa',
  // América del Norte
  us: 'América del Norte', ca: 'América del Norte', mx: 'América del Norte',
  gt: 'América del Norte', bz: 'América del Norte', sv: 'América del Norte', hn: 'América del Norte', ni: 'América del Norte', cr: 'América del Norte', pa: 'América del Norte',
  cu: 'América del Norte', do: 'América del Norte', ht: 'América del Norte', jm: 'América del Norte', pr: 'América del Norte',
  // América del Sur
  br: 'América del Sur', ar: 'América del Sur', cl: 'América del Sur', co: 'América del Sur', pe: 'América del Sur',
  uy: 'América del Sur', py: 'América del Sur', bo: 'América del Sur', ec: 'América del Sur', ve: 'América del Sur', gy: 'América del Sur', sr: 'América del Sur', gf: 'América del Sur',
  // Asia
  cn: 'Asia', jp: 'Asia', kr: 'Asia', kp: 'Asia', mn: 'Asia', tw: 'Asia', hk: 'Asia', mo: 'Asia',
  in: 'Asia', pk: 'Asia', bd: 'Asia', np: 'Asia', bt: 'Asia', lk: 'Asia',
  th: 'Asia', vn: 'Asia', kh: 'Asia', la: 'Asia', mm: 'Asia', my: 'Asia', sg: 'Asia', id: 'Asia', ph: 'Asia', bn: 'Asia', tl: 'Asia',
  tr: 'Asia', sa: 'Asia', ae: 'Asia', qa: 'Asia', kw: 'Asia', om: 'Asia', bh: 'Asia', ye: 'Asia',
  ir: 'Asia', iq: 'Asia', sy: 'Asia', jo: 'Asia', il: 'Asia', ps: 'Asia', lb: 'Asia',
  kz: 'Asia', uz: 'Asia', tm: 'Asia', kg: 'Asia', tj: 'Asia', af: 'Asia', am: 'Asia', az: 'Asia', ge: 'Asia',
  // África
  ma: 'África', dz: 'África', tn: 'África', ly: 'África', eg: 'África', sd: 'África',
  ng: 'África', gh: 'África', sn: 'África', ci: 'África', ml: 'África', bf: 'África', ne: 'África', td: 'África',
  ke: 'África', tz: 'África', ug: 'África', et: 'África', so: 'África', rw: 'África', bi: 'África',
  za: 'África', na: 'África', bw: 'África', zw: 'África', mz: 'África', mg: 'África', ao: 'África', cd: 'África', cg: 'África', cm: 'África',
  // Oceanía
  au: 'Oceanía', nz: 'Oceanía', fj: 'Oceanía', pg: 'Oceanía', sb: 'Oceanía', vu: 'Oceanía', nc: 'Oceanía', pf: 'Oceanía',
};

function pickFirst(
  addr: NominatimAddress,
  keys: FieldKey[],
  used: Set<string>,
): { value?: string; sourceKey?: FieldKey } {
  for (const k of keys) {
    const raw = addr[k];
    if (typeof raw !== 'string') continue;
    const v = raw.trim();
    if (!v) continue;
    if (used.has(v.toLowerCase())) continue;
    used.add(v.toLowerCase());
    return { value: v, sourceKey: k };
  }
  return {};
}

// Mapeo del campo Nominatim al tipo administrativo localizado (ES) por país.
// Sirve como hint genérico cuando la fuente no expone explícitamente el tipo.
const NOMINATIM_FIELD_TO_TYPE_LABEL: Record<string, string> = {
  state: 'Región/Estado',
  region: 'Región',
  province: 'Provincia',
  state_district: 'Distrito estatal',
  county: 'Condado/Provincia',
  district: 'Distrito',
  municipality: 'Municipio',
  city_district: 'Distrito municipal',
  borough: 'Barrio administrativo',
  city: 'Ciudad',
  town: 'Villa',
  village: 'Pueblo',
  hamlet: 'Aldea',
  suburb: 'Suburbio',
  neighbourhood: 'Barrio',
  quarter: 'Barrio',
};

// Override por país: nombre real del nivel local. Cubre los casos más comunes.
const COUNTRY_LEVEL_LABELS: Record<string, { region?: string; zone?: string; admin3?: string }> = {
  es: { region: 'Comunidad Autónoma', zone: 'Provincia', admin3: 'Municipio' },
  fr: { region: 'Région', zone: 'Département', admin3: 'Commune' },
  it: { region: 'Regione', zone: 'Provincia', admin3: 'Comune' },
  de: { region: 'Bundesland', zone: 'Kreis', admin3: 'Gemeinde' },
  gb: { region: 'Country/Region', zone: 'County', admin3: 'District' },
  uk: { region: 'Country/Region', zone: 'County', admin3: 'District' },
  us: { region: 'State', zone: 'County', admin3: 'City' },
  pt: { region: 'Distrito', zone: 'Concelho', admin3: 'Freguesia' },
  ca: { region: 'Province/Territory', zone: 'County', admin3: 'Municipality' },
  mx: { region: 'Estado', zone: 'Municipio' },
  ar: { region: 'Provincia', zone: 'Departamento' },
  br: { region: 'Estado', zone: 'Mesorregião', admin3: 'Município' },
  jp: { region: '都道府県', zone: '郡' },
};

function labelFor(cc: string, level: 'region' | 'zone' | 'admin3', sourceKey?: FieldKey): string | undefined {
  const overrides = COUNTRY_LEVEL_LABELS[cc];
  if (overrides && overrides[level]) return overrides[level];
  if (sourceKey) return NOMINATIM_FIELD_TO_TYPE_LABEL[sourceKey];
  return undefined;
}

/** Convierte una respuesta cruda de Nominatim a los 7 niveles canónicos. */
export function normalizeNominatim(addr: NominatimAddress): CanonicalGeo {
  const cc = (addr.country_code || '').toLowerCase();
  const rule = COUNTRY_RULES[cc] || GENERIC;
  const used = new Set<string>();

  const country = typeof addr.country === 'string' ? addr.country.trim() : undefined;
  if (country) used.add(country.toLowerCase());

  const region = pickFirst(addr, rule.region, used);
  const zone = pickFirst(addr, rule.zone, used);
  const admin3 = pickFirst(addr, rule.admin3, used);
  const locality = pickFirst(addr, rule.locality, used);
  const sublocality = pickFirst(addr, rule.sublocality, used);

  let postal_address: string | undefined;
  if (addr.road) {
    const parts = [addr.road];
    if (addr.house_number) parts.unshift(addr.house_number);
    postal_address = parts.join(' ');
    if (addr.postcode) postal_address += `, ${addr.postcode}`;
  }

  return {
    continent: cc ? CC_TO_CONTINENT[cc] : undefined,
    country,
    country_code: cc ? cc.toUpperCase() : undefined,
    region: region.value,
    region_type: region.value ? labelFor(cc, 'region', region.sourceKey) : undefined,
    zone: zone.value,
    zone_type: zone.value ? labelFor(cc, 'zone', zone.sourceKey) : undefined,
    admin3: admin3.value,
    admin3_type: admin3.value ? labelFor(cc, 'admin3', admin3.sourceKey) : undefined,
    locality: locality.value,
    sublocality: sublocality.value,
    street: typeof addr.road === 'string' ? addr.road.trim() || undefined : undefined,
    postal_address,
    postal_code: typeof addr.postcode === 'string' ? addr.postcode.trim() || undefined : undefined,
  };
}

/** Merge: low overrides en niveles bajos, high rellena niveles altos vacíos. */
export function mergeCanonical(low: CanonicalGeo, high: CanonicalGeo): CanonicalGeo {
  return {
    continent: low.continent ?? high.continent,
    country: low.country ?? high.country,
    country_code: low.country_code ?? high.country_code,
    region: low.region ?? high.region,
    region_type: low.region_type ?? high.region_type,
    zone: low.zone ?? high.zone,
    zone_type: low.zone_type ?? high.zone_type,
    admin3: low.admin3 ?? high.admin3,
    admin3_type: low.admin3_type ?? high.admin3_type,
    locality: low.locality ?? high.locality,
    sublocality: low.sublocality ?? high.sublocality,
    street: low.street ?? high.street,
    postal_address: low.postal_address ?? high.postal_address,
    postal_code: low.postal_code ?? high.postal_code,
  };
}

/** ¿Faltan niveles altos (region/zone/admin3)? Si sí, conviene segunda pasada con zoom bajo. */
export function isMissingHighLevels(c: CanonicalGeo): boolean {
  return !c.region || !c.zone || !c.admin3;
}
