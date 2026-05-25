/**
 * PR-EXPORT-6 + PR-EXPORT-7 — GuruMaps target renderer.
 *
 * Produce plain-text descriptions optimizadas para la app móvil GuruMaps,
 * que renderiza inconsistente los tags HTML. Reglas:
 *   - Sin tags HTML (<p>, <br/>, <b>, <i>, <a>, <img>).
 *   - Bloques cortos separados por línea en blanco (`\n\n`).
 *   - Emoji literales como separador visual (📍 📝 📚).
 *   - Truncation por frases con ellipsis "…".
 *   - PR-EXPORT-7: NO bloque de enlaces (🔗) ni hashtags generales (#tag).
 *     Si existe `userContext.collection`, se renderiza como `Colección: <nombre>`
 *     (única etiqueta contextual permitida en el cuerpo visible).
 *   - Imagen omitida (GuruMaps no la renderiza fiable; va en ExtendedData).
 *   - Links/tags se mantienen en ExtendedData del Placemark, no en cuerpo.
 *
 * Orden canónico (PR-EXPORT-7):
 *   📍 Ubicación → highlight → descripción larga →
 *   📝 nota/observación → Colección: <X> → footer Vandits.
 *
 * Ver `docs/contracts/poi-export-content-model.md` § Rendering targets.
 */

import type { PoiExportContent } from '@/domains/content/lib/poi-export-content-model';

export interface BuildGuruMapsDescriptionOptions {
  /** ISO timestamp — inyectable para snapshots estables. */
  generatedAt?: string;
}

// PR-EXPORT-7: límites más holgados para ficha más rica.
const MAX_HIGHLIGHT = 240;
const MAX_LONG_DESC = 700;
const MAX_OBSERVATION = 240;
const SOFT_TOTAL_CAP = 1100;
const HARD_TOTAL_CAP = 1200;

function truncateAtSentence(text: string, max: number): string {
  if (!text) return '';
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const sentenceEnd = Math.max(
    slice.lastIndexOf('.'),
    slice.lastIndexOf('!'),
    slice.lastIndexOf('?'),
  );
  if (sentenceEnd >= Math.floor(max * 0.5)) {
    return slice.slice(0, sentenceEnd + 1).trim() + ' …';
  }
  const space = slice.lastIndexOf(' ');
  if (space >= Math.floor(max * 0.5)) {
    return slice.slice(0, space).trim() + '…';
  }
  return slice.trim() + '…';
}

function joinTerritorial(content: PoiExportContent): string | undefined {
  const g = content.geography;
  const parts = [g.locality, g.province, g.country].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

interface Block {
  key:
    | 'territorial'
    | 'highlight'
    | 'longDesc'
    | 'observation'
    | 'collection'
    | 'footer';
  text: string;
}

function buildBlocks(
  content: PoiExportContent,
  generatedAt: string,
): Block[] {
  const blocks: Block[] = [];
  const { summary, userContext } = content;

  const territorial = joinTerritorial(content);
  if (territorial) {
    blocks.push({ key: 'territorial', text: `📍 ${territorial}` });
  }

  if (summary.highlight) {
    blocks.push({
      key: 'highlight',
      text: truncateAtSentence(summary.highlight, MAX_HIGHLIGHT),
    });
  }

  if (summary.longDescription) {
    const truncated = truncateAtSentence(summary.longDescription, MAX_LONG_DESC);
    const highlightText = blocks.find((b) => b.key === 'highlight')?.text;
    if (truncated && truncated !== highlightText) {
      blocks.push({ key: 'longDesc', text: truncated });
    }
  }

  if (summary.observation) {
    blocks.push({
      key: 'observation',
      text: `📝 ${truncateAtSentence(summary.observation, MAX_OBSERVATION)}`,
    });
  }

  // PR-EXPORT-7: única etiqueta contextual permitida — nombre de colección.
  // Sólo presente en scope=internal (userContext es internal-only).
  if (userContext?.collection) {
    blocks.push({
      key: 'collection',
      text: `Colección: ${userContext.collection.trim()}`,
    });
  }

  const date = generatedAt.slice(0, 10);
  blocks.push({ key: 'footer', text: `— Vandits · ${date}` });

  return blocks;
}

function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => b.text).join('\n\n');
}

function enforceLengthCap(blocks: Block[]): Block[] {
  let out = blocks.slice();
  if (joinBlocks(out).length <= SOFT_TOTAL_CAP) return out;

  // Recortar longDesc progresivamente. Nunca tocar territorial/highlight/footer.
  const longIdx = out.findIndex((b) => b.key === 'longDesc');
  if (longIdx >= 0) {
    const target = Math.max(280, MAX_LONG_DESC - 200);
    out[longIdx] = {
      ...out[longIdx],
      text: truncateAtSentence(out[longIdx].text, target),
    };
    if (joinBlocks(out).length <= HARD_TOTAL_CAP) return out;
  }

  if (joinBlocks(out).length > HARD_TOTAL_CAP) {
    out = out.filter((b) => b.key !== 'observation');
  }
  if (joinBlocks(out).length > HARD_TOTAL_CAP) {
    out = out.filter((b) => b.key !== 'longDesc');
  }
  if (joinBlocks(out).length > HARD_TOTAL_CAP) {
    const joined = joinBlocks(out);
    return [
      { key: 'highlight', text: truncateAtSentence(joined, HARD_TOTAL_CAP - 40) },
      out[out.length - 1],
    ];
  }
  return out;
}

/** Sanitiza secuencia `]]>` que rompería CDATA. */
function sanitizeForCdata(s: string): string {
  return s.replace(/]]>/g, ']]]]><![CDATA[>');
}

export function buildGuruMapsDescription(
  content: PoiExportContent,
  options: BuildGuruMapsDescriptionOptions = {},
): string {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const blocks = enforceLengthCap(buildBlocks(content, generatedAt));
  return sanitizeForCdata(joinBlocks(blocks));
}

export const GURUMAPS_RENDERER_LIMITS = {
  MAX_HIGHLIGHT,
  MAX_LONG_DESC,
  MAX_OBSERVATION,
  SOFT_TOTAL_CAP,
  HARD_TOTAL_CAP,
} as const;
