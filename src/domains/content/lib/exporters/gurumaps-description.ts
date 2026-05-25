/**
 * PR-EXPORT-6 + PR-EXPORT-7 + PR-EXPORT-8 — GuruMaps target renderer.
 *
 * PR-EXPORT-8: ficha completa del popup, sin truncado artificial.
 *   - Eliminados límites MAX_HIGHLIGHT / MAX_LONG_DESC / MAX_OBSERVATION
 *     / SOFT_TOTAL_CAP / HARD_TOTAL_CAP.
 *   - Texto íntegro tal como aparece en el popup Vandits.
 *   - Mantiene reglas duras: sin HTML, sin enlaces, sin hashtags,
 *     sin campos técnicos, sin debug, sin ownerUserId.
 *
 * Orden canónico (PR-EXPORT-8):
 *   📍 Ubicación
 *   Frase destacada (highlight) completa
 *   Descripción larga completa
 *   📝 Nota / observación completa
 *   Categoría: <category>            (si existe)
 *   Colección: <nombre>              (si internal + collection)
 *   Añadido: <YYYY-MM-DD>            (si internal + createdAt)
 *   — Vandits · YYYY-MM-DD           (footer)
 *
 * Reglas de limpieza preservadas:
 *   - Sin tags HTML.
 *   - Bloques cortos separados por línea en blanco (`\n\n`).
 *   - Sanitización CDATA (`]]>` → split seguro).
 *   - Bloques vacíos se omiten.
 *
 * Ver `docs/contracts/poi-export-content-model.md` § Rendering targets.
 */

import type { PoiExportContent } from '@/domains/content/lib/poi-export-content-model';

export interface BuildGuruMapsDescriptionOptions {
  /** ISO timestamp — inyectable para snapshots estables. */
  generatedAt?: string;
}

function nonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function joinTerritorial(content: PoiExportContent): string | undefined {
  const g = content.geography;
  const parts = [g.locality, g.province, g.country].filter(nonEmpty);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

interface Block {
  key:
    | 'territorial'
    | 'highlight'
    | 'longDesc'
    | 'observation'
    | 'category'
    | 'collection'
    | 'addedAt'
    | 'footer';
  text: string;
}

function isoToDate(iso: string): string {
  // Acepta ISO-8601; devuelve YYYY-MM-DD. Si falla, devuelve el original.
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : iso;
}

function buildBlocks(
  content: PoiExportContent,
  generatedAt: string,
): Block[] {
  const blocks: Block[] = [];
  const { summary, classification, userContext } = content;

  const territorial = joinTerritorial(content);
  if (territorial) {
    blocks.push({ key: 'territorial', text: `📍 ${territorial}` });
  }

  if (nonEmpty(summary.highlight)) {
    blocks.push({ key: 'highlight', text: summary.highlight.trim() });
  }

  if (nonEmpty(summary.longDescription)) {
    const text = summary.longDescription.trim();
    const highlightText = blocks.find((b) => b.key === 'highlight')?.text;
    if (text && text !== highlightText) {
      blocks.push({ key: 'longDesc', text });
    }
  }

  if (nonEmpty(summary.observation)) {
    blocks.push({
      key: 'observation',
      text: `📝 ${summary.observation.trim()}`,
    });
  }

  if (nonEmpty(classification.category)) {
    blocks.push({
      key: 'category',
      text: `Categoría: ${classification.category.trim()}`,
    });
  }

  // userContext sólo existe en scope=internal. PR-EXPORT-7+8: contexto privado.
  if (userContext) {
    if (nonEmpty(userContext.collection)) {
      blocks.push({
        key: 'collection',
        text: `Colección: ${userContext.collection.trim()}`,
      });
    }
    if (nonEmpty(userContext.createdAt)) {
      blocks.push({
        key: 'addedAt',
        text: `Añadido: ${isoToDate(userContext.createdAt)}`,
      });
    }
  }

  const date = generatedAt.slice(0, 10);
  blocks.push({ key: 'footer', text: `— Vandits · ${date}` });

  return blocks;
}

function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => b.text).join('\n\n');
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
  const blocks = buildBlocks(content, generatedAt);
  return sanitizeForCdata(joinBlocks(blocks));
}

/**
 * PR-EXPORT-8: límites históricos eliminados. Se mantiene el export para
 * compatibilidad de imports antiguos (vacío). NO añadir nuevos límites.
 */
export const GURUMAPS_RENDERER_LIMITS = {} as const;
