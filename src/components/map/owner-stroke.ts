/**
 * owner-stroke — Helpers de color de identidad del owner para POIs de
 * usuarios SEGUIDOS.
 *
 * Reglas (PR-OWNER-IDENTITY-1):
 *  - Identidad del seguido = **color persistido por viewer** en
 *    `user_owner_color_assignments`. Estable y permanente; no cambia por
 *    zoom, sesión, viewport ni nuevos seguidos.
 *  - Cada viewer mantiene su propio mapeo `followedUid → colorIndex`.
 *  - Fallback determinista cuando aún no hay asignación: hash(uid) % N.
 *  - Paleta cerrada SOLO con familias frías hue 195–265 (lejos del verde
 *    fill enriched y de los hues de salud). Versión: `OWNER_PALETTE_VERSION`.
 *
 * **HUE PROHIBIDOS** (FORBIDDEN_HUE_RANGES) — bloqueados por test:
 *   ·   0–45  red / orange / amber  (hardError, naranja empty)
 *   ·  45–75  yellow                 (chain)
 *   ·  90–190 verde / lime / teal verdoso (enriched fill)
 *   · 300–340 magenta / pink         (review)
 *
 * Health rings (DOMINIO RESERVADO):
 *   partial=amber  chain=yellow  review=magenta  hardError=red
 * Estados POI (DOMINIO RESERVADO):
 *   enriched=verde  imported=gris  empty=naranja
 *
 * Ver mem://style/map/followed-poi-grammar.
 */

/** Versión de paleta — guardada en DB con cada asignación para permitir
 *  migraciones futuras sin ambigüedad. Bump cuando cambie PALETTE. */
export const OWNER_PALETTE_VERSION = 'owner-v1';

/** Paleta cerrada: 8 colores fríos hue 195–265 (cyan → purple-blue).
 *  Lightness 38–58% para visibilidad sobre tile claro y oscuro. */
const PALETTE: ReadonlyArray<string> = [
  'hsl(195, 75%, 45%)',  // cyan
  'hsl(205, 70%, 48%)',  // sky
  'hsl(210, 70%, 48%)',  // blue
  'hsl(220, 70%, 55%)',  // azure
  'hsl(230, 60%, 52%)',  // slate-blue
  'hsl(235, 60%, 50%)',  // indigo dark
  'hsl(255, 55%, 58%)',  // violet
  'hsl(265, 55%, 55%)',  // purple-blue
];

/** Rangos de hue prohibidos (colisionan con salud o estados POI). */
export const FORBIDDEN_HUE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 45],     // red / orange / amber → hardError, naranja empty
  [45, 75],    // yellow → chain
  [90, 190],   // green / lime / teal verdoso → enriched (mínimo 190 para owner)
  [300, 340],  // magenta / pink → review
];

/** Hash determinista uid → índice paleta. djb2 simplificado. */
function hashUid(uid: string): number {
  let h = 5381;
  for (let i = 0; i < uid.length; i++) {
    h = ((h << 5) + h + uid.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Fallback determinista (sin asignación persistida). Mismo uid → mismo
 * color SIEMPRE. Se usa mientras el store carga o si el viewer aún no
 * ha generado asignación para ese seguido.
 */
export function getOwnerStrokeColor(ownerUid: string | null | undefined): string {
  if (!ownerUid) return PALETTE[0];
  return PALETTE[hashUid(ownerUid) % PALETTE.length];
}

/**
 * Resuelve el color de identidad del owner para el viewer actual.
 *  - Si hay `colorIndex` persistido → devuelve `PALETTE[index % N]` (módulo
 *    para tolerar cambios de paleta sin romper).
 *  - Si no → fallback hash determinista.
 *
 * El renderer DEBE consumir esta función (no `getOwnerStrokeColor`
 * directamente) para respetar la asignación persistida del viewer.
 */
export function getOwnerIdentityColor(
  ownerUid: string | null | undefined,
  colorIndex: number | null | undefined,
): string {
  if (typeof colorIndex === 'number' && Number.isFinite(colorIndex) && colorIndex >= 0) {
    return PALETTE[colorIndex % PALETTE.length];
  }
  return getOwnerStrokeColor(ownerUid);
}

/** Tamaño de la paleta — útil para tests y para el algoritmo de asignación. */
export const OWNER_PALETTE_SIZE = PALETTE.length;

/** Snapshot de la paleta — solo para tests / herramientas de QA. */
export const _OWNER_PALETTE_FOR_TEST: ReadonlyArray<string> = PALETTE;

/** Extrae el hue de un string `hsl(H, S%, L%)`. Devuelve null si no parsea. */
export function parseHslHue(hsl: string): number | null {
  const m = hsl.match(/hsl\(\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const h = parseFloat(m[1]);
  if (!Number.isFinite(h)) return null;
  return ((h % 360) + 360) % 360;
}
