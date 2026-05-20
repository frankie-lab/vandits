/**
 * poi-maturity-overlay.ts — Helpers puros del overlay diagnóstico
 * POI-0…POI-10 (v1.2.18).
 *
 * Contrato:
 *   - Sólo decide visibilidad y estilo del BADGE diagnóstico.
 *   - NUNCA toca `createCustomIcon`, `resolvePoiVisualGrammar`,
 *     `getPoiCurationLevel`, `levelKey`, colección/tint, ni ningún otro
 *     resolver canónico del marker.
 *   - Sólo POIs PROPIOS (`paletteScope === 'state'`).
 *   - Sólo en `renderMode ∈ {standard, rich}` (z ≥ 9). En `micro/compact`
 *     se omite por densidad (igual criterio que el canon POI por zoom).
 *
 * Ver `docs/contracts/poi-maturity-visual-contract.md` y plan v1.2.18.
 */

import type { GeoLocation } from '@/types/location';
import type { MarkerRenderMode } from '@/components/map/map-icons';
import {
  resolvePoiVisualGrammar,
} from '@/domains/content/lib/poi-visual-grammar';
import { tokens } from '@/design-system/tokens';
import type { PoiMaturityLevel } from '@/domains/content/lib/poi-maturity';

export interface MaturityBadgeGateArgs {
  /** Toggle del usuario (ya combinado con capability en el hook). */
  enabled: boolean;
  /** Modo de render del mapa (single source of truth en `map-icons`). */
  renderMode: MarkerRenderMode;
  /** Viewer uid; sin viewer no se pinta (no podemos clasificar como propio). */
  viewerUid: string | null;
  /** POI a evaluar. */
  loc: GeoLocation;
}

const ALLOWED_RENDER_MODES: ReadonlySet<MarkerRenderMode> = new Set([
  'standard',
  'rich',
]);

/**
 * True ⇔ debe pintarse el badge diagnóstico sobre este POI. Función pura.
 */
export function shouldRenderMaturityBadge(args: MaturityBadgeGateArgs): boolean {
  if (!args.enabled) return false;
  if (!args.viewerUid) return false;
  if (!ALLOWED_RENDER_MODES.has(args.renderMode)) return false;
  const grammar = resolvePoiVisualGrammar(args.viewerUid, args.loc);
  return grammar.grammar.paletteScope === 'state';
}

export interface MaturityBadgeStyle {
  /** Color de fondo en formato `hsl(...)` listo para CSS. */
  bg: string;
  /** Texto del badge: '0'…'10'. */
  label: string;
}

/**
 * Devuelve estilo (fondo + label) para un nivel POI-N. Lee tokens
 * `poi.maturity.{0..10}` — fuente única.
 */
export function resolveMaturityBadgeStyle(
  level: PoiMaturityLevel,
): MaturityBadgeStyle {
  const palette = tokens.poi.maturity as unknown as Record<string, string>;
  const raw = palette[String(level)];
  // Fallback defensivo: si un token desaparece, no crashea — usa gris neutro.
  const hsl = typeof raw === 'string' && raw.length > 0 ? raw : '0 0% 50%';
  return {
    bg: `hsl(${hsl})`,
    label: String(level),
  };
}
