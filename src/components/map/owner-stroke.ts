/**
 * owner-stroke — Helper único para resolver el color de stroke "identidad
 * relativa del owner seguido". Hash determinista del uid → índice en una
 * paleta cerrada SOLO de familias frías.
 *
 * Reglas (PR-OWNER-STROKE-PALETTE-GUARD):
 *  - Mismo uid → mismo color SIEMPRE (en mapa, popup, leyenda en sidebar).
 *  - La paleta SOLO usa familias frías para no confundirse con salud:
 *      teal · cyan · azure · indigo · violet frío · royal blue
 *  - **HUE PROHIBIDOS** (FORBIDDEN_HUE_RANGES) — bloqueados por test:
 *      ·   0–45  red / orange / amber  (colisiona con hardError, naranja estado)
 *      ·  45–75  yellow                 (colisiona con chain)
 *      ·  90–160 verde / lime           (colisiona con enriched)
 *      · 300–340 magenta / pink         (colisiona con review)
 *  - Lightness 45–55% para visibilidad sobre tile claro y oscuro.
 *
 * Health rings (DOMINIO RESERVADO, no usar):
 *   partial=amber  chain=yellow  review=magenta  hardError=red
 *
 * Estados POI (DOMINIO RESERVADO, no usar):
 *   enriched=verde  imported=gris  empty=naranja
 *
 * Ver mem://style/map/followed-poi-grammar.
 */

/** Familias frías (hue 180–270). Mínimo 180 para evitar teal verdoso que
 *  podría confundirse con el fill verde "enriched". */
const PALETTE: ReadonlyArray<string> = [
  'hsl(180, 65%, 38%)',  // dark teal
  'hsl(190, 70%, 42%)',  // teal-cyan
  'hsl(200, 75%, 45%)',  // cyan
  'hsl(210, 70%, 48%)',  // sky blue
  'hsl(220, 70%, 55%)',  // azure
  'hsl(235, 60%, 50%)',  // royal blue
  'hsl(250, 65%, 58%)',  // indigo
  'hsl(265, 55%, 55%)',  // violet frío
];

/** Rangos de hue prohibidos (colisionan con salud o estados POI). */
export const FORBIDDEN_HUE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 45],     // red / orange / amber → hardError, naranja empty
  [45, 75],    // yellow → chain
  [90, 160],   // green / lime → enriched
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
 * Devuelve el color de stroke para un owner. Si el uid es nulo/vacío
 * usa el primero de la paleta como fallback determinista.
 */
export function getOwnerStrokeColor(ownerUid: string | null | undefined): string {
  if (!ownerUid) return PALETTE[0];
  return PALETTE[hashUid(ownerUid) % PALETTE.length];
}

/** Tamaño de la paleta — útil para tests. */
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
