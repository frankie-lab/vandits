/**
 * EffectiveActionFooter — label builder (función pura).
 *
 * Plan: docs/audits/search-filter-maintain-tree-universe-plan.md §5.
 * Texto canónico del footer fijo de acciones según universo activo,
 * presencia de selección manual y scope geográfico activo.
 *
 *   selección → "Acciones sobre X seleccionados"
 *   all        → "Acciones sobre X POIs"
 *   debt       → "Acciones sobre X POIs con deuda"
 *   unenriched → "Acciones sobre X POIs sin enriquecer"
 *
 * Con `scopeLabel` se sufija " en {scopeLabel}".
 */
export type FooterMode = 'all' | 'debt' | 'unenriched' | 'user-action';

export interface BuildFooterLabelParams {
  mode: FooterMode;
  count: number;
  hasUserSelection: boolean;
  scopeLabel?: string | null;
}

const COUNT_FORMATTER = new Intl.NumberFormat('es-ES');

export function buildFooterLabel({
  mode,
  count,
  hasUserSelection,
  scopeLabel,
}: BuildFooterLabelParams): string {
  const n = COUNT_FORMATTER.format(count);
  const scope = scopeLabel ? ` en ${scopeLabel}` : '';

  if (hasUserSelection) {
    return `Acciones sobre ${n} seleccionados${scope}`;
  }
  switch (mode) {
    case 'debt':
      return `Acciones sobre ${n} POIs con deuda${scope}`;
    case 'unenriched':
      return `Acciones sobre ${n} POIs sin enriquecer${scope}`;
    case 'user-action':
      return `${n} POIs requieren tu revisión${scope}`;
    case 'all':
    default:
      return `Acciones sobre ${n} POIs${scope}`;
  }
}

/**
 * Label para `ExportPanelSource.label` derivado del contexto.
 *
 *   selección → "Selección actual"
 *   all + scope → "Explorar · {scope}" / "Explorar"
 *   debt + scope → "Con deuda · {scope}" / "Con deuda"
 *   unenriched + scope → "Sin enriquecer · {scope}" / "Sin enriquecer"
 */
export function buildExportLabel({
  mode,
  hasUserSelection,
  scopeLabel,
}: Omit<BuildFooterLabelParams, 'count'>): string {
  if (hasUserSelection) return 'Selección actual';
  const base =
    mode === 'debt'
      ? 'Con deuda'
      : mode === 'unenriched'
        ? 'Sin enriquecer'
        : mode === 'user-action'
          ? 'Requieren revisión'
          : 'Explorar';
  return scopeLabel ? `${base} · ${scopeLabel}` : base;
}
