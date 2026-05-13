/**
 * identity-allocator — Maximin perceptual incremental e inmutable
 * (PR-OWNER-IDENTITY-2.6).
 *
 * Norma canónica para identidad cromática de seguidos:
 *
 *   1. Persistencia: una vez asignado `(viewer, followed) → color`, el
 *      color NO cambia. Las paletas defectuosas previas se purgan en SQL
 *      antes de regenerar.
 *   2. Incrementalidad: el primer seguido toma el color que MAXIMIZA la
 *      distancia perceptual (ΔE OKLab) frente al ancla verde curado;
 *      cada nuevo seguido recibe el color que MAXIMIZA la mínima
 *      distancia perceptual contra el conjunto ya asignado (maximin).
 *   3. Exclusiones cromáticas DURAS para identidad social:
 *        a) verde / amarillo-verdoso  → hue ∈ [FORBIDDEN_HUE_MIN, FORBIDDEN_HUE_MAX]
 *           y vecindad perceptual del verde curado (ancla `enriched`).
 *        b) grises / neutrales        → cromaticidad C < MIN_IDENTITY_CHROMA.
 *      Resto de la rueda OKLCH (rojo, naranja, ámbar, magenta, azul, cyan
 *      no verdoso, violeta) válido como identidad social — el shape
 *      (triángulo invertido vs círculo + rings) elimina la ambigüedad
 *      con los rings semánticos.
 *   4. Determinismo: misma `assigned[]` → mismo siguiente color. Tiebreak
 *      estable.
 *   5. Inmutabilidad: el allocator nunca muta el input.
 *
 * Espacio de candidatos V = sampling denso de la rueda OKLCH FUERA de las
 * zonas prohibidas:
 *   hue ∈ [0°, 360°) paso 5°, L ∈ {0.50, 0.58, 0.66}, C = 0.18.
 */

import { OklchColor, deltaEOklab } from './oklch';

export const OWNER_PALETTE_VERSION = 'owner-v2.6-no-green-no-gray';

// ── Ancla prohibida: verde curado (estado `enriched`) ──────────────────
export const ENRICHED_ANCHOR_OKLCH: OklchColor = { L: 0.72, C: 0.18, h: 145 };

// Radio perceptual prohibido alrededor del verde curado.
export const EXCLUSION_DELTA_E = 25;

// Banda de hue prohibida para identidad social. Cubre amarillo-verdoso,
// verde puro y verde-azulado hasta justo antes del cyan/teal limpio.
export const FORBIDDEN_HUE_MIN = 85;   // amarillo-verdoso en adelante
export const FORBIDDEN_HUE_MAX = 175;  // hasta cyan/teal puro (NO incluido)

// Cromaticidad mínima para considerar un color como "identidad" — por
// debajo de esto la muestra se percibe gris/desaturada.
export const MIN_IDENTITY_CHROMA = 0.16;

// ── Sampling de la rueda OKLCH ─────────────────────────────────────────
const HUE_STEP = 5;
const L_SAMPLES = [0.50, 0.58, 0.66];
const C_SAMPLES = [0.18]; // sin C=0.14 → ya no entran tonos apagados/grisáceos

// ── Espacio de candidatos V ────────────────────────────────────────────

let _candidateSpace: OklchColor[] | null = null;

/** Espacio total muestreado (sin filtros de exclusión). */
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

/** True si el color cae en la banda de hue prohibida (verdes). */
export function isInForbiddenHueBand(c: OklchColor): boolean {
  return c.h >= FORBIDDEN_HUE_MIN && c.h <= FORBIDDEN_HUE_MAX;
}

/** True si el color es perceptualmente cercano al verde curado. */
export function isNearEnrichedAnchor(c: OklchColor): boolean {
  return deltaEOklab(c, ENRICHED_ANCHOR_OKLCH) < EXCLUSION_DELTA_E;
}

/** True si el color es gris/desaturado (cromaticidad insuficiente). */
export function isGrayish(c: OklchColor): boolean {
  return c.C < MIN_IDENTITY_CHROMA;
}

/** Compatibilidad histórica — true si cae en CUALQUIER zona prohibida. */
export function isInForbiddenZone(c: OklchColor): boolean {
  return isInForbiddenHueBand(c) || isNearEnrichedAnchor(c) || isGrayish(c);
}

/** True si el color es candidato válido de identidad social. */
export function isValidCandidate(c: OklchColor): boolean {
  return !isInForbiddenZone(c);
}

/** Espacio útil V = espacio total menos zonas prohibidas. */
export function getCandidateSpace(): OklchColor[] {
  return getRawCandidateSpace().filter(isValidCandidate);
}

// ── Tiebreak determinista ──────────────────────────────────────────────

function compareForTiebreak(a: OklchColor, b: OklchColor): number {
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
 * Determinista e inmutable.
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
      score = deltaEOklab(c, ENRICHED_ANCHOR_OKLCH);
    } else {
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
    // Imposible salvo agotamiento total — devolvemos un magenta seguro
    // que está fuera de las zonas prohibidas.
    return { color: { L: 0.58, C: 0.18, h: 325 }, degraded: true };
  }

  const degraded = assigned.length > 0 && bestScore < DEGRADED_THRESHOLD;
  return { color: best, degraded };
}

export const DEGRADED_THRESHOLD = 12;

// ── Fallback determinista (solo para `owner-stroke` cuando aún no hay
//    assignment cargado). Cubre la rueda fuera de verde y fuera de gris.
//    NO se consume en el allocator. ────────────────────────────────────
export const SEED_PALETTE: ReadonlyArray<OklchColor> = [
  { L: 0.58, C: 0.18, h: 325 }, // magenta
  { L: 0.58, C: 0.18, h: 250 }, // azul
  { L: 0.58, C: 0.18, h: 50 },  // naranja
  { L: 0.58, C: 0.18, h: 195 }, // cyan (>175, válido)
  { L: 0.58, C: 0.18, h: 290 }, // violeta
  { L: 0.58, C: 0.18, h: 25 },  // rojo
  { L: 0.58, C: 0.18, h: 220 }, // azul claro
  { L: 0.58, C: 0.18, h: 350 }, // rosa
];

export { deltaEOklab };
