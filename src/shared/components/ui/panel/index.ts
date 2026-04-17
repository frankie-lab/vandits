/**
 * Panel System — Barrel.
 *
 * Norma: TODO panel nuevo debe construirse con estas piezas. No reintroducir
 * `FloatingPanel`, `Sheet` o `Drawer` directos en código de feature.
 *
 * Ver ADR: docs/adr/003-panel-system.md
 * Ver memoria: mem://ui/panel-system
 */
export { PanelShell } from './PanelShell';
export type { PanelShellProps } from './PanelShell';

export { PanelHeader } from './PanelHeader';
export type { PanelHeaderProps } from './PanelHeader';

export { PanelBody } from './PanelBody';
export type { PanelBodyProps } from './PanelBody';

export { PanelFooter } from './PanelFooter';
export type { PanelFooterProps } from './PanelFooter';

export { PanelSection } from './PanelSection';
export type { PanelSectionProps } from './PanelSection';

export { PanelTabs } from './PanelTabs';

export { PanelEmptyState } from './PanelEmptyState';
export type { PanelEmptyStateProps } from './PanelEmptyState';

export { PANEL_TOKENS, PANEL_VARIANT_DENSITY } from './tokens';
export type { PanelVariant } from './tokens';
