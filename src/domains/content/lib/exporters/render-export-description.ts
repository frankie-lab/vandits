/**
 * PR-EXPORT-6 — Renderer dispatcher target-aware.
 *
 * Separa `content model` (PR-EXPORT-5, intacto) de `rendering target`.
 * El serializer KML delega aquí en lugar de asumir un único renderer.
 *
 * Targets:
 *   - `gurumaps`: plain-text, móvil-first, sin tags HTML.
 *   - `generic` : HTML mínimo con whitelist (PR-EXPORT-5 builder).
 *   - futuro    : google-earth, organic-maps…
 */

import type { PoiExportContent } from '@/domains/content/lib/poi-export-content-model';
import type { PoiExportScope } from '@/domains/content/lib/poi-export-record';
import { buildKmlDescriptionHtml } from './kml-description-html';
import { buildGuruMapsDescription } from './gurumaps-description';

export type ExportRenderTarget = 'generic' | 'gurumaps';
export type ExportRenderFormat = 'kml';

export interface RenderExportDescriptionOptions {
  format: ExportRenderFormat;
  target: ExportRenderTarget;
  scope: PoiExportScope;
  generatedAt?: string;
}

export interface RenderedExportDescription {
  body: string;
  /** Si true, el caller envuelve en `<![CDATA[…]]>`. */
  wrapInCdata: boolean;
  /** Etiqueta del renderer real ejecutado — útil para diagnóstico. */
  rendererId: 'gurumaps-plain' | 'generic-html';
}

export function renderExportDescription(
  content: PoiExportContent,
  options: RenderExportDescriptionOptions,
): RenderedExportDescription {
  if (options.format !== 'kml') {
    throw new Error(
      `renderExportDescription: format='${options.format}' no soportado (sólo 'kml').`,
    );
  }
  if (options.target === 'gurumaps') {
    return {
      body: buildGuruMapsDescription(content, { generatedAt: options.generatedAt }),
      wrapInCdata: true,
      rendererId: 'gurumaps-plain',
    };
  }
  // generic (HTML whitelisted)
  return {
    body: buildKmlDescriptionHtml(content, {
      target: options.target,
      generatedAt: options.generatedAt,
    }),
    wrapInCdata: true,
    rendererId: 'generic-html',
  };
}
