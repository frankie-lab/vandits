/**
 * Equivalencia perceptual light↔dark + validación WCAG.
 *
 *  - relativeLuminance / contrastRatio   : WCAG 2.1.
 *  - wcagLevel                            : clasifica un ratio.
 *  - deriveOppositeMode                   : genera el par perceptualmente
 *                                           equivalente, iterando si no cumple
 *                                           contraste mínimo contra el fondo.
 *  - ROLE_SURFACE_MAP                     : mapeo rol → token de surface destino.
 *  - resolveTargetBackgroundPath          : dado el path de un token semántico,
 *                                           devuelve el path del surface contra
 *                                           el que se debe medir el contraste.
 */
import {
  parseHslTriplet,
  formatHslTriplet,
  hslToRgb,
  type Hsl,
  type Rgb,
} from './color-conversions';

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

// ─── WCAG ─────────────────────────────────────────────────────────

function srgbChannel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
  );
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

export function wcagLevel(
  ratio: number,
  opts: { largeText?: boolean; uiComponent?: boolean } = {},
): WcagLevel {
  if (opts.uiComponent) {
    return ratio >= 3 ? 'AA' : 'fail';
  }
  if (opts.largeText) {
    if (ratio >= 4.5) return 'AAA';
    if (ratio >= 3) return 'AA-large';
    return 'fail';
  }
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'fail';
}

// ─── HSL helpers ──────────────────────────────────────────────────

export function tripletToHsl(triplet: string | number | undefined): Hsl | null {
  if (triplet === undefined) return null;
  return parseHslTriplet(String(triplet));
}

export function tripletToRgb(triplet: string | number | undefined): Rgb | null {
  const hsl = tripletToHsl(triplet);
  return hsl ? hslToRgb(hsl) : null;
}

// ─── Derivación perceptual ────────────────────────────────────────

export interface DeriveOptions {
  from: 'light' | 'dark';
  /** HSL del fondo destino contra el que validar contraste. */
  targetBgHsl?: Hsl;
  /** Ratio mínimo aceptable (4.5 = AA texto, 3 = AA UI). Por defecto 3. */
  minContrast?: number;
  /** Iteraciones máximas ajustando L. Por defecto 8. */
  maxIterations?: number;
}

/**
 * Convierte un color del modo `from` a su equivalente perceptual en el modo
 * opuesto. Mantiene hue, ajusta saturación y luminosidad según las reglas
 * descritas en el plan, e itera la luminosidad si el contraste contra el
 * fondo destino queda por debajo de `minContrast`.
 */
export function deriveOppositeMode(hsl: Hsl, opts: DeriveOptions): Hsl {
  const { from, targetBgHsl, minContrast = 3, maxIterations = 8 } = opts;
  const isLightToDark = from === 'light';

  // Step 1: ajuste perceptual base.
  let out: Hsl = {
    h: hsl.h, // hue se mantiene
    s: clamp(hsl.s * (isLightToDark ? 0.85 : 1.1), 0, 100),
    l: clamp(hsl.l + (isLightToDark ? 12 : -12), 0, 100),
  };

  // Step 2: iterar L si no hay contraste suficiente contra el fondo destino.
  if (targetBgHsl) {
    const bgRgb = hslToRgb(targetBgHsl);
    const direction = isLightToDark ? 4 : -4; // empujar hacia el extremo lejano al fondo
    // Si el fondo destino es oscuro, el color debe ser más claro y viceversa.
    const bgLuma = relativeLuminance(bgRgb);
    const wantLight = bgLuma < 0.5;
    const stepSign = wantLight ? +Math.abs(direction) : -Math.abs(direction);

    for (let i = 0; i < maxIterations; i++) {
      const ratio = contrastRatio(hslToRgb(out), bgRgb);
      if (ratio >= minContrast) break;
      const nextL = clamp(out.l + stepSign, 0, 100);
      if (nextL === out.l) break;
      out = { ...out, l: nextL };
    }
  }

  return out;
}

export function deriveOppositeTriplet(
  triplet: string,
  opts: DeriveOptions & { targetBgTriplet?: string },
): string | null {
  const hsl = parseHslTriplet(triplet);
  if (!hsl) return null;
  const targetBgHsl = opts.targetBgTriplet
    ? parseHslTriplet(opts.targetBgTriplet) ?? undefined
    : opts.targetBgHsl;
  const out = deriveOppositeMode(hsl, { ...opts, targetBgHsl });
  return formatHslTriplet(out);
}

// ─── Rol → fondo destino ─────────────────────────────────────────

/**
 * Mapeo rol semántico → token de surface contra el que validar contraste.
 * El path NO incluye `light`/`dark`: el consumidor decide qué modo resolver.
 */
export const ROLE_SURFACE_MAP: Record<string, string> = {
  // brand
  'brand.primary': 'surface.background',
  'brand.accent': 'surface.card',
  'brand.accentForeground': 'brand.accent',

  // text
  'text.primary': 'surface.background',
  'text.secondary': 'surface.background',
  'text.inverse': 'brand.primary',

  // state
  'state.success': 'surface.card',
  'state.warning': 'surface.card',
  'state.error': 'surface.card',
  'state.loading': 'surface.card',

  // map + poi
  'map.route': 'map.background',
  'map.selected': 'map.background',
  'poi.mine': 'map.background',
  'poi.followed': 'map.background',
  'poi.service': 'map.background',
  'poi.enriched': 'map.background',
  'poi.empty': 'map.background',
  'poi.error': 'map.background',

  // surface
  'surface.overlay': 'surface.background',
  'surface.border': 'surface.background',
};

/**
 * Dado el path completo de un token (e.g. `color.light.poi.mine`), devuelve
 * el path del token de surface destino EN EL MISMO MODO, o undefined si no
 * está mapeado.
 */
export function resolveTargetBackgroundPath(tokenPath: string): string | undefined {
  // Esperamos color.{light|dark}.{role}
  const m = tokenPath.match(/^color\.(light|dark)\.(.+)$/);
  if (!m) return undefined;
  const [, mode, role] = m;
  const target = ROLE_SURFACE_MAP[role];
  if (!target) return undefined;
  return `color.${mode}.${target}`;
}

/** Path del token "gemelo" en el modo opuesto. */
export function resolveOppositeModePath(tokenPath: string): string | undefined {
  const m = tokenPath.match(/^color\.(light|dark)\.(.+)$/);
  if (!m) return undefined;
  const [, mode, role] = m;
  const opposite = mode === 'light' ? 'dark' : 'light';
  return `color.${opposite}.${role}`;
}
