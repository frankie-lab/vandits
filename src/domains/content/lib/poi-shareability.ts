/**
 * POI Shareability Resolver — capa 2 del pipeline canónico de POIs.
 *
 *   raw POI
 *     -> resolvePoiSource          (qué es)
 *     -> resolveShareability       (puede verlo este viewer)   <-- ESTE ARCHIVO
 *     -> apply filterBySource
 *     -> resolveLayerVisibility
 *     -> resolveMarkerGrammar
 *     -> render
 *
 * Esta capa decide UNA cosa: si este viewer puede ver este POI dadas las
 * reglas de propiedad y el criterio canónico de "publicable".
 *
 *   own       : siempre permitido (el owner ve todo lo suyo, sano o roto)
 *   followed  : solo si pasa `isShareablePoi`
 *   app       : solo si pasa `isShareablePoi`
 *   source    : solo si pasa `isShareablePoi`
 *
 * NO decide forma, NO decide color, NO decide opacidad ni zoom gates.
 * Esas son responsabilidades de las capas posteriores.
 *
 * Absorbe la curated-only sharing boundary (mem://logic/sharing/curated-only-rule).
 */

import type { GeoLocation } from '@/types/location';
import { isShareablePoi } from '@/domains/content/lib/is-shareable-poi';
import {
  resolvePoiSource,
  type ResolvedPoiSource,
  type PoiSourceType,
} from '@/domains/content/lib/poi-source';

export type ShareabilityReason =
  | 'own'             // permitido por propiedad
  | 'curated'         // pasa isShareablePoi
  | 'not-curated'     // ajeno y no pasa isShareablePoi
  | 'no-poi';         // entrada nula

export interface ShareabilityResult {
  allowed: boolean;
  reason: ShareabilityReason;
  /** Tipo de origen resuelto (re-export útil para callers que ya lo necesitan). */
  sourceType: PoiSourceType | null;
}

const DENY_NO_POI: ShareabilityResult = {
  allowed: false,
  reason: 'no-poi',
  sourceType: null,
};

export interface ResolveShareabilityOptions {
  /**
   * Resolución pre-calculada de `resolvePoiSource`. Si se provee, evita
   * recomputar (caller tipico: pipeline que ya hizo la capa 1).
   */
  source?: ResolvedPoiSource;
}

/**
 * Decide si `viewerUid` puede ver `poi`.
 *
 * Regla:
 *   - `own`                       -> allowed
 *   - `followed | app | source`   -> allowed sii `isShareablePoi(poi)`
 */
export function resolveShareability(
  viewerUid: string | null,
  poi: GeoLocation | null | undefined,
  opts: ResolveShareabilityOptions = {},
): ShareabilityResult {
  if (!poi) return DENY_NO_POI;

  const source = opts.source ?? resolvePoiSource(viewerUid, poi);

  if (source.type === 'own') {
    return { allowed: true, reason: 'own', sourceType: 'own' };
  }

  if (isShareablePoi(poi)) {
    return { allowed: true, reason: 'curated', sourceType: source.type };
  }

  return { allowed: false, reason: 'not-curated', sourceType: source.type };
}

/** Helper directo: ¿el viewer puede ver este POI? */
export function canViewerSeePoi(
  viewerUid: string | null,
  poi: GeoLocation | null | undefined,
): boolean {
  return resolveShareability(viewerUid, poi).allowed;
}
