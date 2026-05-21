// image-quality.ts (shared, edge)
//
// Clasificador determinista de candidatos de imagen para POI-N. Sin descargas
// (sólo inspecciona URL + título + source field). Aplica el guardrail definido
// en `docs/audits/poi7-image-quality-gate-plan.md`:
//
//   accepted     → image_kind='representative'
//   rejected     → image_kind='symbolic' (bandera/escudo/logo/seal/coat-of-arms)
//   pending_review → image_kind='unknown' (dudoso, no se promociona a POI-8)
//
// Reglas:
//   1. Filename con tokens heráldicos / institucionales → rejected
//   2. Extensión `.svg` (vectorial puro, típico de banderas/escudos) → rejected
//   3. Source field del infobox heráldico (`bandera`, `escudo`, `flag`,
//      `image_flag`, `image_shield`, `image_seal`, `coat_of_arms`) → rejected
//   4. Title con tokens heráldicos → rejected
//   5. Resto → accepted (representative)
//
// Las reglas son monotónicas: rejected > pending_review > accepted.
// Mantener en paralelo con `src/domains/content/lib/image-quality.ts`.

export type ImageKind = 'representative' | 'symbolic' | 'unknown';
export type ImageStatus = 'accepted' | 'rejected' | 'pending_review';

export interface ImageClassificationInput {
  url: string | null | undefined;
  title?: string | null;
  sourceField?: string | null; // infobox field (e.g. 'bandera','escudo','imagen')
}

export interface ImageClassification {
  kind: ImageKind;
  status: ImageStatus;
  reason: string | null;
}

// Tokens heráldicos / institucionales en filename o title.
// Captura: bandera, escudo, flag, coat_of_arms, wappen, blason, blazon,
// coa, seal, emblem, shield, crest, logo, herb, gerb, gonfalone.
const HERALDIC_TOKEN_RX =
  /(^|[\/_\- %()])(bandera|escudo|flag|coat[_\- ]?of[_\- ]?arms|wappen|blason|blazon|coa|seal|emblem|shield|crest|logo|herb|gerb|gonfalone)([_\- .()]|$)/i;

// Filename `.svg` (incluye Wikimedia `thumb/.../X.svg/1280px-X.svg.png` —
// el `X.svg` original sigue presente en la ruta).
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

  // 1 + 2: filename signals (regex on URL pathname).
  if (HERALDIC_TOKEN_RX.test(lowerUrl)) {
    return {
      kind: 'symbolic',
      status: 'rejected',
      reason: 'heraldic_token_in_filename',
    };
  }
  if (SVG_FILENAME_RX.test(lowerUrl)) {
    return {
      kind: 'symbolic',
      status: 'rejected',
      reason: 'svg_filename',
    };
  }

  // 3: explicit infobox source field is heraldic.
  if (sourceField && HERALDIC_FIELD_RX.test(sourceField)) {
    return {
      kind: 'symbolic',
      status: 'rejected',
      reason: `heraldic_source_field:${sourceField.toLowerCase()}`,
    };
  }

  // 4: title signals.
  if (title && HERALDIC_TOKEN_RX.test(title)) {
    return {
      kind: 'symbolic',
      status: 'rejected',
      reason: 'heraldic_token_in_title',
    };
  }

  return { kind: 'representative', status: 'accepted', reason: null };
}
