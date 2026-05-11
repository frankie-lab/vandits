/**
 * Conversiones HEX ↔ RGB ↔ HSL para el editor de color.
 * El formato canónico interno del DS es triplete HSL `"H S% L%"`.
 */

export interface Hsl { h: number; s: number; l: number }
export interface Rgb { r: number; g: number; b: number }

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/** Triplete `"H S% L%"` → {h,s,l}. */
export function parseHslTriplet(v: string): Hsl | null {
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
}

/** {h,s,l} → triplete `"H S% L%"`. */
export function formatHslTriplet({ h, s, l }: Hsl): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(clamp(h, 0, 360))} ${r(clamp(s, 0, 100))}% ${r(clamp(l, 0, 100))}%`;
}

/** HSL → RGB (todos en 0..255 para r,g,b). */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hh = clamp(h, 0, 360) / 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;

  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(hh) * 255),
    b: Math.round(hue2rgb(hh - 1 / 3) * 255),
  };
}

/** RGB → HSL. */
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rr = clamp(r, 0, 255) / 255;
  const gg = clamp(g, 0, 255) / 255;
  const bb = clamp(b, 0, 255) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr: h = (gg - bb) / d + (gg < bb ? 6 : 0); break;
      case gg: h = (bb - rr) / d + 2; break;
      case bb: h = (rr - gg) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Acepta `#abc`, `#aabbcc`, `aabbcc`, `#aabbccff`. Ignora alfa. */
export function parseHex(input: string): Rgb | null {
  const s = input.trim();
  const m = s.match(HEX_RE);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function hslTripletToHex(triplet: string): string | null {
  const hsl = parseHslTriplet(triplet);
  if (!hsl) return null;
  return rgbToHex(hslToRgb(hsl));
}

export function hexToHslTriplet(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return formatHslTriplet(rgbToHsl(rgb));
}
