/**
 * PR-EXPORT-6 — GuruMaps target renderer.
 *
 * Produce plain-text descriptions optimizadas para la app móvil GuruMaps,
 * que renderiza inconsistente los tags HTML. Reglas:
 *   - Sin tags HTML (<p>, <br/>, <b>, <i>, <a>, <img>).
 *   - Bloques cortos separados por línea en blanco (`\n\n`).
 *   - Emoji literales como separador visual (📍 🏷 📝 🔗).
 *   - Truncation por frases con ellipsis "…".
 *   - URLs en línea propia → GuruMaps las auto-linkifica.
 *   - Imagen omitida (GuruMaps no la renderiza fiable; va en ExtendedData).
 *
 * Ver `docs/contracts/poi-export-content-model.md` § Rendering targets.
 */

import type { PoiExportContent } from '@/domains/content/lib/poi-export-content-model';

export interface BuildGuruMapsDescriptionOptions {
  /** ISO timestamp — inyectable para snapshots estables. */
  generatedAt?: string;
}

const MAX_HIGHLIGHT = 180;
const MAX_LONG_DESC = 280;
const MAX_OBSERVATION = 200;
const MAX_TAGS = 5;
const MAX_LINKS = 3;
const SOFT_TOTAL_CAP = 900;
const HARD_TOTAL_CAP = 1200;

function truncateAtSentence(text: string, max: number): string {
  if (!text) return '';
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  // Buscar último cierre de frase
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

function compactUrl(url: string, maxLen = 60): string {
  if (!url) return '';
  if (url.length <= maxLen) return url;
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return url.slice(0, maxLen) + '…';
  }
}

function labelForLink(url: string, isWebReference: boolean): string {
  if (isWebReference) return 'Web oficial';
  try {
    const host = new URL(url).host.toLowerCase();
    if (host.includes('wikipedia')) return 'Wikipedia';
    if (host.includes('wikidata')) return 'Wikidata';
    if (host.includes('unesco')) return 'UNESCO';
    if (host.includes('openstreetmap') || host === 'osm.org') return 'OpenStreetMap';
  } catch {
    /* noop */
  }
  return 'Más info';
}

function joinTerritorial(content: PoiExportContent): string | undefined {
  const g = content.geography;
  const parts = [g.locality, g.province, g.country].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

interface Block {
  key: 'territorial' | 'highlight' | 'longDesc' | 'classification' | 'observation' | 'links' | 'footer';
  text: string;
  /** Prioridad de retención (mayor = se conserva). */
  priority: number;
}

function buildBlocks(
  content: PoiExportContent,
  generatedAt: string,
): Block[] {
  const blocks: Block[] = [];
  const { summary, classification, provenance } = content;

  const territorial = joinTerritorial(content);
  if (territorial) {
    blocks.push({ key: 'territorial', text: `📍 ${territorial}`, priority: 90 });
  }

  if (summary.highlight) {
    blocks.push({
      key: 'highlight',
      text: truncateAtSentence(summary.highlight, MAX_HIGHLIGHT),
      priority: 100,
    });
  }

  // longDescription sólo si no eclipsa el highlight; en este renderer
  // siempre lo incluimos truncado, pero recortamos primero si hace falta.
  if (summary.longDescription) {
    const useMax = summary.highlight ? Math.min(MAX_LONG_DESC, 220) : MAX_LONG_DESC;
    const truncated = truncateAtSentence(summary.longDescription, useMax);
    if (truncated && truncated !== blocks.find((b) => b.key === 'highlight')?.text) {
      blocks.push({ key: 'longDesc', text: truncated, priority: 70 });
    }
  }

  const tags = (classification.tags ?? [])
    .filter((t) => {
      if (!classification.category) return true;
      return t.toLowerCase() !== classification.category.toLowerCase();
    })
    .slice(0, MAX_TAGS)
    .map((t) => `#${t}`);
  if (classification.category || tags.length > 0) {
    const left = classification.category ?? '';
    const right = tags.join(' ');
    const line = [left, right].filter(Boolean).join(' — ');
    blocks.push({ key: 'classification', text: `🏷 ${line}`, priority: 60 });
  }

  if (summary.observation) {
    blocks.push({
      key: 'observation',
      text: `📝 ${truncateAtSentence(summary.observation, MAX_OBSERVATION)}`,
      priority: 80,
    });
  }

  // Links
  const linkLines: string[] = [];
  const seenUrls = new Set<string>();
  if (provenance.webReference) {
    const url = provenance.webReference;
    seenUrls.add(url);
    linkLines.push(`${labelForLink(url, true)}: ${compactUrl(url)}\n${url}`);
  }
  for (const src of provenance.sources) {
    if (linkLines.length >= MAX_LINKS) break;
    if (!/^https?:\/\//i.test(src)) continue;
    if (seenUrls.has(src)) continue;
    seenUrls.add(src);
    linkLines.push(`${labelForLink(src, false)}: ${compactUrl(src)}\n${src}`);
  }
  if (linkLines.length > 0) {
    blocks.push({
      key: 'links',
      text: `🔗 Enlaces\n${linkLines.join('\n')}`,
      priority: 50,
    });
  }

  // Footer mínimo — sólo fecha YYYY-MM-DD
  const date = generatedAt.slice(0, 10);
  blocks.push({
    key: 'footer',
    text: `— Vandits · ${date}`,
    priority: 10,
  });

  return blocks;
}

function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => b.text).join('\n\n');
}

function enforceLengthCap(blocks: Block[]): Block[] {
  let out = blocks.slice();
  if (joinBlocks(out).length <= SOFT_TOTAL_CAP) return out;

  // Estrategia: recortar longDesc primero, luego eliminar classification,
  // luego eliminar longDesc completo. Nunca tocar highlight/territorial/footer.
  const longIdx = out.findIndex((b) => b.key === 'longDesc');
  if (longIdx >= 0) {
    const target = Math.max(120, MAX_LONG_DESC - 100);
    out[longIdx] = {
      ...out[longIdx],
      text: truncateAtSentence(out[longIdx].text, target),
    };
    if (joinBlocks(out).length <= HARD_TOTAL_CAP) return out;
  }

  if (joinBlocks(out).length > HARD_TOTAL_CAP) {
    out = out.filter((b) => b.key !== 'classification');
  }
  if (joinBlocks(out).length > HARD_TOTAL_CAP) {
    out = out.filter((b) => b.key !== 'longDesc');
  }
  if (joinBlocks(out).length > HARD_TOTAL_CAP) {
    // último recurso: truncar el body completo
    const joined = joinBlocks(out);
    return [
      {
        key: 'highlight',
        text: truncateAtSentence(joined, HARD_TOTAL_CAP - 40),
        priority: 100,
      },
      out[out.length - 1], // footer
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
  MAX_TAGS,
  MAX_LINKS,
  SOFT_TOTAL_CAP,
  HARD_TOTAL_CAP,
} as const;
