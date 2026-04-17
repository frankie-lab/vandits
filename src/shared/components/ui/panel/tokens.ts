/**
 * Panel System Tokens — proxy JS de los CSS vars.
 *
 * NO es la fuente de verdad: los valores canónicos viven en `tokens.css`.
 * Este archivo existe para tests y para contadísimos casos donde un cálculo
 * JS necesita el número (p.ej. animaciones medidas).
 *
 * Si cambias un valor aquí, cámbialo también en `tokens.css` o se romperá
 * el sistema. Idealmente: cambia solo el CSS y deja este archivo en paz.
 */

export const PANEL_TOKENS = {
  radius: 16,
  cardRadius: 12,
  headerHeight: 56,
  footerMinHeight: 72,
  paddingX: 16,
  paddingY: 16,
  sectionGap: 24,
  blockGap: 16,
  tabsHeight: 40,
  tabsRadius: 12,
  listRowMinHeight: 56,
  inputHeight: 44,
  ctaHeight: 44,
  emptyPadding: 24,
  sectionTitleMarginBottom: 8,
} as const;

export type PanelVariant = 'form' | 'library' | 'workflow';

/**
 * Densidad por variante. Multiplica gaps base; no altera tokens estructurales
 * (header, footer, padding) que son siempre los mismos.
 */
export const PANEL_VARIANT_DENSITY: Record<PanelVariant, { sectionGap: number; blockGap: number }> = {
  form: { sectionGap: 24, blockGap: 16 },
  library: { sectionGap: 16, blockGap: 12 },
  workflow: { sectionGap: 24, blockGap: 16 },
};
