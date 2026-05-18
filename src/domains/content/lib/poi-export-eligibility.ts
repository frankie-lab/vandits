/**
 * poi-export-eligibility — Contrato canónico de exportación de POIs (PR-EXPORT-1).
 *
 * SoT única para decidir si un POI puede salir del sistema en un archivo
 * (KML/CSV/JSON) y bajo qué scope. Compone helpers ya canónicos:
 *   - `isPointEnriched`        (criterio enriched canónico)
 *   - `isShareablePoi`         (curated-only sharing boundary PR-1)
 *   - `getPoiCurationLevel`    (niveles POI-0/1/3/5/9/10)
 *   - `getLocationOwnerUserId` (owner resolver único)
 *
 * NO duplica criterios. NO introduce nuevas reglas de salud/origen.
 *
 * Dos scopes:
 *
 *   - `public`   = exportación compartible. Sólo POI-9 y POI-10 que pasen
 *                  `isPointEnriched` ∧ `isShareablePoi`. POI-1b-editorial
 *                  (snippet/imagen sin descripcion IA) queda explícitamente
 *                  excluido aunque tenga apariencia editorial.
 *
 *   - `internal` = exportación diagnóstico/dump del DUEÑO. Cualquier nivel
 *                  POI-0/1/3/5/9/10, pero el POI debe ser del usuario actual
 *                  (`ownerUserId === currentUserId`). NO es vía para extraer
 *                  POIs ajenos no compartibles.
 *
 * Renderer/marker invariance: este contrato sólo decide qué entra al
 * exporter; no toca popup, marker grammar, visibilidad ni clustering.
 *
 * Ver `docs/contracts/poi-export-contract.md` y
 * `mem://logic/export/poi-export-contract`.
 */

import type { GeoLocation } from '@/types/location';
import { isPointEnriched } from '@/domains/content/lib/point-visual-state';
import { isShareablePoi } from '@/domains/content/lib/is-shareable-poi';
import { getPoiCurationLevel } from '@/domains/content/lib/poi-curation-level';
import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';

export type ExportScope = 'public' | 'internal';

export type ExportExclusionReason =
  | 'invalid-coordinates'
  | 'not-owner'
  | 'not-enriched'
  | 'editorial-only-1b'
  | 'not-shareable'
  | 'curation-level-below-9';

export interface ExportContext {
  /** Requerido para scope='internal'. Si null, todos los POIs caen como not-owner. */
  currentUserId: string | null;
}

export interface ExportEligibility {
  eligible: boolean;
  scope: ExportScope;
  level: number;
  reason?: ExportExclusionReason;
}

export interface ExportPartition {
  eligible: GeoLocation[];
  excluded: Array<{ loc: GeoLocation; reason: ExportExclusionReason }>;
}

function hasValidCoords(loc: GeoLocation | null | undefined): boolean {
  const c = loc?.coordinates;
  if (!c) return false;
  return Number.isFinite(c.lat) && Number.isFinite(c.lng);
}

/**
 * Detector de "POI-1b editorial": nivel 1 cuya geografía es 'ok' y que
 * tiene apariencia editorial (snippet, imagen o cuerpo) pero NO pasa el
 * criterio canónico de enriched (`enriched_data.descripcion`). Se rechaza
 * explícitamente del scope público aunque exista la tentación visual de
 * tratarlo como curado.
 */
function isEditorialOnly1b(loc: GeoLocation): boolean {
  if (isPointEnriched(loc)) return false; // ya tiene descripción canónica
  const ed = loc.enrichedData;
  const hasImage = Boolean(ed?.imagen);
  const hasSnippet = Boolean(
    ed?.punto_destacado || ed?.localizacion || ed?.nombre_lugar,
  );
  return hasImage || hasSnippet;
}

/**
 * Evalúa elegibilidad de un POI bajo un scope.
 *
 * Orden de razones (dominante primero): invalid-coordinates → not-owner
 * (sólo internal) → not-enriched/editorial-only-1b → not-shareable →
 * curation-level-below-9.
 */
export function evaluatePoiExport(
  loc: GeoLocation,
  scope: ExportScope,
  ctx: ExportContext,
): ExportEligibility {
  const verdict = getPoiCurationLevel(loc);
  const level = verdict.level;

  if (!hasValidCoords(loc)) {
    return { eligible: false, scope, level, reason: 'invalid-coordinates' };
  }

  if (scope === 'internal') {
    const owner = getLocationOwnerUserId(loc);
    if (!ctx.currentUserId || owner !== ctx.currentUserId) {
      return { eligible: false, scope, level, reason: 'not-owner' };
    }
    return { eligible: true, scope, level };
  }

  // scope === 'public'
  if (isEditorialOnly1b(loc)) {
    return { eligible: false, scope, level, reason: 'editorial-only-1b' };
  }
  if (!isPointEnriched(loc)) {
    return { eligible: false, scope, level, reason: 'not-enriched' };
  }
  if (!isShareablePoi(loc)) {
    return { eligible: false, scope, level, reason: 'not-shareable' };
  }
  if (level !== 9 && level !== 10) {
    return { eligible: false, scope, level, reason: 'curation-level-below-9' };
  }
  return { eligible: true, scope, level };
}

export function publicExportEligible(loc: GeoLocation): boolean {
  return evaluatePoiExport(loc, 'public', { currentUserId: null }).eligible;
}

export function internalExportEligible(loc: GeoLocation, ctx: ExportContext): boolean {
  return evaluatePoiExport(loc, 'internal', ctx).eligible;
}

export function partitionForExport(
  locs: GeoLocation[],
  scope: ExportScope,
  ctx: ExportContext,
): ExportPartition {
  const eligible: GeoLocation[] = [];
  const excluded: ExportPartition['excluded'] = [];
  for (const loc of locs) {
    const r = evaluatePoiExport(loc, scope, ctx);
    if (r.eligible) eligible.push(loc);
    else if (r.reason) excluded.push({ loc, reason: r.reason });
  }
  return { eligible, excluded };
}

/** Etiquetas es-ES para mostrar razones en UI. */
export const EXPORT_EXCLUSION_LABEL: Record<ExportExclusionReason, string> = {
  'invalid-coordinates': 'Coordenadas inválidas',
  'not-owner': 'POI de otro usuario — no exportable en modo interno',
  'not-enriched': 'Sin enriquecimiento canónico (descripción IA)',
  'editorial-only-1b': 'Editorial sin descripción canónica (POI-1b)',
  'not-shareable': 'No compartible (geo o visibilidad no aptas)',
  'curation-level-below-9': 'Nivel de curación insuficiente (requiere POI-9 o POI-10)',
};
