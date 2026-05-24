/**
 * TreePoiRow — Fila POI inline para árboles de Buscar y Filtrar.
 *
 * PR-INLINE-1 (plan: docs/audits/search-filter-inline-poi-actions-plan.md).
 *
 * Renderiza una fila compacta para un POI dentro de un nodo hoja del árbol.
 * Helper central (regla multiusuario: nada de parches por árbol).
 *
 * Garantías DURAS:
 *  - Click en la fila → `setFocusedLocation(id)` + `requestSubsetFit([id])`.
 *  - Botones internos llaman `stopPropagation()` para no disparar el click
 *    de fila.
 *  - NO ejecuta RPC ni edge functions.
 *  - NO escribe en BD.
 *  - NO contiene checkboxes ni acciones de selección (fuera de alcance
 *    PR-INLINE-1; ver plan).
 */
import * as React from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GeoLocation } from '@/types/location';
import { classifyPoiRootStatusForLocation } from '@/domains/content/lib/poi-identity-root-status-client';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';
import { getHierarchyBreadcrumb } from '@/shared/geography/hierarchy';
import { requestSubsetFit } from '@/components/map/subset-fit';
import { useLocationsStore } from '@/domains/content';
import { Checkbox } from '@/components/ui/checkbox';
import { useDebtSelection } from '@/components/filters/DebtSelectionContext';

const ROOT_STATUS_CLASS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: 'bg-slate-200 text-slate-700',
  B: 'bg-amber-100 text-amber-700',
  C: 'bg-blue-100 text-blue-700',
  D: 'bg-emerald-100 text-emerald-700',
};

const RING_LABEL: Record<string, string> = {
  partial: 'partial',
  chain: 'chain',
  review: 'review',
  hardError: 'error',
};

export interface TreePoiRowProps {
  loc: GeoLocation;
  /** Sangría visual (px) heredada del nodo padre. */
  indentPx?: number;
}

export function TreePoiRow({ loc, indentPx = 24 }: TreePoiRowProps) {
  const { rootStatus } = React.useMemo(
    () => classifyPoiRootStatusForLocation(loc),
    [loc],
  );
  const rings = React.useMemo(() => getPointHealthRings(loc), [loc]);
  const breadcrumb = React.useMemo(() => getHierarchyBreadcrumb(loc), [loc]);
  const sel = useDebtSelection();
  const isSelected = sel?.isSelected(loc.id) ?? false;

  const handleRowClick = React.useCallback(() => {
    useLocationsStore.getState().setFocusedLocation(loc.id);
    requestSubsetFit([loc.id], {
      mode: 'always',
      reason: 'tree-row-focus',
    });
  }, [loc.id]);

  const handleMapClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      requestSubsetFit([loc.id], {
        mode: 'always',
        reason: 'tree-row-map-button',
      });
    },
    [loc.id],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
      className="flex items-center gap-1.5 py-1 pr-2 rounded-md cursor-pointer hover:bg-muted/60 transition-colors w-full min-w-0 max-w-full box-border overflow-hidden text-left"
      style={{ paddingLeft: `${indentPx}px` }}
      data-tree-poi-row="1"
      data-tree-poi-id={loc.id}
      data-tree-poi-root-status={rootStatus}
      data-tree-poi-selected={isSelected ? '1' : '0'}
    >
      {sel && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => sel.toggle(loc.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 shrink-0"
          aria-label={`Seleccionar ${loc.name || 'POI'}`}
          data-tree-poi-checkbox="1"
        />
      )}
      <span
        className={cn(
          'inline-flex items-center justify-center text-[9px] font-bold rounded px-1 min-w-[14px] h-[14px] shrink-0',
          ROOT_STATUS_CLASS[rootStatus],
        )}
        title={`Root status ${rootStatus}`}
      >
        {rootStatus}
      </span>
      {rings.length > 0 && (
        <span
          className="text-[9px] uppercase tracking-wide text-muted-foreground/80 shrink-0"
          title={`Deuda: ${rings.join(', ')}`}
        >
          {RING_LABEL[rings[0]] ?? rings[0]}
        </span>
      )}
      <span
        className="block truncate min-w-0 flex-1 text-[11px]"
        title={loc.name || '(sin nombre)'}
      >
        {loc.name || '(sin nombre)'}
      </span>
      {breadcrumb && (
        <span
          className="hidden md:inline truncate text-[10px] text-muted-foreground/70 max-w-[40%]"
          title={breadcrumb}
        >
          {breadcrumb}
        </span>
      )}
      <button
        type="button"
        onClick={handleMapClick}
        className="p-0.5 rounded hover:bg-muted shrink-0"
        data-tree-poi-action="map"
        aria-label="Centrar mapa en este POI"
        title="Centrar mapa en este POI"
      >
        <MapPin className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  );
}
