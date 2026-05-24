/**
 * DebtSelectionContext — Selección LOCAL del panel "Mantener → Con deuda".
 *
 * PR-INLINE-2 (plan: docs/audits/search-filter-inline-poi-actions-plan.md).
 *
 * Garantías DURAS:
 *  - Estado interno aislado. NO toca `selectedLocations` del store global.
 *  - Sólo activo en `universeCtx.mode === 'debt'`. Fuera de ese modo se vacía.
 *  - Al cambiar el universo visible (rootStatusFilter / treeSelection /
 *    universeBase), la selección se INTERSECTA con los ids aún visibles.
 *  - Cero RPC, cero edge functions, cero escrituras.
 *  - Si no hay provider, `useDebtSelection()` devuelve `null` → los
 *    consumidores caen al comportamiento legacy.
 */
import * as React from 'react';
import { useUniverseBase } from '@/components/filters/UniverseBaseContext';

export interface DebtSelectionApi {
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectMany: (ids: string[]) => void;
  deselectMany: (ids: string[]) => void;
  groupState: (ids: string[]) => 'none' | 'partial' | 'all';
  toggleGroup: (ids: string[]) => void;
  clear: () => void;
  size: number;
  selectedIds: ReadonlyArray<string>;
}

const Ctx = React.createContext<DebtSelectionApi | null>(null);

export function DebtSelectionProvider({ children }: { children: React.ReactNode }) {
  const universeCtx = useUniverseBase();
  const mode = universeCtx?.mode;
  const universeBaseIds = universeCtx?.universeBaseIds;

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Limpieza al salir de modo `debt`.
  React.useEffect(() => {
    if (mode !== 'debt' && selected.size > 0) {
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Intersección con universo visible. Cualquier cambio en universeBaseIds
  // (porque rootStatusFilter / treeSelection / universeBase mutaron) recorta
  // la selección a lo que sigue visible.
  React.useEffect(() => {
    if (!universeBaseIds || selected.size === 0) return;
    let changed = false;
    const next = new Set<string>();
    for (const id of selected) {
      if (universeBaseIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeBaseIds]);

  const api = React.useMemo<DebtSelectionApi>(() => {
    return {
      isSelected: (id: string) => selected.has(id),
      toggle: (id: string) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      selectMany: (ids: string[]) =>
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.add(id);
          return next;
        }),
      deselectMany: (ids: string[]) =>
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        }),
      groupState: (ids: string[]) => {
        if (ids.length === 0) return 'none';
        let count = 0;
        for (const id of ids) if (selected.has(id)) count++;
        if (count === 0) return 'none';
        if (count === ids.length) return 'all';
        return 'partial';
      },
      toggleGroup: (ids: string[]) => {
        if (ids.length === 0) return;
        setSelected((prev) => {
          let allIn = true;
          for (const id of ids) {
            if (!prev.has(id)) {
              allIn = false;
              break;
            }
          }
          const next = new Set(prev);
          if (allIn) {
            for (const id of ids) next.delete(id);
          } else {
            for (const id of ids) next.add(id);
          }
          return next;
        });
      },
      clear: () => setSelected(new Set()),
      size: selected.size,
      selectedIds: Array.from(selected),
    };
  }, [selected]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * Devuelve la API de selección local del panel debt si hay provider activo,
 * o `null` (consumidores deben asumir "selección inline no disponible").
 */
export function useDebtSelection(): DebtSelectionApi | null {
  return React.useContext(Ctx);
}
