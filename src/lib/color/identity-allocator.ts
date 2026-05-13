/**
 * identity-allocator — Maximin perceptual incremental e inmutable
 * (PR-OWNER-IDENTITY-2.5).
 *
 * Norma canónica:
 *
 *   1. Persistencia: una vez asignado `(viewer, followed) → color`, el
 *      color NO cambia. Las paletas defectuosas previas se purgan en SQL
 *      antes de regenerar.
 *   2. Incrementalidad: el primer seguido toma el color que MAXIMIZA la
 *      distancia perceptual (ΔE OKLab) frente al ancla verde curado;
 *      cada nuevo seguido recibe el color que MAXIMIZA la mínima
 *      distancia perceptual contra el conjunto ya asignado (maximin).
 *   3. Única exclusión cromática DURA: vecindad perceptual del verde
 *      curado (ancla `enriched`). Rojo/naranja/amber/magenta/azul/violeta
 *      siguen siendo válidos como identidad social: el shape (triángulo
 *      invertido vs círculo + rings) elimina la ambigüedad con los rings
 *      semánticos.
 *   4. Determinismo: misma `assigned[]` → mismo siguiente color. Tiebreak
 *      estable.
 *   5. Inmutabilidad: el allocator nunca muta el input.
 *
 * Espacio de candidatos V = sampling denso de la rueda OKLCH:
 *   hue ∈ [0°, 360°) paso 5°, L ∈ {0.50, 0.58, 0.66}, C ∈ {0.14, 0.18}.
 *
 * Filtro: descartar `c` con `ΔE(c, ENRICHED_ANCHOR) < EXCLUSION_DELTA_E`.
 */

import { OklchColor, deltaEOklab } from './oklch';

export const OWNER_PALETTE_VERSION = 'owner-v2.5-maximin-perceptual';

// ── Ancla prohibida única: verde curado (estado `enriched`) ────────────
export const ENRICHED_ANCHOR_OKLCH: OklchColor = { L: 0.72, C: 0.18, h: 145 };

// Radio perceptual prohibido alrededor del verde curado. Calibrado para
// excluir todo el bloque verde (≈ hue 110°–175°) sin tocar amarillo,
// teal/cyan ni el resto de la rueda.
export const EXCLUSION_DELTA_E = 25;

// ── Sampling de la rueda OKLCH ─────────────────────────────────────────
const HUE_STEP = 5;
const L_SAMPLES = [0.50, 0.58, 0.66];
const C_SAMPLES = [0.14, 0.18];

// ── Espacio de candidatos V ────────────────────────────────────────────

let _candidateSpace: OklchColor[] | null = null;

/** Espacio total muestreado (sin filtro de exclusión). */
export function getRawCandidateSpace(): OklchColor[] {
  if (_candidateSpace) return _candidateSpace;
  const out: OklchColor[] = [];
  for (let h = 0; h < 360; h += HUE_STEP) {
    for (const L of L_SAMPLES) {
      for (const C of C_SAMPLES) {
        out.push({ L, C, h });
      }
    }
  }
  _candidateSpace = out;
  return out;
}

/** True si el color cae dentro de la zona perceptual prohibida (verde). */
export function isInForbiddenZone(c: OklchColor): boolean {
  return deltaEOklab(c, ENRICHED_ANCHOR_OKLCH) < EXCLUSION_DELTA_E;
}

/** True si el color es candidato válido (fuera de la zona prohibida). */
export function isValidCandidate(c: OklchColor): boolean {
  return !isInForbiddenZone(c);
}

/** Espacio útil V = espacio total menos zona prohibida del verde. */
export function getCandidateSpace(): OklchColor[] {
  return getRawCandidateSpace().filter(isValidCandidate);
}

// ── Tiebreak determinista ──────────────────────────────────────────────

function compareForTiebreak(a: OklchColor, b: OklchColor): number {
  // Hue ascendente, luego L ascendente, luego C ascendente.
  if (a.h !== b.h) return a.h - b.h;
  if (a.L !== b.L) return a.L - b.L;
  return a.C - b.C;
}

function colorEq(a: OklchColor, b: OklchColor): boolean {
  return Math.abs(a.L - b.L) < 1e-6
      && Math.abs(a.C - b.C) < 1e-6
      && Math.abs(a.h - b.h) < 1e-6;
}

// ── Allocator ──────────────────────────────────────────────────────────

export type AllocationResult = { color: OklchColor; degraded: boolean };

/**
 * Selecciona el color para el siguiente seguido dado el conjunto ya
 * asignado.
 *
 *   - assigned = []           → argmax_x ΔE(x, ENRICHED_ANCHOR) sobre V.
 *   - assigned = [c1,...,cN]  → argmax_x ( min_{c∈S} ΔE(x, c) ) sobre V.
 *
 * Determinista: misma entrada → misma salida. Inmutable: no muta el input.
 *
 * `degraded=true` solo si el mejor candidato queda excesivamente cerca de
 * algún ya asignado (ΔE < DEGRADED_THRESHOLD), señal de saturación. No
 * bloquea la asignación.
 */
export function pickNextIdentityColor(
  assigned: ReadonlyArray<OklchColor>,
): AllocationResult {
  const V = getCandidateSpace();

  let best: OklchColor | null = null;
  let bestScore = -Infinity;

  for (const c of V) {
    if (assigned.some((a) => colorEq(a, c))) continue;

    let score: number;
    if (assigned.length === 0) {
      // Argmax distancia al ancla verde.
      score = deltaEOklab(c, ENRICHED_ANCHOR_OKLCH);
    } else {
      // Maximin contra el conjunto ya asignado.
      let minD = Infinity;
      for (const a of assigned) {
        const d = deltaEOklab(c, a);
        if (d < minD) minD = d;
      }
      score = minD;
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
    } else if (score === bestScore && best && compareForTiebreak(c, best) < 0) {
      best = c;
    }
  }

  if (!best) {
    // Imposible salvo agotamiento total.
    return { color: { L: 0.58, C: 0.18, h: 250 }, degraded: true };
  }

  const degraded = assigned.length > 0 && bestScore < DEGRADED_THRESHOLD;
  return { color: best, degraded };
}

// Umbral ΔE bajo el cual se considera que el siguiente color queda
// perceptualmente demasiado cerca de uno ya asignado (saturación).
export const DEGRADED_THRESHOLD = 12;

// ── Fallback determinista (solo para `owner-stroke` cuando aún no hay
//    assignment cargado). Cubre la rueda fuera del verde. NO se consume
//    en ningún path del allocator. ───────────────────────────────────────
export const SEED_PALETTE: ReadonlyArray<OklchColor> = [
  { L: 0.58, C: 0.18, h: 325 }, // magenta
  { L: 0.58, C: 0.18, h: 250 }, // azul
  { L: 0.58, C: 0.18, h: 50 },  // naranja
  { L: 0.58, C: 0.18, h: 195 }, // cyan
  { L: 0.58, C: 0.18, h: 290 }, // violeta
  { L: 0.58, C: 0.18, h: 25 },  // rojo
  { L: 0.58, C: 0.18, h: 95 },  // amarillo
  { L: 0.58, C: 0.18, h: 220 }, // azul claro
];

// Re-export usado por owner-stroke / tests.
export { deltaEOklab };
