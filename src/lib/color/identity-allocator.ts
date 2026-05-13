/**
 * identity-allocator — Asignación cromática incremental, inmutable y
 * perceptiva para usuarios seguidos (PR-OWNER-IDENTITY-2.4).
 *
 * Norma operativa (la única válida):
 *
 *   1. Persistencia: una vez asignado `(viewer, followed) → color`, el
 *      color NO cambia. Los colores antiguos previos a esta versión han
 *      sido borrados del store.
 *   2. Incrementalidad: el primer seguido toma el color base de la zona
 *      útil; cada nuevo seguido recibe el color más distante del conjunto
 *      ya asignado.
 *   3. No reutilización: ningún color asignado se vuelve a entregar.
 *   4. Exclusión semántica DURA: ningún seguido puede caer en familias
 *      reservadas del sistema (verde enriched, naranja empty, amber
 *      partial, amarillo chain, rojo hardError, magenta review). La
 *      exclusión es por BANDA DE HUE, no por punto OKLab — porque el ojo
 *      lee la familia por hue, no por la distancia técnica ΔE en OKLab.
 *   5. Separación visual real: además del maximin, se exige un hue-gap
 *      mínimo entre cualquier par de seguidos asignados. Si el gap mínimo
 *      no se puede cumplir, se marca `degraded=true` para QA.
 *
 * Espacio útil para seguidos = banda fría continua [180°, 320°]:
 * cyan → teal → blue → indigo → violet → purple. Esta banda excluye por
 * construcción todos los hues semánticos reservados del sistema.
 */

import { OklchColor, deltaEOklab } from './oklch';

// PR-OWNER-IDENTITY-2.4 — regla nueva (hue-band + hue-gap). Las filas
// nacidas con cualquier paleta anterior se purgan en runtime/SQL antes
// de regenerar.
export const OWNER_PALETTE_VERSION = 'owner-v2.4-cool-hue-band';

// ── Banda fría única para seguidos ─────────────────────────────────────
// Hues admitidos (grados). Excluye por construcción rojo (25), naranja
// (50), amber (70), amarillo (95), verde (145) y magenta (355).
const HUE_MIN = 180;
const HUE_MAX = 320;
const HUE_STEP = 2; // resolución fina del candidato

const L_SAMPLES = [0.50, 0.58, 0.66];
const C_SAMPLES = [0.14, 0.18];

// Hue-gap mínimo (grados) que cualquier par de seguidos asignados debe
// respetar. Con 71 hues útiles (320-180)/2, soporta cómodamente 4 colores
// muy separados (~35° entre sí). A partir del 5º se degrada el gap.
export const MIN_HUE_GAP_DEG = 30;
export const DEGRADED_HUE_GAP_DEG = 18;

// ── Anchors reservados (solo informativos para tests / contrato) ───────
// La banda [180,320] ya los excluye, pero los listamos para test de
// contrato y para el día de mañana si se amplía la banda.
export const FORBIDDEN_ANCHORS: ReadonlyArray<OklchColor> = [
  { L: 0.700, C: 0.180, h: 145 }, // green enriched
  { L: 0.700, C: 0.190, h: 50 },  // orange empty
  { L: 0.770, C: 0.170, h: 70 },  // amber partial
  { L: 0.870, C: 0.180, h: 95 },  // yellow chain
  { L: 0.660, C: 0.260, h: 355 }, // magenta review
  { L: 0.580, C: 0.220, h: 25 },  // red hardError
];

// SEED_PALETTE conservado SOLO como fallback determinista en
// `owner-stroke.ts` cuando aún no hay assignment cargado. NO se consume
// en ningún path del allocator.
export const SEED_PALETTE: ReadonlyArray<OklchColor> = [
  { L: 0.50, C: 0.18, h: 250 }, // azul
  { L: 0.58, C: 0.18, h: 280 }, // violeta
  { L: 0.50, C: 0.18, h: 200 }, // teal
  { L: 0.66, C: 0.18, h: 220 }, // azul claro
  { L: 0.50, C: 0.18, h: 310 }, // púrpura
  { L: 0.58, C: 0.18, h: 190 }, // cyan
  { L: 0.50, C: 0.18, h: 265 }, // índigo
  { L: 0.66, C: 0.18, h: 295 }, // violeta claro
];

