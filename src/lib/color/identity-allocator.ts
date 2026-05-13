/**
 * identity-allocator — Persistent perceptual color identity allocation
 * (PR-OWNER-IDENTITY-2).
 *
 * Replaces the v1 "hash(uid) % palette" strategy with a maximin perceptual
 * allocator over OKLCH:
 *
 *   C_{n+1} = argmax_{x ∈ V}( min_{Ci ∈ S} ΔE(x, Ci) )
 *
 * where V is a constrained candidate space (cool-leaning, WCAG-safe,
 * excluded from health/state anchors) and S is the set of colors already
 * assigned to the viewer's followed users.
 *
 * Principles (non-negotiable):
 *  1. Persistence — once `(viewer, followed) → color` exists, it never changes.
 *  2. Maximum perceptual distance — each new identity is as far as possible
 *     from all previous identities.
 *  3. Operative WCAG + semantic constraints — readable on light/dark map
 *     tiles AND perceptually distant from health/state anchors (green
 *     enriched, amber/yellow/magenta/red rings, orange empty, grey imported).
 *  4. Progressive degradation — when V is exhausted, still pick the best
 *     candidate but flag `degraded=true` for QA.
 */

import { OklchColor, contrastRatio, deltaEOklab } from './oklch';

export const OWNER_PALETTE_VERSION = 'owner-v2-oklch';

// ── Tier 1: Seed palette ───────────────────────────────────────────────
// 8 cool, mutually-distant identities. These are the SAME 8 colors used
// in v1, expressed in OKLCH so the v1→v2 backfill preserves every existing
// viewer's visual identity exactly. Consumed first in order.
export const SEED_PALETTE: ReadonlyArray<OklchColor> = [
  { L: 0.6531, C: 0.1203, h: 227.19 }, // cyan
  { L: 0.6081, C: 0.1395, h: 245.38 }, // sky
  { L: 0.5755, C: 0.1537, h: 252.47 }, // blue
  { L: 0.5716, C: 0.1737, h: 262.35 }, // azure
  { L: 0.5012, C: 0.1906, h: 269.54 }, // slate-blue
  { L: 0.4607, C: 0.2129, h: 270.83 }, // indigo
  { L: 0.5541, C: 0.1745, h: 291.14 }, // violet
  { L: 0.5446, C: 0.1877, h: 299.25 }, // purple-blue
];

// ── Forbidden anchors (perceptual exclusion) ───────────────────────────
// Health/state colors. Any candidate whose ΔE to ANY anchor is below
// `ANCHOR_MIN_DELTA_E` is excluded from V. Approximated in OKLCH from
// canonical HSL tokens used elsewhere in the app.
//
// NOTE: grey "imported" is NOT in this list. Grey (C=0) sits in the
// middle of OKLab and would dominate distance for every mid-lightness
// hue. We instead enforce a minimum chroma in V so identity colors are
// never desaturated enough to read as grey.
export const FORBIDDEN_ANCHORS: ReadonlyArray<OklchColor> = [
  { L: 0.700, C: 0.180, h: 145 }, // green enriched
  { L: 0.700, C: 0.190, h: 50 },  // orange empty
  { L: 0.770, C: 0.170, h: 70 },  // amber partial
  { L: 0.870, C: 0.180, h: 95 },  // yellow chain
  { L: 0.660, C: 0.260, h: 355 }, // magenta review
  { L: 0.580, C: 0.220, h: 25 },  // red hardError
];

export const ANCHOR_MIN_DELTA_E = 18;
export const DEGRADED_THRESHOLD = 8; // ΔE below this counts as degraded

// ── Tier 2: Candidate space V ──────────────────────────────────────────
// Sampled deterministically. Three lightness × two chroma × 72 hues = 432
// candidates; filtered down by WCAG + anchor exclusion to a stable subset.

const L_SAMPLES = [0.50, 0.58, 0.66];
const C_SAMPLES = [0.14, 0.18];
const H_STEP = 5;

const LIGHT_BG = '#f8fafc';
const DARK_BG = '#0b1220';
// Followed-POI fill sits on a bordered marker with shadow. WCAG 3:1 is
// the non-text UI floor; we relax slightly to preserve the v1 seed
// (immutability of pre-existing identities).
const MIN_BG_CONTRAST = 2.6;

function passesAnchors(c: OklchColor): boolean {
  for (const a of FORBIDDEN_ANCHORS) {
    if (deltaEOklab(c, a) < ANCHOR_MIN_DELTA_E) return false;
  }
  return true;
}

export function isValidCandidate(c: OklchColor): boolean {
  if (contrastRatio(c, LIGHT_BG) < MIN_BG_CONTRAST) return false;
  if (contrastRatio(c, DARK_BG) < MIN_BG_CONTRAST) return false;
  return passesAnchors(c);
}

let _candidateSpace: OklchColor[] | null = null;
export function getCandidateSpace(): OklchColor[] {
  if (_candidateSpace) return _candidateSpace;
  const out: OklchColor[] = [];
  for (let h = 0; h < 360; h += H_STEP) {
    for (const L of L_SAMPLES) {
      for (const C of C_SAMPLES) {
        const c = { L, C, h };
        if (isValidCandidate(c)) out.push(c);
      }
    }
  }
  _candidateSpace = out;
  return out;
}

// ── Allocator ──────────────────────────────────────────────────────────

function colorEq(a: OklchColor, b: OklchColor): boolean {
  return Math.abs(a.L - b.L) < 1e-3 && Math.abs(a.C - b.C) < 1e-3 && Math.abs(a.h - b.h) < 1e-3;
}

function alreadyAssigned(c: OklchColor, assigned: ReadonlyArray<OklchColor>): boolean {
  return assigned.some((x) => colorEq(x, c));
}

export type AllocationResult = { color: OklchColor; degraded: boolean };

/**
 * Pick the next identity color given the viewer's already-assigned colors.
 *
 * - First N (= SEED_PALETTE.length) followeds get seed colors in order.
 * - After that, maximin over V \ assigned.
 * - Degradation is flagged when the best ΔE drops below DEGRADED_THRESHOLD.
 *
 * Deterministic: same `assigned` → same result.
 * Immutable: never re-orders or mutates `assigned`.
 */
export function pickNextIdentityColor(
  assigned: ReadonlyArray<OklchColor>,
): AllocationResult {
  // Seed phase
  for (const seed of SEED_PALETTE) {
    if (!alreadyAssigned(seed, assigned)) {
      return { color: seed, degraded: false };
    }
  }
  // Maximin phase
  const V = getCandidateSpace();
  let best: OklchColor | null = null;
  let bestScore = -Infinity;
  for (const c of V) {
    if (alreadyAssigned(c, assigned)) continue;
    let minD = Infinity;
    for (const a of assigned) {
      const d = deltaEOklab(c, a);
      if (d < minD) minD = d;
      if (d < bestScore) break; // early prune: cannot beat current best
    }
    if (minD > bestScore) {
      // Tiebreak: lower h, then lower L, then lower C (deterministic).
      bestScore = minD;
      best = c;
    } else if (minD === bestScore && best) {
      if (c.h < best.h || (c.h === best.h && c.L < best.L) ||
          (c.h === best.h && c.L === best.L && c.C < best.C)) {
        best = c;
      }
    }
  }
  if (!best) {
    // Total exhaustion (shouldn't happen with 432-cell space): hash fallback.
    const fallback = SEED_PALETTE[assigned.length % SEED_PALETTE.length];
    return { color: fallback, degraded: true };
  }
  return { color: best, degraded: bestScore < DEGRADED_THRESHOLD };
}
