/**
 * DebtSelectionStatusBar — barra mínima de estado de selección local.
 *
 * PR-INLINE-2 (plan: docs/audits/search-filter-inline-poi-actions-plan.md).
 *
 * RESTRICCIÓN DURA: sólo puede mostrar contador + "Limpiar selección".
 * Prohibido exportar / reparar / Geo Maintenance / "Más acciones" / cualquier
 * CTA de lote. Eso queda para PR-INLINE-3.
 */
import * as React from 'react';
import { useDebtSelection } from '@/components/filters/DebtSelectionContext';

export function DebtSelectionStatusBar() {
  const sel = useDebtSelection();
  if (!sel || sel.size === 0) return null;
  return (
    <div
      className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-md bg-primary/10 text-primary"
      data-debt-selection-bar="1"
      data-debt-selection-count={sel.size}
    >
      <span className="font-medium tabular-nums">
        {sel.size} seleccionado{sel.size === 1 ? '' : 's'}
      </span>
      <button
        type="button"
        onClick={sel.clear}
        className="text-xs hover:underline text-primary/80"
        data-debt-selection-clear="1"
      >
        Limpiar selección
      </button>
    </div>
  );
}