// ── Espacio de candidatos V ────────────────────────────────────────────

let _candidateSpace: OklchColor[] | null = null;
export function getCandidateSpace(): OklchColor[] {
  if (_candidateSpace) return _candidateSpace;
  const out: OklchColor[] = [];
  for (let h = HUE_MIN; h <= HUE_MAX; h += HUE_STEP) {
    for (const L of L_SAMPLES) {
      for (const C of C_SAMPLES) {
        out.push({ L, C, h });
      }
    }
  }
  _candidateSpace = out;
  return out;
}

export function isValidCandidate(c: OklchColor): boolean {
  return c.h >= HUE_MIN && c.h <= HUE_MAX;
}

// ── Helpers de hue ─────────────────────────────────────────────────────

/** Distancia angular mínima entre dos hues (grados, 0–180). */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function colorEq(a: OklchColor, b: OklchColor): boolean {
  return Math.abs(a.L - b.L) < 1e-3 && Math.abs(a.C - b.C) < 1e-3 && Math.abs(a.h - b.h) < 1e-3;
}

// ── Allocator ──────────────────────────────────────────────────────────

export type AllocationResult = { color: OklchColor; degraded: boolean };

/**
 * Selecciona el color para el siguiente seguido dado el conjunto de
 * colores ya asignados. Norma:
 *
 *   - 1er seguido (`assigned = []`) → color base determinista de la banda.
 *   - N-ésimo seguido → maximin de hue-distance contra `assigned`,
 *     respetando `MIN_HUE_GAP_DEG` cuando sea posible.
 *   - Si no hay candidato que cumpla `MIN_HUE_GAP_DEG`, se relaja al
 *     mejor disponible y se marca `degraded=true`.
 *
 * Determinista: misma entrada → misma salida. Inmutable: nunca muta el
 * input.
 */
export function pickNextIdentityColor(
  assigned: ReadonlyArray<OklchColor>,
): AllocationResult {
  const V = getCandidateSpace();

  // Caso base: primer seguido. Ancla determinista en mitad de la banda
  // (h=250, azul medio), L=0.50 / C=0.18. NO depende de anchors porque
  // la banda ya los excluye.
  if (assigned.length === 0) {
    return { color: { L: 0.50, C: 0.18, h: 250 }, degraded: false };
  }

  const assignedHues = assigned.map((a) => a.h);

  // Score de cada candidato = mínima distancia angular (en hue) contra
  // los seguidos ya asignados. Maximin puro sobre hue. L y C se usan
  // solo para variar ligeramente la presentación final, no para el
  // score (porque el ojo identifica al usuario por hue).
  let best: OklchColor | null = null;
  let bestScore = -Infinity;

  for (const c of V) {
    // Excluir ya asignados exactos.
    if (assigned.some((a) => colorEq(a, c))) continue;

    let minHueGap = Infinity;
    for (const h of assignedHues) {
      const d = hueDistance(c.h, h);
      if (d < minHueGap) minHueGap = d;
    }

    if (minHueGap > bestScore) {
      bestScore = minHueGap;
      best = c;
    } else if (minHueGap === bestScore && best) {
      // Tiebreak determinista: hue ascendente, luego L, luego C.
      if (c.h < best.h ||
          (c.h === best.h && c.L < best.L) ||
          (c.h === best.h && c.L === best.L && c.C < best.C)) {
        best = c;
      }
    }
  }

  if (!best) {
    // Imposible salvo agotamiento total — devolvemos algo determinista.
    return { color: SEED_PALETTE[assigned.length % SEED_PALETTE.length], degraded: true };
  }

  const degraded = bestScore < MIN_HUE_GAP_DEG;
  return { color: best, degraded };
}

// ── Constantes legacy expuestas para tests previos (compat) ───────────
// Las dejamos para no romper imports antiguos hasta que se actualicen
// los tests. La regla nueva NO las usa.
export const ANCHOR_MIN_DELTA_E = 18;
export const DEGRADED_THRESHOLD = 8;

// Re-export necesario para tests legacy que comparan ΔE.
export { deltaEOklab };
