/**
 * PR-EXPORT-5 — Builder de description HTML para KML / GuruMaps.
 *
 * GuruMaps y Google My Maps aceptan un subset reducido de HTML en
 * `<description>`. Tags permitidos: <p>, <b>, <i>, <img>, <a>, <br/>.
 *
 * NO incluye:
 *   - JSON crudo
 *   - <script>, <style>, atributos `on*`
 *   - Campos internos / capa H (ownerUserId, debug, secretos)
 *
 * Orden canónico (ver `docs/contracts/poi-export-content-model.md`):
 *   imagen → highlight → longDescription → ubicación territorial →
 *   categoría + tags → observación → enlaces → footer Vandits + fecha.
 */

import type { PoiExportContent } from '@/domains/content/lib/poi-export-content-model';

export interface BuildKmlDescriptionHtmlOptions {
  /** Sub-target (p.ej. 'gurumaps', 'mymaps', 'general'). */
  target?: string;
  /** ISO timestamp — inyectable para snapshots estables. */
  generatedAt?: string;
}

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(text: unknown): string {
  return escapeHtml(text);
}

function joinTerritorial(content: PoiExportContent): string | undefined {
  const g = content.geography;
  const parts = [g.locality, g.province, g.region, g.country].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function buildKmlDescriptionHtml(
  content: PoiExportContent,
  options: BuildKmlDescriptionHtmlOptions = {},
): string {
  const parts: string[] = [];
  const { summary, media, classification, provenance } = content;

  if (media.imageUrl) {
    parts.push(
      `<p><img src="${escapeAttr(media.imageUrl)}" alt="${escapeAttr(content.identity.name)}"/></p>`,
    );
  }

  if (summary.highlight) {
    parts.push(`<p><i>${escapeHtml(summary.highlight)}</i></p>`);
  }

  if (summary.longDescription) {
    // Preservar saltos de párrafo si vienen en \n\n.
    const paragraphs = summary.longDescription.split(/\n{2,}/);
    for (const p of paragraphs) {
      const text = p.trim();
      if (!text) continue;
      parts.push(`<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`);
    }
  }

  const territorial = joinTerritorial(content);
  if (territorial) {
    parts.push(`<p><b>Ubicación:</b> ${escapeHtml(territorial)}</p>`);
  }

  const tags = classification.tags.slice(0, 20);
  if (classification.category || tags.length > 0) {
    const cat = classification.category
      ? `<b>${escapeHtml(classification.category)}</b>`
      : '';
    const tagStr = tags.length > 0 ? tags.map((t) => `#${escapeHtml(t)}`).join(' ') : '';
    const joined = [cat, tagStr].filter(Boolean).join(' — ');
    parts.push(`<p>${joined}</p>`);
  }

  if (summary.observation) {
    parts.push(`<p><b>Nota:</b> ${escapeHtml(summary.observation)}</p>`);
  }

  const links: string[] = [];
  if (provenance.webReference) {
    links.push(
      `<a href="${escapeAttr(provenance.webReference)}">${escapeHtml(provenance.webReference)}</a>`,
    );
  }
  for (const src of provenance.sources.slice(0, 8)) {
    if (/^https?:\/\//i.test(src)) {
      links.push(`<a href="${escapeAttr(src)}">${escapeHtml(src)}</a>`);
    }
  }
  if (links.length > 0) {
    parts.push(`<p><b>Fuentes:</b> ${links.join(' · ')}</p>`);
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  parts.push(
    `<p><i>Generado por Vandits · ${escapeHtml(generatedAt)}</i></p>`,
  );

  return parts.join('\n');
}
