/**
 * poi-maturity-color.ts — Helper SoT cromático del marker POI (canon v3).
 *
 * Fase 1 de la migración descrita en
 * `docs/contracts/marker-fill-canon-v3.md`. Este helper será la ÚNICA
 * fuente futura para el `fill` del marker propio, sustituyendo el actual
 * `getPointVisualState` → `poi.state.{enriched,imported,empty}`.
 *
 * Contrato:
 *   - `level` proviene SIEMPRE de `computePoiMaturity(loc)` (incluye el
 *     techo por flag `custom_data.geo_resolution.status` ya aplicado
 *     dentro del propio `computePoiMaturity` — POI-N v2).
 *   - `fill` se lee directamente del token `poi.maturity.<level>`
 *     (`hsl(...)` listo para CSS). Sin tablas intermedias, sin remapeo.
 *   - Función PURA: mismas entradas → mismas salidas, sin efectos
 *     secundarios, sin lectura de DOM ni de `getPointVisualState`.
 *
 * IMPORTANTE — Fase 1 NO toca el renderer:
 *   - `createCustomIcon` sigue leyendo `poi.state.*` vía
 *     `getPointVisualState` / `resolvePoiVisualGrammar`.
 *   - `getPointVisualState` se conserva como **semántica legacy**
 *     (filtros, leyendas heredadas, telemetría, buckets), NO como SoT
 *     del fill futuro.
 *   - Este helper queda disponible para Fase 2, en la que el renderer
 *     migrará a leerlo.
 *
 * Ver:
 *   - `docs/contracts/marker-fill-canon-v3.md`
 *   - `docs/contracts/poi-maturity-visual-contract.md`
 *   - `docs/tech-debt.md` — Roadmap "Migrar canon cromático del marker a
 *     POI-N (v1.3.0)".
 */

import { tokens } from '@/design-system/tokens';
import {
  computePoiMaturity,
  type PoiMaturityInput,
  type PoiMaturityLevel,
} from './poi-maturity';

export interface PoiMaturityColor {
  /** Nivel POI-N (0..10) calculado por `computePoiMaturity`. */
  level: PoiMaturityLevel;
  /** Color de fill en formato `hsl(...)` listo para CSS. */
  fill: string;
}

/**
 * Resuelve el color de fill canónico del marker POI a partir de su nivel
 * de madurez (POI-0…POI-10). Fuente única para el canon v3.
 */
export function getPoiMaturityColor(
  loc: PoiMaturityInput | null | undefined,
): PoiMaturityColor {
  const level = computePoiMaturity(loc);
  const palette = tokens.poi.maturity as unknown as Record<string, string>;
  const raw = palette[String(level)];
  // Fallback defensivo: si un token desaparece (no debería), no crashea —
  // usa gris neutro. Mantiene la invariante de que `fill` es siempre un
  // string HSL no vacío.
  const hsl = typeof raw === 'string' && raw.length > 0 ? raw : '0 0% 50%';
  return {
    level,
    fill: `hsl(${hsl})`,
  };
}
