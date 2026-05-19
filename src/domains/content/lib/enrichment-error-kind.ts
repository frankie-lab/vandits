/**
 * Helper único para clasificar y leer errores del job de enriquecimiento por lotes.
 *
 * `enrichment_jobs.error_messages` puede contener:
 *   - shape legacy: `Record<locationId, string>`
 *   - shape estructurado: `Record<locationId, ParsedEnrichmentError>` (escrito por
 *     batch-enrich tras la separación coherencia / error real)
 *
 * Toda UI que pinte el contador o la fila del error DEBE pasar por
 * `parseEnrichmentError`. Nunca leer el campo crudo.
 *
 * Ver mem://logic/enrichment/batch-error-resolution
 */

export type EnrichmentErrorKind =
  | 'coherence'         // nombre↔coordenadas no cuadran (ABORT controlado, hay candidatos)
  | 'llm_unverifiable'  // el LLM se rindió (placeholder evasivo en descripcion) — ABORT controlado
  | 'no_match'          // IA no encontró ficha (sin candidatos)
  | 'rate_limit'        // 429
  | 'no_credits'        // 402
  | 'timeout'           // 5xx / fetch lento
  | 'network'           // fetch lanzó (DNS, abort, parse)
  | 'unknown';

export interface CoherenceCandidate {
  name?: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  distanceM?: number;
  url?: string;
  matchScore?: number;
  country?: string;
  region?: string;
  locality?: string;
  extract?: string;
  /**
   * Identidad externa estructurada (Fase A — PR-SHARE-EXT-MAPS-3).
   * Hoy sólo lo expone Places API New vía `search-candidates`.
   * Cuando el usuario adopta el candidato, se persiste en
   * `locations.external_refs.maps.{provider}.placeId`.
   */
  placeId?: string;
  provider?: 'google';
}

export interface ParsedEnrichmentError {
  kind: EnrichmentErrorKind;
  message: string;
  /** Para `coherence`: `'name'` (homónimo) vs `'coordinate'` (misma identidad, coords mal). */
  mismatchKind?: 'name' | 'coordinate';
  candidates?: CoherenceCandidate[];
  nameLocation?: {
    lat?: number; lng?: number; distanceKm?: number; title?: string; url?: string;
    country?: string; region?: string; locality?: string;
  };
  providedName?: string;
  httpStatus?: number;
}

/** Conjuntos para clasificar en UI. */
export const COHERENCE_KINDS: ReadonlyArray<EnrichmentErrorKind> = ['coherence', 'llm_unverifiable', 'no_match'];
export const HARD_ERROR_KINDS: ReadonlyArray<EnrichmentErrorKind> = [
  'rate_limit',
  'no_credits',
  'timeout',
  'network',
  'unknown',
];

export function parseEnrichmentError(raw: unknown): ParsedEnrichmentError {
  if (raw && typeof raw === 'object' && 'kind' in (raw as Record<string, unknown>)) {
    const r = raw as Partial<ParsedEnrichmentError>;
    return {
      kind: (r.kind as EnrichmentErrorKind) ?? 'unknown',
      message: typeof r.message === 'string' ? r.message : 'Error desconocido',
      mismatchKind: r.mismatchKind,
      candidates: Array.isArray(r.candidates) ? r.candidates : undefined,
      nameLocation: r.nameLocation,
      providedName: r.providedName,
      httpStatus: r.httpStatus,
    };
  }
  // Legacy: string suelto
  const message = typeof raw === 'string' ? raw : 'Error desconocido';
  return { kind: inferLegacyKind(message), message };
}

function inferLegacyKind(message: string): EnrichmentErrorKind {
  const m = message.toLowerCase();
  if (m.includes('429')) return 'rate_limit';
  if (m.includes('402')) return 'no_credits';
  if (m.includes('500') || m.includes('502') || m.includes('503') || m.includes('504') || m.includes('timeout')) {
    return 'timeout';
  }
  if (m.includes('name_coordinate') || m.includes('coherence')) return 'coherence';
  if (m.includes('llm_unverifiable') || m.includes('no verificable') || m.includes('no se puede generar')) {
    return 'llm_unverifiable';
  }
  return 'unknown';
}

export function isCoherenceKind(kind: EnrichmentErrorKind): boolean {
  return kind === 'coherence' || kind === 'llm_unverifiable' || kind === 'no_match';
}

/** Etiqueta i18n-ready (de momento ES) para el badge del motivo. */
export function labelForKind(kind: EnrichmentErrorKind): string {
  switch (kind) {
    case 'coherence': return 'Nombre ↔ coords';
    case 'llm_unverifiable': return 'No verificable';
    case 'no_match': return 'Sin coincidencia';
    case 'rate_limit': return 'Rate limit';
    case 'no_credits': return 'Sin créditos';
    case 'timeout': return 'Timeout';
    case 'network': return 'Red';
    case 'unknown':
    default: return 'Error';
  }
}

/** Cuenta locations por categoría (errores duros vs rechazos blandos). */
export function countErrorBuckets(
  errorMessages: Record<string, unknown> | null | undefined,
): { hard: number; soft: number; total: number } {
  if (!errorMessages) return { hard: 0, soft: 0, total: 0 };
  let hard = 0;
  let soft = 0;
  for (const [key, value] of Object.entries(errorMessages)) {
    if (key === '_job_error') continue;
    const parsed = parseEnrichmentError(value);
    if (isCoherenceKind(parsed.kind)) soft++;
    else hard++;
  }
  return { hard, soft, total: hard + soft };
}

/**
 * Desglose por motivo concreto. Devuelve un mapa kind → count y la lista de
 * ids agrupados (útil para "ver los X puntos con coherence" en la UI).
 */
export function countErrorKinds(
  errorMessages: Record<string, unknown> | null | undefined,
): { byKind: Record<EnrichmentErrorKind, number>; idsByKind: Record<EnrichmentErrorKind, string[]>; total: number } {
  const byKind = {
    coherence: 0,
    llm_unverifiable: 0,
    no_match: 0,
    rate_limit: 0,
    no_credits: 0,
    timeout: 0,
    network: 0,
    unknown: 0,
  } as Record<EnrichmentErrorKind, number>;
  const idsByKind = {
    coherence: [],
    llm_unverifiable: [],
    no_match: [],
    rate_limit: [],
    no_credits: [],
    timeout: [],
    network: [],
    unknown: [],
  } as Record<EnrichmentErrorKind, string[]>;
  let total = 0;
  if (!errorMessages) return { byKind, idsByKind, total };
  for (const [key, value] of Object.entries(errorMessages)) {
    if (key === '_job_error') continue;
    const parsed = parseEnrichmentError(value);
    byKind[parsed.kind] = (byKind[parsed.kind] ?? 0) + 1;
    idsByKind[parsed.kind] = [...(idsByKind[parsed.kind] ?? []), key];
    total++;
  }
  return { byKind, idsByKind, total };
}
