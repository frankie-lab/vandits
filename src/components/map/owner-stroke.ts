/**
 * owner-stroke — Helper único para resolver el color de stroke "identidad
 * relativa del owner seguido". Hash determinista del uid → índice en una
 * paleta cerrada (~10 colores HSL).
 *
 * Reglas:
 *  - Mismo uid → mismo color SIEMPRE (en mapa, popup, leyenda en sidebar).
 *  - La paleta NO colisiona con:
 *      · Health rings: amber (~38°), yellow (~52°), magenta (~320°), red (~0°)
 *      · Propios:      verde (~142°), azul (~207°), naranja (~24°)
 *  - Banda de matices usados: 170°, 195°, 220°, 250°, 270°, 290°, 305°, 335°,
 *    plus dos azulados extra. Saturación moderada, lightness 50% para ser
 *    visible sobre fondo claro y oscuro.
 *
 * Ver mem://style/map/followed-poi-grammar.
 */

const PALETTE: ReadonlyArray<string> = [
  'hsl(170, 70%, 42%)',  // teal
  'hsl(195, 75%, 45%)',  // cyan
  'hsl(220, 70%, 55%)',  // azure
  'hsl(250, 65%, 58%)',  // indigo
  'hsl(270, 60%, 55%)',  // violet
  'hsl(290, 60%, 50%)',  // magenta-soft (no colisiona con review 320)
  'hsl(305, 55%, 48%)',  // purple-pink
  'hsl(335, 60%, 50%)',  // rose (no colisiona con red 0)
  'hsl(180, 65%, 38%)',  // dark teal
  'hsl(235, 60%, 50%)',  // royal blue
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
 * Devuelve el color de stroke para un owner. Si el uid es nulo/vacío
 * usa el primero de la paleta como fallback determinista.
 */
export function getOwnerStrokeColor(ownerUid: string | null | undefined): string {
  if (!ownerUid) return PALETTE[0];
  return PALETTE[hashUid(ownerUid) % PALETTE.length];
}

/** Tamaño de la paleta — útil para tests. */
export const OWNER_PALETTE_SIZE = PALETTE.length;
