/**
 * Helper único para normalizar nombres de país a ISO 3166-1 alpha-2.
 *
 * Motivo: el gate de coherencia nombre↔coordenadas compara el país que
 * Nominatim devuelve (inglés por defecto: "Spain") contra el que el LLM
 * infiere (en idioma local, normalmente español: "España"). Sin normalizar,
 * el 100% de rechazos en países conocidos son falsos positivos.
 *
 * Cobertura: pares ES/EN/FR/local de los países más frecuentes que aparecen
 * en imports reales. Sigue siendo válido extender el mapa.
 *
 * Este archivo se DUPLICA en `src/shared/geo/country-iso.ts` para que la UI
 * pueda hacer la misma normalización sin importar de edge functions.
 * Mantener ambos en sync.
 */

const NAME_TO_ISO2: Record<string, string> = {
  // Europa
  'spain': 'ES', 'españa': 'ES', 'espana': 'ES', 'espagne': 'ES',
  'portugal': 'PT',
  'france': 'FR', 'francia': 'FR',
  'italy': 'IT', 'italia': 'IT', 'italie': 'IT',
  'germany': 'DE', 'alemania': 'DE', 'deutschland': 'DE', 'allemagne': 'DE',
  'united kingdom': 'GB', 'uk': 'GB', 'reino unido': 'GB', 'great britain': 'GB',
  'royaume-uni': 'GB', 'inglaterra': 'GB', 'england': 'GB',
  'ireland': 'IE', 'irlanda': 'IE',
  'netherlands': 'NL', 'países bajos': 'NL', 'paises bajos': 'NL', 'holanda': 'NL',
  'belgium': 'BE', 'bélgica': 'BE', 'belgica': 'BE', 'belgique': 'BE',
  'luxembourg': 'LU', 'luxemburgo': 'LU',
  'switzerland': 'CH', 'suiza': 'CH', 'suisse': 'CH', 'schweiz': 'CH',
  'austria': 'AT',
  'denmark': 'DK', 'dinamarca': 'DK',
  'sweden': 'SE', 'suecia': 'SE',
  'norway': 'NO', 'noruega': 'NO',
  'finland': 'FI', 'finlandia': 'FI',
  'iceland': 'IS', 'islandia': 'IS',
  'poland': 'PL', 'polonia': 'PL',
  'czech republic': 'CZ', 'czechia': 'CZ', 'república checa': 'CZ', 'republica checa': 'CZ',
  'slovakia': 'SK', 'eslovaquia': 'SK',
  'hungary': 'HU', 'hungría': 'HU', 'hungria': 'HU',
  'romania': 'RO', 'rumania': 'RO', 'rumanía': 'RO',
  'bulgaria': 'BG',
  'greece': 'GR', 'grecia': 'GR',
  'croatia': 'HR', 'croacia': 'HR',
  'serbia': 'RS',
  'slovenia': 'SI', 'eslovenia': 'SI',
  'bosnia and herzegovina': 'BA', 'bosnia y herzegovina': 'BA',
  'montenegro': 'ME',
  'albania': 'AL',
  'north macedonia': 'MK', 'macedonia del norte': 'MK',
  'estonia': 'EE',
  'latvia': 'LV', 'letonia': 'LV',
  'lithuania': 'LT', 'lituania': 'LT',
  'ukraine': 'UA', 'ucrania': 'UA',
  'belarus': 'BY', 'bielorrusia': 'BY',
  'russia': 'RU', 'rusia': 'RU',
  'turkey': 'TR', 'turquía': 'TR', 'turquia': 'TR',
  'malta': 'MT',
  'cyprus': 'CY', 'chipre': 'CY',
  'andorra': 'AD',
  'monaco': 'MC', 'mónaco': 'MC',
  'liechtenstein': 'LI',
  'san marino': 'SM',
  'vatican city': 'VA', 'ciudad del vaticano': 'VA',
  // América
  'united states': 'US', 'usa': 'US', 'estados unidos': 'US', 'eeuu': 'US',
  'canada': 'CA', 'canadá': 'CA',
  'mexico': 'MX', 'méxico': 'MX',
  'argentina': 'AR',
  'brazil': 'BR', 'brasil': 'BR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE', 'perú': 'PE',
  'uruguay': 'UY',
  'paraguay': 'PY',
  'bolivia': 'BO',
  'ecuador': 'EC',
  'venezuela': 'VE',
  'cuba': 'CU',
  'dominican republic': 'DO', 'república dominicana': 'DO', 'republica dominicana': 'DO',
  'puerto rico': 'PR',
  'guatemala': 'GT',
  'honduras': 'HN',
  'el salvador': 'SV',
  'nicaragua': 'NI',
  'costa rica': 'CR',
  'panama': 'PA', 'panamá': 'PA',
  // África
  'morocco': 'MA', 'marruecos': 'MA', 'maroc': 'MA',
  'algeria': 'DZ', 'argelia': 'DZ', 'algérie': 'DZ',
  'tunisia': 'TN', 'túnez': 'TN', 'tunez': 'TN',
  'egypt': 'EG', 'egipto': 'EG',
  'south africa': 'ZA', 'sudáfrica': 'ZA', 'sudafrica': 'ZA',
  // Asia / Oceanía
  'china': 'CN',
  'japan': 'JP', 'japón': 'JP', 'japon': 'JP',
  'south korea': 'KR', 'corea del sur': 'KR',
  'india': 'IN',
  'thailand': 'TH', 'tailandia': 'TH',
  'vietnam': 'VN',
  'indonesia': 'ID',
  'philippines': 'PH', 'filipinas': 'PH',
  'malaysia': 'MY', 'malasia': 'MY',
  'singapore': 'SG', 'singapur': 'SG',
  'australia': 'AU',
  'new zealand': 'NZ', 'nueva zelanda': 'NZ',
  'israel': 'IL',
  'united arab emirates': 'AE', 'emiratos árabes unidos': 'AE',
};

/**
 * Devuelve el ISO α2 si reconoce el nombre. Si no, `null`.
 * Acepta también un código ISO α2 directo ("ES", "es") como entrada.
 */
export function nameToIso2(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Ya es ISO α2
  if (/^[a-zA-Z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return NAME_TO_ISO2[key] ?? null;
}

/**
 * Compara dos nombres de país. Devuelve:
 *   - 'equal'    si ambos resuelven al mismo ISO α2
 *   - 'differ'   si ambos resuelven a ISO α2 distintos (mismatch real)
 *   - 'unknown'  si al menos uno no se puede normalizar (no decidir aquí)
 */
export function compareCountries(
  a: string | null | undefined,
  b: string | null | undefined,
): 'equal' | 'differ' | 'unknown' {
  const ia = nameToIso2(a);
  const ib = nameToIso2(b);
  if (!ia || !ib) {
    // Fallback string-equal (sin acentos, lowercase) antes de rendirnos
    const na = (a ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const nb = (b ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (na && nb && na === nb) return 'equal';
    return 'unknown';
  }
  return ia === ib ? 'equal' : 'differ';
}
