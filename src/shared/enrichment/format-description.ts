/**
 * Centralized helper to split long descriptions into readable paragraphs.
 *
 * Rules:
 * 1. If the text already contains explicit paragraph breaks (`\n\n` or `\r\n\r\n`),
 *    those are respected as-is.
 * 2. Otherwise, the text is split into sentences and grouped in chunks of
 *    ~3 sentences per paragraph (configurable).
 * 3. Very short texts (< 280 chars or single sentence) are returned as a
 *    single paragraph — no fragmentation.
 *
 * Used everywhere a `descripcion` is rendered (map popup, gallery, admin
 * card, document focus view) so behavior is identical across the app.
 * See `mem://logic/content/format-description-paragraphs`.
 */

const SENTENCE_REGEX = /[^.!?]+[.!?]+(?:["'»)]+)?\s*/g;
const MIN_CHARS_TO_SPLIT = 280;

export interface FormatDescriptionOptions {
  /** Sentences grouped per paragraph when auto-splitting. Default 3. */
  sentencesPerParagraph?: number;
}

/**
 * Returns the description split into an array of paragraph strings.
 * Always returns at least one entry (empty array only if input is empty).
 */
export function splitDescriptionParagraphs(
  text: string | null | undefined,
  opts: FormatDescriptionOptions = {},
): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Respect existing paragraph breaks
  if (/\r?\n\s*\r?\n/.test(trimmed)) {
    return trimmed
      .split(/\r?\n\s*\r?\n/)
      .map(p => p.trim())
      .filter(Boolean);
  }

  // 2. Short text → single paragraph
  if (trimmed.length < MIN_CHARS_TO_SPLIT) return [trimmed];

  // 3. Group sentences
  const sentences = trimmed.match(SENTENCE_REGEX);
  if (!sentences || sentences.length <= 2) return [trimmed];

  const perParagraph = Math.max(2, opts.sentencesPerParagraph ?? 3);
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += perParagraph) {
    const chunk = sentences.slice(i, i + perParagraph).join('').trim();
    if (chunk) paragraphs.push(chunk);
  }
  return paragraphs.length ? paragraphs : [trimmed];
}

/**
 * Convenience: returns HTML-ready string of `<p>` blocks.
 * The caller decides the inline styles via the optional `pStyle` argument.
 */
export function descriptionToHtmlParagraphs(
  text: string | null | undefined,
  pStyle = '',
  opts: FormatDescriptionOptions = {},
): string {
  const parts = splitDescriptionParagraphs(text, opts);
  if (!parts.length) return '';
  const styleAttr = pStyle ? ` style="${pStyle}"` : '';
  return parts
    .map(p => `<p${styleAttr}>${escapeHtml(p)}</p>`)
    .join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
