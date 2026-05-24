// AI enrichment payload sanitizer — Fase 4 (R4 + R5) del contrato
// `docs/contracts/enrichment-coord-coherence-contract.md`.
//
// La IA NO puede emitir ni sobrescribir geografía estructurada. Cualquier
// campo prohibido bajo `datos_geograficos` se descarta antes de la lógica de
// merge. Cualquier placeholder evasivo del tipo "(sin región)" se elimina
// recursivamente del payload editorial.
//
// Permitido en `datos_geograficos`:
//   - lugar_interes
//   - direccion_postal
//   - calle (la rellena el backend desde Nominatim; si la IA la emite, se ignora)
//   - fuente_geocoding, fuente_refinamiento (metadatos backend)
//
// Cualquier otro campo no listado en PROHIBITED_AI_GEO_FIELDS se conserva
// como pass-through (compat futura).
//
// Espejo isomórfico en `src/shared/enrichment/ai-payload-sanitizer.ts`.

export const PROHIBITED_AI_GEO_FIELDS = [
  'coordenadas',
  'pais',
  'admin_nivel_1',
  'admin_nivel_2',
  'admin_nivel_3',
  'continente',
  'localidad',
  'sublocalidad',
] as const;

export type ProhibitedAiGeoField = typeof PROHIBITED_AI_GEO_FIELDS[number];

// Matches "(sin región)", "( SIN provincia )", "(sin comarca)", "(sin localidad)" etc.
// Tolera espacios y mayúsculas. NO casa frases con contenido extra
// ("descripción (sin región)" se conserva — sólo el valor exacto es placeholder).
export const PROHIBITED_PLACEHOLDER_RE =
  /^\s*\(\s*sin\s+[^)]+\)\s*$/i;

export interface SanitizeReport {
  removedGeoFields: string[];
  removedPlaceholders: Array<{ path: string; value: string }>;
}

interface MutableReport {
  removedGeoFields: string[];
  removedPlaceholders: Array<{ path: string; value: string }>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function stripPlaceholdersDeep(
  value: unknown,
  path: string,
  report: MutableReport,
): unknown {
  if (typeof value === 'string') {
    return value; // string leaf — caller decides whether to drop
  }
  if (Array.isArray(value)) {
    const cleaned: unknown[] = [];
    value.forEach((item, idx) => {
      const itemPath = `${path}[${idx}]`;
      if (typeof item === 'string' && PROHIBITED_PLACEHOLDER_RE.test(item)) {
        report.removedPlaceholders.push({ path: itemPath, value: item });
        return;
      }
      cleaned.push(stripPlaceholdersDeep(item, itemPath, report));
    });
    return cleaned;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const childPath = path ? `${path}.${k}` : k;
      if (typeof v === 'string' && PROHIBITED_PLACEHOLDER_RE.test(v)) {
        report.removedPlaceholders.push({ path: childPath, value: v });
        continue;
      }
      out[k] = stripPlaceholdersDeep(v, childPath, report);
    }
    return out;
  }
  return value;
}

/**
 * Sanitize an AI enrichment payload (already JSON-parsed).
 *
 * - Strips prohibited geographic fields from `datos_geograficos`.
 * - Strips placeholder strings like "(sin región)" recursively from the rest
 *   of the payload.
 * - Never mutates the input.
 * - Returns input unchanged + empty report if not a plain object.
 */
export function sanitizeAiEnrichmentPayload(
  payload: unknown,
): { sanitized: unknown; report: SanitizeReport } {
  const report: MutableReport = {
    removedGeoFields: [],
    removedPlaceholders: [],
  };

  if (!isPlainObject(payload)) {
    return { sanitized: payload, report };
  }

  // 1) Recursive placeholder strip (whole payload).
  const stripped = stripPlaceholdersDeep(payload, '', report) as Record<string, unknown>;

  // 2) Drop prohibited geo fields under `datos_geograficos`.
  if (isPlainObject(stripped.datos_geograficos)) {
    const dg = { ...stripped.datos_geograficos };
    for (const field of PROHIBITED_AI_GEO_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(dg, field)) {
        report.removedGeoFields.push(field);
        delete dg[field];
      }
    }
    stripped.datos_geograficos = dg;
  }

  return { sanitized: stripped, report };
}
