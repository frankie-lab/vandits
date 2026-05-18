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
/**
 * P-POI-CURATION-2 — bloqueo real activo del POI. Es la ÚNICA verdad que
 * gobierna a la vez el bloque del cuerpo y la acción del footer. Renderer
 * y handlers leen siempre el mismo verdict: si `bodyBlocker` cambia, el
 * cuerpo y el footer cambian en el mismo render pass (commit atómico).
 */
export type PoiBodyBlocker =
  | 'name'
  | 'validate-geo'
  | 'enrich-from-context'
  | 'resolve-conflict'
  | 'heal'
  | 'rate'
  | 'none';

export interface PoiCurationVerdict {
  level: PoiCurationLevel;
  healthState: PoiCurationHealth;
  shareability: PoiCurationShareability;
  /** Bloqueo real visible en el cuerpo del popup. Una sola verdad. */
  bodyBlocker: PoiBodyBlocker;
  /** Acción del footer. Invariante: `primaryAction ∈ {bodyBlocker, 'none'}`. */
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
 * P-POI-CURATION-2 — Resuelve `bodyBlocker` (bloqueo real visible en el
 * cuerpo) y `primaryAction` (acción del footer) a partir del nivel + geo +
 * estado personal. Una sola verdad: el cuerpo y el footer derivan SIEMPRE
 * del mismo verdict.
 *
 * Subestados POI-1 (sin crear niveles nuevos):
 *   - POI-1a → geo sin validar (`null`/`empty`/`stale_name`):
 *       bodyBlocker='validate-geo', primaryAction='validate-geo'.
 *   - POI-1b → geo OK pero sin enrich:
 *       bodyBlocker='enrich-from-context' (recovery block ES la acción),
 *       primaryAction='none' (sin botón redundante).
 *
 * Subestados POI-9:
 *   - POI-9a (no visitado): bodyBlocker='rate', primaryAction='none' —
 *     la fila personal del rating block ya comunica "Pendiente".
 *   - POI-9b (visitado, sin rating): bodyBlocker='rate',
 *     primaryAction='none' — las 5 estrellas SON la acción; un botón
 *     "Valorar experiencia" duplicaría la affordance.
 *
 * Invariante R3: `primaryAction ∈ {bodyBlocker, 'none'}`.
 */
function resolveVerdictExtras(
  level: PoiCurationLevel,
  geo: GeoLocation['geoHealth'] | null,
  _state: { visited: boolean; rated: boolean },
): { bodyBlocker: PoiBodyBlocker; primaryAction: PoiPrimaryAction } {
  switch (level) {
    case 0:
      return { bodyBlocker: 'name', primaryAction: 'name' };
    case 1: {
      if (geo === 'ok') {
        return { bodyBlocker: 'enrich-from-context', primaryAction: 'none' };
      }
      return { bodyBlocker: 'validate-geo', primaryAction: 'validate-geo' };
    }
    case 3:
      return { bodyBlocker: 'resolve-conflict', primaryAction: 'resolve-conflict' };
    case 5:
      return { bodyBlocker: 'heal', primaryAction: 'heal' };
    case 9:
      return { bodyBlocker: 'rate', primaryAction: 'none' };
    case 10:
    default:
      return { bodyBlocker: 'none', primaryAction: 'none' };
  }
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
    level = 3;
  } else if (!enriched && !hasValidatedName(safe)) {
    level = 0;
  } else if (!enriched) {
    level = 1;
  } else if (rings.length > 0 || geo !== 'ok') {
    level = 5;
  } else if (visited && rated) {
    level = 10;
  } else {
    level = 9;
  }

  const { bodyBlocker, primaryAction } = resolveVerdictExtras(level, geo, { visited, rated });
  return {
    level,
    healthState: LEVEL_HEALTH[level],
    shareability: LEVEL_SHAREABILITY[level],
    bodyBlocker,
    primaryAction,
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
