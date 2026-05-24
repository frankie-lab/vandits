/**
 * Espejo Deno de `src/shared/enrichment/geo-coherence.ts`.
 * Fase 6 — R6 del contrato enrichment-coord-coherence.
 * Mantener ambos sincronizados.
 */

import { nameToIso2 } from './country-iso.ts';

export type CanonicalGeo = {
  country?: string | null;
  countryCode?: string | null;
  region?: string | null;
  locality?: string | null;
};

export type AiNarrative = {
  descripcion?: string | null;
  datos_clave?: Record<string, unknown> | null;
  tags?: string[] | null;
  datos_geograficos?: { lugar_interes?: string | null } | null;
};

export type CoherenceSource =
  | 'descripcion'
  | 'lugar_interes'
  | 'datos_clave'
  | 'tags';

export type CoherenceResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'geo_narrative_mismatch';
      level: 'country' | 'region';
      expected: string;
      got: string;
      source: CoherenceSource;
    };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const REGION_CATALOG: Record<string, string[]> = {
  ES: [
    'Andalucía', 'Aragón', 'Asturias', 'Principado de Asturias',
    'Islas Baleares', 'Baleares', 'Canarias', 'Cantabria',
    'Castilla y León', 'Castilla-La Mancha', 'Cataluña', 'Catalunya',
    'Extremadura', 'Galicia', 'La Rioja', 'Madrid', 'Comunidad de Madrid',
    'Murcia', 'Región de Murcia', 'Navarra', 'Comunidad Foral de Navarra',
    'País Vasco', 'Euskadi', 'Comunidad Valenciana', 'Valencia',
    'Ceuta', 'Melilla',
  ],
  FR: [
    'Île-de-France', 'Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté',
    'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est',
    'Hauts-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie',
    'Pays de la Loire', "Provence-Alpes-Côte d'Azur",
  ],
  PT: [
    'Norte', 'Centro', 'Lisboa', 'Alentejo', 'Algarve', 'Madeira', 'Açores',
  ],
  IT: [
    'Lombardia', 'Lazio', 'Toscana', 'Sicilia', 'Sardegna', 'Veneto',
    'Piemonte', 'Campania', 'Puglia', 'Calabria', 'Emilia-Romagna',
    'Liguria', 'Marche', 'Abruzzo', 'Umbria', 'Basilicata', 'Molise',
    "Valle d'Aosta", 'Trentino-Alto Adige', 'Friuli-Venezia Giulia',
  ],
};

function mentionsToken(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  const h = ` ${norm(haystack)} `;
  const t = norm(token);
  if (!t) return false;
  const re = new RegExp(
    `(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
    'i',
  );
  return re.test(h);
}

function extractSources(ai: AiNarrative): Array<{ source: CoherenceSource; text: string }> {
  const out: Array<{ source: CoherenceSource; text: string }> = [];
  if (ai.descripcion) out.push({ source: 'descripcion', text: ai.descripcion });
  const li = ai.datos_geograficos?.lugar_interes;
  if (li) out.push({ source: 'lugar_interes', text: li });
  if (ai.datos_clave) {
    const flat = Object.values(ai.datos_clave)
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    if (flat) out.push({ source: 'datos_clave', text: flat });
  }
  if (ai.tags && ai.tags.length) {
    out.push({ source: 'tags', text: ai.tags.map((t) => t.replace(/^#/, '')).join(' ') });
  }
  return out;
}

const COUNTRY_PROBES: Array<{ label: string; iso2: string }> = [
  { label: 'España', iso2: 'ES' }, { label: 'Spain', iso2: 'ES' },
  { label: 'Portugal', iso2: 'PT' },
  { label: 'France', iso2: 'FR' }, { label: 'Francia', iso2: 'FR' },
  { label: 'Italy', iso2: 'IT' }, { label: 'Italia', iso2: 'IT' },
  { label: 'Germany', iso2: 'DE' }, { label: 'Alemania', iso2: 'DE' },
  { label: 'United Kingdom', iso2: 'GB' }, { label: 'Reino Unido', iso2: 'GB' },
  { label: 'England', iso2: 'GB' }, { label: 'Inglaterra', iso2: 'GB' },
  { label: 'Ireland', iso2: 'IE' }, { label: 'Irlanda', iso2: 'IE' },
  { label: 'Netherlands', iso2: 'NL' }, { label: 'Holanda', iso2: 'NL' },
  { label: 'Belgium', iso2: 'BE' }, { label: 'Bélgica', iso2: 'BE' },
  { label: 'Switzerland', iso2: 'CH' }, { label: 'Suiza', iso2: 'CH' },
  { label: 'Austria', iso2: 'AT' },
  { label: 'Greece', iso2: 'GR' }, { label: 'Grecia', iso2: 'GR' },
  { label: 'Morocco', iso2: 'MA' }, { label: 'Marruecos', iso2: 'MA' },
  { label: 'United States', iso2: 'US' }, { label: 'Estados Unidos', iso2: 'US' },
  { label: 'Canada', iso2: 'CA' }, { label: 'Canadá', iso2: 'CA' },
  { label: 'Mexico', iso2: 'MX' }, { label: 'México', iso2: 'MX' },
  { label: 'Argentina', iso2: 'AR' },
  { label: 'Brazil', iso2: 'BR' }, { label: 'Brasil', iso2: 'BR' },
  { label: 'China', iso2: 'CN' },
  { label: 'Japan', iso2: 'JP' }, { label: 'Japón', iso2: 'JP' },
  { label: 'India', iso2: 'IN' },
  { label: 'Australia', iso2: 'AU' },
];

export function assertGeoCoherence(
  canonical: CanonicalGeo,
  ai: AiNarrative,
): CoherenceResult {
  const canonIso = canonical.countryCode
    ? canonical.countryCode.toUpperCase()
    : nameToIso2(canonical.country ?? null);

  const sources = extractSources(ai);
  if (!sources.length) return { ok: true };

  if (canonIso) {
    for (const { source, text } of sources) {
      for (const probe of COUNTRY_PROBES) {
        if (probe.iso2 === canonIso) continue;
        if (mentionsToken(text, probe.label)) {
          const canonAliases = COUNTRY_PROBES.filter((p) => p.iso2 === canonIso);
          const mentionsCanon = canonAliases.some((p) => mentionsToken(text, p.label));
          if (mentionsCanon) continue;
          return {
            ok: false,
            reason: 'geo_narrative_mismatch',
            level: 'country',
            expected: canonical.country ?? canonIso,
            got: probe.label,
            source,
          };
        }
      }
    }
  }

  const regionCatalog = canonIso ? REGION_CATALOG[canonIso] : undefined;
  if (canonical.region && regionCatalog?.length) {
    const canonRegionNorm = norm(canonical.region);
    const canonAliases = regionCatalog.filter(
      (r) => norm(r) === canonRegionNorm
        || norm(r).includes(canonRegionNorm)
        || canonRegionNorm.includes(norm(r)),
    );
    for (const { source, text } of sources) {
      const mentionsCanonRegion = canonAliases.some((alias) => mentionsToken(text, alias));
      if (mentionsCanonRegion) continue;
      for (const candidate of regionCatalog) {
        if (canonAliases.some((alias) => norm(alias) === norm(candidate))) continue;
        if (mentionsToken(text, candidate)) {
          return {
            ok: false,
            reason: 'geo_narrative_mismatch',
            level: 'region',
            expected: canonical.region,
            got: candidate,
            source,
          };
        }
      }
    }
  }

  return { ok: true };
}
