/**
 * MyCatalogQuickFilters — popover anclado al contador verde de "mis POI"
 * que combina los dos ejes canónicos (`visualState` + `healthFilter`)
 * SIEMPRE restringidos a `ownershipFilter='mine'`.
 *
 * Contrato:
 *  - Cualquier item fuerza `ownershipFilter='mine'`.
 *  - "Ver todos" = mine + visualState=undefined + healthFilter=undefined.
 *  - Desde el popover: un eje cada vez (limpia el contrario).
 *  - Si vienen ambos ejes activos desde FilterBar, se reflejan ambos.
 *  - Re-toggle del item activo → vuelve a "Ver todos".
 *
 * Counts del subset "míos" vía `getMyCatalogQuickCounts`. El número del
 * botón verde sigue siendo `myCatalog` total (no se toca aquí).
 */
import React from 'react';
import {
  PopoverContent,
} from '@/components/ui/popover';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { useAuth } from '@/domains/identity';
import { getMyCatalogQuickCounts } from '@/domains/content/lib/my-catalog-quick-counts';
import type { VisualStateFilter, HealthFilter } from '@/types/location';

type VisualKey = VisualStateFilter;
type HealthKey = HealthFilter;

interface RowProps {
  label: string;
  count: number;
  dotClass: string;
  active: boolean;
  onClick: () => void;
}

function Row({ label, count, dotClass, active, onClick }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? 'bg-emerald-500/10 text-foreground ring-1 ring-emerald-500/40'
          : 'hover:bg-muted text-foreground/90'
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

export function MyCatalogQuickFiltersContent() {
  const filters = useLocationsStore((s) => s.filters);
  const setFilters = useLocationsStore((s) => s.setFilters);
  const getAllLocations = useLocationsStore((s) => s.getAllLocations);
  const { user } = useAuth();

  const counts = React.useMemo(
    () => getMyCatalogQuickCounts(getAllLocations() as any, user?.id),
    // Re-evalúa cuando cambia el universo o el user; getAllLocations es estable
    // pero el store dispara re-render por sus selectores externos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getAllLocations, user?.id, filters],
  );

  const activeVisual = filters.visualState;
  const activeHealth = filters.healthFilter;

  const applyAll = () => {
    setFilters({
      ...filters,
      ownershipFilter: 'mine',
      visualState: undefined,
      healthFilter: undefined,
    });
  };

  const applyVisual = (v: VisualKey) => {
    if (activeVisual === v && !activeHealth) {
      // re-toggle del único activo → Ver todos
      applyAll();
      return;
    }
    setFilters({
      ...filters,
      ownershipFilter: 'mine',
      visualState: v,
      healthFilter: undefined,
    });
  };

  const applyHealth = (h: HealthKey) => {
    if (activeHealth === h && !activeVisual) {
      applyAll();
      return;
    }
    setFilters({
      ...filters,
      ownershipFilter: 'mine',
      visualState: undefined,
      healthFilter: h,
    });
  };

  const noneActive = !activeVisual && !activeHealth;

  return (
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-64 p-2 z-[1100]"
    >
      <div className="px-2 pt-1 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
        Estado del punto
      </div>
      <div className="flex flex-col gap-0.5">
        <Row
          label="Ver todos"
          count={counts.all}
          dotClass="bg-emerald-500"
          active={noneActive}
          onClick={applyAll}
        />
        <Row
          label="Enriquecidos"
          count={counts.enriched}
          dotClass="bg-emerald-500"
          active={activeVisual === 'enriched'}
          onClick={() => applyVisual('enriched')}
        />
        <Row
          label="Sin actualizar"
          count={counts.imported}
          dotClass="bg-muted-foreground/60"
          active={activeVisual === 'imported'}
          onClick={() => applyVisual('imported')}
        />
        <Row
          label="Vacíos"
          count={counts.empty}
          dotClass="bg-orange-500"
          active={activeVisual === 'empty'}
          onClick={() => applyVisual('empty')}
        />
      </div>

      <div className="my-1.5 h-px bg-border/60" />

      <div className="px-2 pt-1 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
        Salud operativa
      </div>
      <div className="flex flex-col gap-0.5">
        <Row
          label="Rellenar huecos"
          count={counts.partial}
          dotClass="bg-amber-500"
          active={activeHealth === 'partial'}
          onClick={() => applyHealth('partial')}
        />
        <Row
          label="Reparar cadena"
          count={counts.chain}
          dotClass="bg-yellow-400"
          active={activeHealth === 'chain'}
          onClick={() => applyHealth('chain')}
        />
        <Row
          label="Revisar"
          count={counts.review}
          dotClass="bg-fuchsia-500"
          active={activeHealth === 'review'}
          onClick={() => applyHealth('review')}
        />
        <Row
          label="Rotos / Reintentar"
          count={counts.hardError}
          dotClass="bg-red-500"
          active={activeHealth === 'hardError'}
          onClick={() => applyHealth('hardError')}
        />
      </div>
    </PopoverContent>
  );
}
