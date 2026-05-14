/**
 * POI Marker Grammar Resolver — capa 5 del pipeline canónico de POIs.
 *
 *   raw POI
 *     -> resolvePoiSource          (qué es)
 *     -> resolveShareability       (puede verlo este viewer)
 *     -> apply filterBySource      (filtro activo)
 *     -> resolveLayerVisibility    (capa + mute + zoom gate)
 *     -> resolveMarkerGrammar      (shape + decoraciones)   <-- ESTE
 *     -> render
 *
 * Esta capa decide UNA cosa: qué FORMA y qué decoraciones admite el POI
 * por su origen. NO depende de shareability ni de visibilidad — la
 * apariencia base de un `followed` es la misma sea o no curado; si no es
 * curado, simplemente no llega aquí porque shareability lo cortó antes.
 *
 * Reglas (canon):
 *   own       -> círculo            · paleta de estado (enriched/imported/
 *                                      empty), health rings, collection tint
 *   followed  -> triángulo invertido · fill = identidad cromática del owner;
 *                                      SIN paleta de estado, SIN health
 *                                      rings, SIN collection tint
 *   app       -> rombo               · paleta neutra de APP; sin health
 *                                      rings ni tint
 *   source    -> hexágono            · paleta neutra de fuente externa;
 *                                      sin health rings ni tint
 *
 * IMPORTANTE: este módulo es PURO. No toca DOM, no lee zoom, no decide
 * tamaños. Devuelve una descripción declarativa que el renderer
 * (`createCustomIcon`) consume. La adopción en el renderer es incremental.
 */

import type { GeoLocation } from '@/types/location';
import {
  resolvePoiSource,
  type PoiSourceType,
  type ResolvedPoiSource,
} from '@/domains/content/lib/poi-source';

// ────────────────────────────────────────────────────────────────────────
// Tipos.
// ────────────────────────────────────────────────────────────────────────

export type PoiShape = 'circle' | 'inverted-triangle' | 'diamond' | 'hexagon';

/** Cómo se decide el color de relleno principal del marker. */
export type PoiPaletteScope =
  /** Paleta de los 3 estados (enriched/imported/empty). Solo `own`. */
  | 'state'
  /** Identidad cromática persistida del owner. Solo `followed`. */
  | 'owner-identity'
  /** Paleta neutra de APP oficial. Solo `app`. */
  | 'app-neutral'
  /** Paleta neutra de fuente externa. Solo `source`. */
  | 'source-neutral';

export interface ResolvedMarkerGrammar {
  /** Origen ya resuelto (se incluye para evitar recomputarlo aguas arriba). */
  source: ResolvedPoiSource;
  /** Forma geométrica canónica del marker. */
  shape: PoiShape;
  /** Cómo se elige el fill principal. */
  paletteScope: PoiPaletteScope;
  /** ¿Admite los anillos de salud (helper `getPointHealthRings`)? */
  allowHealthRings: boolean;
  /** ¿Admite el aro de tinte de colección? */
  allowCollectionTint: boolean;
  /**
   * ¿Admite stroke blanco perimetral? Los seguidos lo eliminan a propósito
   * (PR-OWNER-IDENTITY-2): la identidad vive en el fill del triángulo.
   */
  allowWhiteStroke: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Decisiones por sourceType.
// ────────────────────────────────────────────────────────────────────────

const GRAMMAR_BY_TYPE: Record<PoiSourceType, Omit<ResolvedMarkerGrammar, 'source'>> = {
  own: {
    shape: 'circle',
    paletteScope: 'state',
    allowHealthRings: true,
    allowCollectionTint: true,
    allowWhiteStroke: true,
    source: undefined as unknown as ResolvedPoiSource, // placeholder, set per call
  } as Omit<ResolvedMarkerGrammar, 'source'>,
  followed: {
    shape: 'inverted-triangle',
    paletteScope: 'owner-identity',
    allowHealthRings: false,
    allowCollectionTint: false,
    allowWhiteStroke: false,
    source: undefined as unknown as ResolvedPoiSource,
  } as Omit<ResolvedMarkerGrammar, 'source'>,
  app: {
    shape: 'diamond',
    paletteScope: 'app-neutral',
    allowHealthRings: false,
    allowCollectionTint: false,
    allowWhiteStroke: true,
    source: undefined as unknown as ResolvedPoiSource,
  } as Omit<ResolvedMarkerGrammar, 'source'>,
  source: {
    shape: 'hexagon',
    paletteScope: 'source-neutral',
    allowHealthRings: false,
    allowCollectionTint: false,
    allowWhiteStroke: true,
    source: undefined as unknown as ResolvedPoiSource,
  } as Omit<ResolvedMarkerGrammar, 'source'>,
};

// ────────────────────────────────────────────────────────────────────────
// API pública.
// ────────────────────────────────────────────────────────────────────────

export interface ResolveMarkerGrammarOptions {
  /** Source ya resuelto por la capa 1 (evita recomputarlo). */
  source?: ResolvedPoiSource;
}

/**
 * Resuelve la gramática visual de un POI para un viewer concreto.
 * Pura: misma entrada → misma salida. Sin side effects.
 */
export function resolveMarkerGrammar(
  viewerUid: string | null,
  poi: GeoLocation,
  opts: ResolveMarkerGrammarOptions = {},
): ResolvedMarkerGrammar {
  const source = opts.source ?? resolvePoiSource(viewerUid, poi);
  const base = GRAMMAR_BY_TYPE[source.type];
  return {
    source,
    shape: base.shape,
    paletteScope: base.paletteScope,
    allowHealthRings: base.allowHealthRings,
    allowCollectionTint: base.allowCollectionTint,
    allowWhiteStroke: base.allowWhiteStroke,
  };
}

/** Helper directo: forma del marker sin construir el resto. */
export function getPoiShape(viewerUid: string | null, poi: GeoLocation): PoiShape {
  return resolveMarkerGrammar(viewerUid, poi).shape;
}
