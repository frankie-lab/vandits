/**
 * poi-curation-level — Capa LÓGICA canónica de niveles de curación del POI.
 *
 * P-POI-CURATION-1. Derivación pura de un veredicto operacional a partir
 * de los helpers canónicos existentes. NO toca el renderer del popup, NO
 * crea variantes visuales, NO fuente de visibilidad de markers.
 *
 * Niveles canónicos (6, inmutables — prohibido inventar POI-2/4/6/7/8):
 *
 *   POI-0   sólo coordenadas, sin nombre validado     red    no       name
 *   POI-1   coords + nombre, sin validar geografía    red    no       validate-geo
 *   POI-3   conflicto geográfico (geoHealth='broken') red    no       resolve-conflict
 *   POI-5   enriquecido con deuda (rings / partial / no visitado)  yellow limited heal
 *   POI-9   enriquecido + visitado + sin rating       green  yes      rate-experience
 *   POI-10  enriquecido + visitado + valorado         green  yes      none
 *
 * Renderer invariance (regla DURA — ver contrato): este veredicto SOLO
 * puede afectar el atributo `data-curation-action` del botón principal
 * del footer canónico. Nunca cambia shell, hero, breadcrumb, composer,
 * ratings block, taxonomía, PopupShell, marker grammar ni visibilidad
 * de markers.
 *
 * Delega 100% en helpers canónicos. No duplica predicados.
 *
 * Ver `docs/contracts/poi-curation-levels.md` y
 * `mem://logic/poi/curation-levels`.
 */

import type { GeoLocation } from '@/types/location';
import { isPointEnriched } from '@/domains/content/lib/point-visual-state';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';

export type PoiCurationLevel = 0 | 1 | 3 | 5 | 9 | 10;
export type PoiCurationHealth = 'red' | 'yellow' | 'green';
export type PoiCurationShareability = 'no' | 'limited' | 'yes';
export type PoiPrimaryAction =
  | 'name'
  | 'validate-geo'
  | 'resolve-conflict'
  | 'heal'
  | 'rate-experience'
  | 'none';

export interface PoiCurationVerdict {
  level: PoiCurationLevel;
  healthState: PoiCurationHealth;
  shareability: PoiCurationShareability;
  primaryAction: PoiPrimaryAction;
}

const LEVEL_HEALTH: Record<PoiCurationLevel, PoiCurationHealth> = {
  0: 'red',
  1: 'red',
  3: 'red',
  5: 'yellow',
  9: 'green',
  10: 'green',
};

const LEVEL_SHAREABILITY: Record<PoiCurationLevel, PoiCurationShareability> = {
  0: 'no',
  1: 'no',
  3: 'no',
  5: 'limited',
  9: 'yes',
  10: 'yes',
};

const LEVEL_ACTION: Record<PoiCurationLevel, PoiPrimaryAction> = {
  0: 'name',
  1: 'validate-geo',
  3: 'resolve-conflict',
  5: 'heal',
  9: 'rate-experience',
  10: 'none',
};

/** Etiquetas es-ES canónicas para el botón principal del footer. */
export const PRIMARY_ACTION_LABEL: Record<PoiPrimaryAction, string> = {
  'name': 'Nombrar',
  'validate-geo': 'Validar geografía',
  'resolve-conflict': 'Resolver conflicto',
  'heal': 'Sanar POI',
  'rate-experience': 'Valorar experiencia',
  'none': '',
};

function hasValidatedName(loc: GeoLocation | null | undefined): boolean {
  const raw = (loc?.name ?? '').trim();
  if (raw.length === 0) return false;
  const lower = raw.toLowerCase();
  if (lower === 'sin nombre' || lower === 'unnamed') return false;
  return true;
}

function hasRatedExperience(loc: GeoLocation | null | undefined): boolean {
  const r = loc?.customData?.user_rating;
  if (!r) return false;
  const n = Number(r);
  return Number.isFinite(n) && n > 0;
}

function isVisited(loc: GeoLocation | null | undefined): boolean {
  return loc?.customData?.visited === 'true';
}

/**
 * Resuelve el nivel de curación del POI.
 *
 * Salud objetiva (rings, geoHealth, enrichment) decide PRIMERO. Estado
 * personal (visited, user_rating) sólo discrimina POI-9 vs POI-10 una
 * vez que el POI ya es objetivamente sano. "Pendiente de visita" NO es
 * deuda de salud y NO produce `heal`.
 */
export function getPoiCurationLevel(loc: GeoLocation | null | undefined): PoiCurationVerdict {
  const safe = (loc ?? null) as GeoLocation | null;
  const enriched = isPointEnriched(safe ?? undefined);
  const geo = safe?.geoHealth ?? null;
  const rings = getPointHealthRings(safe ?? undefined);
  const visited = isVisited(safe);
  const rated = hasRatedExperience(safe);

  let level: PoiCurationLevel;

  if (geo === 'broken') {
    // POI-3 — conflicto geográfico siempre prevalece (incluso enriched).
    level = 3;
  } else if (!enriched && !hasValidatedName(safe)) {
    level = 0;
  } else if (!enriched) {
    level = 1;
  } else if (rings.length > 0 || geo !== 'ok') {
    // Deuda OBJETIVA: rings activos o geoHealth ∈ {partial, stale_name, empty, null}.
    level = 5;
  } else if (visited && rated) {
    level = 10;
  } else {
    // Enriched + sano (rings=[], geo=ok). Visitado o no, sin valoración final.
    level = 9;
  }

  return {
    level,
    healthState: LEVEL_HEALTH[level],
    shareability: LEVEL_SHAREABILITY[level],
    primaryAction: resolvePrimaryAction(level, { visited, rated }),
  };
}

/** Acción principal de curación dado un nivel. */
export function getPoiPrimaryHealingAction(level: PoiCurationLevel): PoiPrimaryAction {
  return LEVEL_ACTION[level];
}

/** Compartibilidad derivada del nivel. */
export function isPoiShareable(level: PoiCurationLevel): PoiCurationShareability {
  return LEVEL_SHAREABILITY[level];
}

/** Salud derivada del nivel. */
export function getPoiCurationHealth(level: PoiCurationLevel): PoiCurationHealth {
  return LEVEL_HEALTH[level];
}
