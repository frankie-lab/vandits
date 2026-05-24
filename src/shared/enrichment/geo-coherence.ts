/**
 * Fase 6 — R6 del contrato `docs/contracts/enrichment-coord-coherence-contract.md`.
 *
 * `assertGeoCoherence(canonical, aiNarrative)` valida que la narrativa
 * generada por el LLM (descripcion / datos_clave / tags / lugar_interes) no
 * contradiga la geografía canónica resuelta por `resolve-coordinates` antes
 * de persistir un POI como `enriched`.
 *
 * Esta validación es **post-LLM** y complementaria al gate pre-LLM R9
 * (`assertNameCoordinateIdentity`). Si detecta incoherencia, el caller debe
 * marcar el POI como `enrichment_status='quarantine'` y NO escribir el
 * `enriched_data` final.
 *
 * Conservadora por diseño: word-boundary, diacritic-insensitive, catálogos
 * cerrados. Cualquier mención que no esté en el catálogo del país canónico
 * se ignora (NO falso positivo).
 *
 * Espejo Deno en `supabase/functions/_shared/geo-coherence.ts`. Mantener
 * ambos sincronizados.
 */

import { nameToIso2 } from '@/shared/geo/country-iso';

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

/** Normaliza para comparación: minúsculas + strip diacritics + colapsa espacios. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Catálogo de regiones por país (ISO α2). Solo se evalúa region mismatch
 * cuando el país canónico tiene catálogo aquí. Lista extensible.
 */
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

/** Detecta menciones país/región con word-boundary diacritic-insensitive. */
function mentionsToken(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  const h = ` ${norm(haystack)} `;
  const t = norm(token);
  if (!t) return false;
  // word-boundary manual: rodeado por espacios o puntuación.
  const re = new RegExp(
    `(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
    'i',
  );
  return re.test(h);
}

/** Extrae el conjunto de strings narrativos para análisis. */
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

/**
 * Lista cerrada de países a buscar: usamos los aliases de `country-iso.ts`
 * pero sólo los relevantes (>=4 letras o nombre canónico) para evitar
 * matches espurios (p.ej. "uk", "usa").
 */
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

  // 1) País: detectar cualquier mención cuyo ISO ≠ canonIso.
  if (canonIso) {
    for (const { source, text } of sources) {
      for (const probe of COUNTRY_PROBES) {
        if (probe.iso2 === canonIso) continue; // coherente, no es mismatch
        if (mentionsToken(text, probe.label)) {
          // Antes de bloquear: ¿el MISMO texto menciona también el país
          // canónico? Si sí, tolerancia (mención comparativa, no relocación).
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

  // 2) Región: solo si canonical.region existe y hay catálogo para el país.
  const regionCatalog = canonIso ? REGION_CATALOG[canonIso] : undefined;
  if (canonical.region && regionCatalog?.length) {
    const canonRegionNorm = norm(canonical.region);
    // Aliases del canónico (cualquier entrada del catálogo cuyo norm coincida o esté contenido)
    const canonAliases = regionCatalog.filter(
      (r) => norm(r) === canonRegionNorm
        || norm(r).includes(canonRegionNorm)
        || canonRegionNorm.includes(norm(r)),
    );
    for (const { source, text } of sources) {
      // Si menciona el canónico, no evaluamos mismatch de región en ese source.
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
