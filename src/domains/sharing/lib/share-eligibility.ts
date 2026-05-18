/**
 * share-eligibility — Elegibilidad para SHARING humano/social (PR-SHARE-1).
 *
 * NO confundir con `poi-export-eligibility` (export técnico a archivo).
 * Ambos helpers son INDEPENDIENTES y NUNCA se invocan mutuamente. Coinciden
 * hoy en el criterio POI-9/10 + shareable, pero pueden divergir en el
 * futuro (p.ej. share podría aceptar más estados editoriales que export).
 *
 * Regla v1: un POI es shareable si es POI-9 o POI-10, pasa `isPointEnriched`
 * y `isShareablePoi`. POI-1b-editorial queda explícitamente excluido.
 *
 * Sharing NO exige ownership: la URL pública es por definición ajena al
 * viewer.
 */

import type { GeoLocation } from '@/types/location';
import { isPointEnriched } from '@/domains/content/lib/point-visual-state';
import { isShareablePoi } from '@/domains/content/lib/is-shareable-poi';
import { getPoiCurationLevel } from '@/domains/content/lib/poi-curation-level';

export type ShareExclusionReason =
  | 'invalid-coordinates'
  | 'not-enriched'
  | 'editorial-only-1b'
  | 'not-shareable'
  | 'curation-level-below-9';

export interface ShareEligibility {
  eligible: boolean;
  level: number;
  reason?: ShareExclusionReason;
}

export interface SharePartition {
  eligible: GeoLocation[];
  excluded: Array<{ loc: GeoLocation; reason: ShareExclusionReason }>;
}

function hasValidCoords(loc: GeoLocation | null | undefined): boolean {
  const c = loc?.coordinates;
  return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng);
}

function isEditorialOnly1b(loc: GeoLocation): boolean {
  if (isPointEnriched(loc)) return false;
  const ed = loc.enrichedData;
  const hasImage = Boolean(ed?.imagen);
  const hasSnippet = Boolean(
    ed?.punto_destacado || ed?.localizacion || ed?.nombre_lugar,
  );
  return hasImage || hasSnippet;
}

export function evaluatePoiShare(loc: GeoLocation): ShareEligibility {
  const level = getPoiCurationLevel(loc).level;

  if (!hasValidCoords(loc)) {
    return { eligible: false, level, reason: 'invalid-coordinates' };
  }
  if (isEditorialOnly1b(loc)) {
    return { eligible: false, level, reason: 'editorial-only-1b' };
  }
  if (!isPointEnriched(loc)) {
    return { eligible: false, level, reason: 'not-enriched' };
  }
  if (!isShareablePoi(loc)) {
    return { eligible: false, level, reason: 'not-shareable' };
  }
  if (level !== 9 && level !== 10) {
    return { eligible: false, level, reason: 'curation-level-below-9' };
  }
  return { eligible: true, level };
}

export function isPoiShareable(loc: GeoLocation): boolean {
  return evaluatePoiShare(loc).eligible;
}

export function partitionForShare(locs: GeoLocation[]): SharePartition {
  const eligible: GeoLocation[] = [];
  const excluded: SharePartition['excluded'] = [];
  for (const loc of locs) {
    const r = evaluatePoiShare(loc);
    if (r.eligible) eligible.push(loc);
    else if (r.reason) excluded.push({ loc, reason: r.reason });
  }
  return { eligible, excluded };
}

export const SHARE_EXCLUSION_LABEL: Record<ShareExclusionReason, string> = {
  'invalid-coordinates': 'Coordenadas inválidas',
  'not-enriched': 'Sin descripción canónica',
  'editorial-only-1b': 'Editorial sin descripción canónica',
  'not-shareable': 'No compartible (geo o visibilidad no aptas)',
  'curation-level-below-9': 'Curación insuficiente (requiere POI-9 o POI-10)',
};
