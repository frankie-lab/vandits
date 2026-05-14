/**
 * POI Layer — capa 5 del pipeline canónico de POIs (PR-POI-SOURCE-7).
 *
 * Pipeline:
 *   raw POI
 *     -> resolvePoiSource         (qué es)
 *     -> resolveShareability      (puede verlo este viewer)
 *     -> filterBySource           (filtro activo)
 *     -> resolveMarkerGrammar     (forma + color + decoraciones)
 *     -> resolveLayerGroupKey     (clasificación física)        <-- ESTE ARCHIVO
 *     -> resolveLayerVisibility   (visible / oculto)             <-- ESTE ARCHIVO
 *     -> render
 *
 * REGLA CLAVE: clasificación física != visibilidad. Son funciones puras
 * INDEPENDIENTES aunque convivan aquí. Un POI siempre tiene un grupo físico
 * estable; otra cosa es si en este momento debe pintarse.
 */

import type { ResolvedPoiSource } from '@/domains/content/lib/poi-source';
import type { LayerGroupKey } from '@/components/map/map-layer-groups';
import type { LayerVisibilityState } from '@/hooks/use-layer-visibility';

// ────────────────────────────────────────────────────────────────────────
// Zoom gates canónicos. Defaults pensados para no saturar el mapa global.
// followed=7 (no aparece en zooms muy lejos para evitar solape con own).
// app=6 (denso pero útil temprano).
// source=8 (más restrictivo por ruido externo).
// ────────────────────────────────────────────────────────────────────────

export interface ZoomGates {
  followed: number;
  app: number;
  source: number;
}

export const DEFAULT_ZOOM_GATES: ZoomGates = {
  followed: 7,
  app: 6,
  source: 8,
};

// ────────────────────────────────────────────────────────────────────────
// resolveLayerGroupKey — SOLO clasificación física.
// ────────────────────────────────────────────────────────────────────────

/**
 * Devuelve la clave del LayerGroup de Leaflet al que pertenece este POI.
 * Esta decisión es estable: NO depende del zoom, mutes ni capa activa.
 *
 * - own       -> 'own'
 * - followed  -> 'followed:<ownerUid>'  (ownerUid garantizado por shareability)
 * - app       -> 'app:<groupId|default>'
 * - source    -> 'source:<sourceId>'
 *
 * Para 'followed' sin ownerUid (huérfano que aún así pasa shareability)
 * caemos a `followed:__anon__` para no perderlo.
 */
export function resolveLayerGroupKey(source: ResolvedPoiSource): LayerGroupKey {
  switch (source.type) {
    case 'own':
      return 'own';
    case 'followed':
      return `followed:${source.ownerUid ?? '__anon__'}` as LayerGroupKey;
    case 'app':
      return `app:${source.groupId ?? 'default'}` as LayerGroupKey;
    case 'source':
      return `source:${source.sourceId ?? 'unknown'}` as LayerGroupKey;
  }
}

// ────────────────────────────────────────────────────────────────────────
// resolveLayerVisibility — SOLO visibilidad.
// ────────────────────────────────────────────────────────────────────────

export type LayerVisibilityReason =
  | 'ok'
  | 'layer-off'
  | 'entity-muted'
  | 'below-zoom-gate';

export interface LayerVisibilityResult {
  visible: boolean;
  reason: LayerVisibilityReason;
}

export interface ResolveLayerVisibilityCtx {
  zoom: number;
  layers: LayerVisibilityState;
  zoomGates?: Partial<ZoomGates>;
}

const VISIBLE: LayerVisibilityResult = { visible: true, reason: 'ok' };

/**
 * Decide si este POI debe pintarse para el viewer ahora mismo.
 *
 * Reglas:
 *  - own       : visible si capa own activa. Sin zoom gate.
 *  - followed  : capa followed activa && owner no muteado && zoom >= gate.
 *  - app       : capa app activa (padre) && (sin groupId || groupId no muteado)
 *                && zoom >= gate.
 *  - source    : capa source activa && sourceId no muteado && zoom >= gate.
 *
 * Defecto seguro: si `layers[type]` no existe (estado aún no inicializado),
 * se trata como visible para no romper la carga inicial.
 *
 * IMPORTANTE: el modelo capa-padre + grupos hijos para `app`/`source` se
 * implementa aquí. La capa padre (`layers.app.visible`) apaga TODOS los
 * grupos APP; `entityHidden` permite ocultar grupos individuales sin tocar
 * la capa padre.
 */
export function resolveLayerVisibility(
  source: ResolvedPoiSource,
  ctx: ResolveLayerVisibilityCtx,
): LayerVisibilityResult {
  const gates: ZoomGates = { ...DEFAULT_ZOOM_GATES, ...(ctx.zoomGates ?? {}) };
  const { layers, zoom } = ctx;

  switch (source.type) {
    case 'own': {
      const layer = layers.own;
      if (layer && layer.visible === false) return { visible: false, reason: 'layer-off' };
      return VISIBLE;
    }

    case 'followed': {
      const layer = layers.followed;
      if (layer && layer.visible === false) return { visible: false, reason: 'layer-off' };
      if (zoom < gates.followed) return { visible: false, reason: 'below-zoom-gate' };
      if (source.ownerUid && layer?.entityHidden?.includes(source.ownerUid)) {
        return { visible: false, reason: 'entity-muted' };
      }
      return VISIBLE;
    }

    case 'app': {
      const layer = layers.app;
      if (layer && layer.visible === false) return { visible: false, reason: 'layer-off' };
      if (zoom < gates.app) return { visible: false, reason: 'below-zoom-gate' };
      if (source.groupId && layer?.entityHidden?.includes(source.groupId)) {
        return { visible: false, reason: 'entity-muted' };
      }
      return VISIBLE;
    }

    case 'source': {
      const layer = layers.source;
      if (layer && layer.visible === false) return { visible: false, reason: 'layer-off' };
      if (zoom < gates.source) return { visible: false, reason: 'below-zoom-gate' };
      if (source.sourceId && layer?.entityHidden?.includes(source.sourceId)) {
        return { visible: false, reason: 'entity-muted' };
      }
      return VISIBLE;
    }
  }
}
