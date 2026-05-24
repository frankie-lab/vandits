/**
 * image-quality.ts — Clasificador determinista de imagen para POI-N.
 *
 * Mirror cliente del módulo en `supabase/functions/_shared/image-quality.ts`.
 * Mantener ambos sincronizados (regex y semántica idénticas).
 *
 * Reglas: ver el shared edge file.
 */

export type ImageKind = 'representative' | 'symbolic' | 'unknown';
export type ImageStatus = 'accepted' | 'rejected' | 'pending_review';

export interface ImageClassificationInput {
  url: string | null | undefined;
  title?: string | null;
  sourceField?: string | null;
}

export interface ImageClassification {
  kind: ImageKind;
  status: ImageStatus;
  reason: string | null;
}

const HERALDIC_TOKEN_RX =
  /(^|[\/_\- %()])(bandera|escudo|flag|coat[_\- ]?of[_\- ]?arms|wappen|blason|blazon|coa|seal|emblem|shield|crest|logo|herb|gerb|gonfalone)([_\- .()]|$)/i;

const SVG_FILENAME_RX = /\/[A-Za-z0-9_%()\-\.]+\.svg(\/|\?|$)/i;

const HERALDIC_FIELD_RX =
  /^(bandera|escudo|flag|image_flag|image_shield|image_seal|coat_of_arms|seal|emblem|logo|crest|wappen)$/i;

export function classifyImageCandidate(
  input: ImageClassificationInput,
): ImageClassification {
  const url = (input.url ?? '').trim();
  if (!url) {
    return { kind: 'unknown', status: 'pending_review', reason: 'empty_url' };
  }
  const lowerUrl = url.toLowerCase();
  const title = (input.title ?? '').trim();
  const sourceField = (input.sourceField ?? '').trim();

  if (HERALDIC_TOKEN_RX.test(lowerUrl)) {
    return { kind: 'symbolic', status: 'rejected', reason: 'heraldic_token_in_filename' };
  }
  if (SVG_FILENAME_RX.test(lowerUrl)) {
    return { kind: 'symbolic', status: 'rejected', reason: 'svg_filename' };
  }
  if (sourceField && HERALDIC_FIELD_RX.test(sourceField)) {
    return {
      kind: 'symbolic',
      status: 'rejected',
      reason: `heraldic_source_field:${sourceField.toLowerCase()}`,
    };
  }
  if (title && HERALDIC_TOKEN_RX.test(title)) {
    return { kind: 'symbolic', status: 'rejected', reason: 'heraldic_token_in_title' };
  }
  return { kind: 'representative', status: 'accepted', reason: null };
}
