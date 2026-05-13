/**
 * oklch — Color math: sRGB ↔ OKLab ↔ OKLCH, perceptual ΔE, WCAG contrast.
 *
 * Used by the owner identity allocator (PR-OWNER-IDENTITY-2). HSL is no
 * longer used as a distance metric — distances are computed in OKLab,
 * which is approximately perceptually uniform.
 */

export type OklchColor = { L: number; C: number; h: number };

// ── HSL/RGB/sRGB ───────────────────────────────────────────────────────

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const srgbToLinear = (u: number) =>
  u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
const linearToSrgb = (u: number) =>
  u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;

// ── sRGB ↔ OKLab ───────────────────────────────────────────────────────

export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bl)].map((v) =>
    Math.max(0, Math.min(1, v)),
  ) as [number, number, number];
}

// ── OKLab ↔ OKLCH ──────────────────────────────────────────────────────

export function oklabToOklch(L: number, a: number, b: number): OklchColor {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export function oklchToOklab(c: OklchColor): [number, number, number] {
  const r = (c.h * Math.PI) / 180;
  return [c.L, c.C * Math.cos(r), c.C * Math.sin(r)];
}

export function oklchToRgb(c: OklchColor): [number, number, number] {
  const [L, a, b] = oklchToOklab(c);
  return oklabToRgb(L, a, b);
}

// ── ΔE (OKLab Euclidean) ───────────────────────────────────────────────
// Perceptually meaningful enough for identity assignment. ΔE2000 is a
// future upgrade — see plan PR-OWNER-IDENTITY-2.

export function deltaEOklab(a: OklchColor, b: OklchColor): number {
  const [aL, aA, aB] = oklchToOklab(a);
  const [bL, bA, bB] = oklchToOklab(b);
  // Scale to a roughly 0–100 range so threshold values feel familiar.
  return 100 * Math.hypot(aL - bL, aA - bA, aB - bB);
}

// ── CSS ────────────────────────────────────────────────────────────────

export function oklchToCss(c: OklchColor): string {
  // CSS oklch() takes L as 0–1 (or %) and h in degrees.
  return `oklch(${c.L.toFixed(4)} ${c.C.toFixed(4)} ${c.h.toFixed(2)})`;
}

export function oklchToHexFallback(c: OklchColor): string {
  const [r, g, b] = oklchToRgb(c);
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ── WCAG ───────────────────────────────────────────────────────────────

function relLum([r, g, b]: [number, number, number]): number {
  const lin = (u: number) => srgbToLinear(u);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(c: OklchColor, vsHex: string): number {
  const m = vsHex.replace('#', '');
  const r = parseInt(m.substring(0, 2), 16) / 255;
  const g = parseInt(m.substring(2, 4), 16) / 255;
  const b = parseInt(m.substring(4, 6), 16) / 255;
  const L1 = relLum(oklchToRgb(c));
  const L2 = relLum([r, g, b]);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}
