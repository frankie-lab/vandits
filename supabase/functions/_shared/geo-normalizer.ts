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
  region?: string;        // admin_nivel_1: comunidad/región/estado
  zone?: string;          // admin_nivel_2: provincia/departamento/condado
  admin3?: string;        // comarca/municipio mayor
  locality?: string;      // ciudad/villa/pueblo
  sublocality?: string;   // barrio/distrito
  street?: string;
  postal_address?: string;
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

const GENERIC: CountryRule = {
  region: ['state', 'region', 'province'],
  zone: ['county', 'state_district', 'district'],
  admin3: ['municipality', 'city_district', 'borough'],
  locality: ['city', 'town', 'village', 'hamlet'],
  sublocality: ['suburb', 'neighbourhood', 'quarter'],
};

const COUNTRY_RULES: Record<string, CountryRule> = {
  // España: state=CCAA, county=provincia
  es: { region: ['state'], zone: ['county'], admin3: ['municipality'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Francia: state=región, county=departamento
  fr: { region: ['state'], zone: ['county'], admin3: ['municipality'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Italia: state=región, county=provincia
  it: { region: ['state'], zone: ['county'], admin3: ['municipality'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // Alemania: state=Land, county=Kreis
  de: { region: ['state'], zone: ['county', 'state_district'], admin3: ['municipality', 'city_district'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'borough', 'neighbourhood'] },
  // Reino Unido: state suele ser country/region constituyente
  gb: { region: ['state', 'state_district'], zone: ['county'], admin3: ['city_district', 'borough'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  uk: { region: ['state', 'state_district'], zone: ['county'], admin3: ['city_district', 'borough'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
  // USA
  us: { region: ['state'], zone: ['county'], admin3: ['city_district'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['neighbourhood', 'suburb', 'quarter'] },
  // Portugal: distrito + concelho + freguesia
  pt: { region: ['state', 'district'], zone: ['county', 'municipality'], admin3: ['suburb' as FieldKey /* parish */], locality: ['city', 'town', 'village'], sublocality: ['neighbourhood', 'quarter'] },
  // Canadá
  ca: { region: ['state'], zone: ['county', 'state_district'], admin3: ['city_district', 'borough'], locality: ['city', 'town', 'village', 'hamlet'], sublocality: ['neighbourhood', 'suburb', 'quarter'] },
  // Países nórdicos: state=región/condado
  se: { ...GENERIC },
  no: { ...GENERIC },
  dk: { ...GENERIC },
  fi: { ...GENERIC },
  // Latam — siguen patrón estándar
  mx: { region: ['state'], zone: ['county', 'municipality'], admin3: ['city_district', 'borough'], locality: ['city', 'town', 'village'], sublocality: ['neighbourhood', 'suburb', 'quarter'] },
  ar: { region: ['state'], zone: ['county', 'state_district'], admin3: ['municipality'], locality: ['city', 'town', 'village'], sublocality: ['neighbourhood', 'suburb', 'quarter'] },
  br: { region: ['state'], zone: ['state_district', 'region'], admin3: ['municipality'], locality: ['city', 'town', 'village'], sublocality: ['suburb', 'neighbourhood', 'quarter'] },
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

function pickFirst(addr: NominatimAddress, keys: FieldKey[], used: Set<string>): string | undefined {
  for (const k of keys) {
    const raw = addr[k];
    if (typeof raw !== 'string') continue;
    const v = raw.trim();
    if (!v) continue;
    if (used.has(v.toLowerCase())) continue;
    used.add(v.toLowerCase());
    return v;
  }
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
    region,
    zone,
    admin3,
    locality,
    sublocality,
    street: typeof addr.road === 'string' ? addr.road.trim() || undefined : undefined,
    postal_address,
  };
}

/** Merge: low overrides en niveles bajos, high rellena niveles altos vacíos. */
export function mergeCanonical(low: CanonicalGeo, high: CanonicalGeo): CanonicalGeo {
  return {
    continent: low.continent ?? high.continent,
    country: low.country ?? high.country,
    region: low.region ?? high.region,
    zone: low.zone ?? high.zone,
    admin3: low.admin3 ?? high.admin3,
    locality: low.locality ?? high.locality,
    sublocality: low.sublocality ?? high.sublocality,
    street: low.street ?? high.street,
    postal_address: low.postal_address ?? high.postal_address,
  };
}

/** ¿Faltan niveles altos (region/zone/admin3)? Si sí, conviene segunda pasada con zoom bajo. */
export function isMissingHighLevels(c: CanonicalGeo): boolean {
  return !c.region || !c.zone || !c.admin3;
}
