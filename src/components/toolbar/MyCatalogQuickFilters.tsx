/**
 * MyCatalogQuickFilters — popover anclado al contador verde de "mis POI".
 *
 * Combina los dos ejes canónicos (`visualState` + `healthFilter`) SIEMPRE
 * restringidos a `ownershipFilter='mine'`.
 *
 * Reglas de cierre del popover:
 *  - healthFilter → cierra (subset-fit dispara movimiento de cámara).
 *  - visualState  → permanece abierto (no mueve cámara).
 *  - "Ver todos"  → permanece abierto.
 *  - Click fuera / Escape → cierra (Radix por defecto).
 */
import React from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { useAuth } from '@/domains/identity';
import { useLayerVisibility } from '@/hooks/use-layer-visibility';
import { getMyCatalogQuickCounts } from '@/domains/content/lib/my-catalog-quick-counts';
import type { VisualStateFilter, HealthFilter, OwnershipFilter } from '@/types/location';

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

interface MyCatalogQuickFiltersButtonProps {
  count: number;
  ownershipFilter: OwnershipFilter;
  formatCount: (n: number) => string;
}

export function MyCatalogQuickFiltersButton({
  count,
  ownershipFilter,
  formatCount,
}: MyCatalogQuickFiltersButtonProps) {
  const [open, setOpen] = React.useState(false);
  const filters = useLocationsStore((s) => s.filters);
  const setFilters = useLocationsStore((s) => s.setFilters);
  const getAllLocations = useLocationsStore((s) => s.getAllLocations);
  const { user } = useAuth();
  const { setOwnershipFilter } = useLayerVisibility();

  const counts = React.useMemo(
    () => getMyCatalogQuickCounts(getAllLocations() as any, user?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getAllLocations, user?.id, filters],
  );

  const activeVisual = filters.visualState;
  const activeHealth = filters.healthFilter;
  const noneActive = !activeVisual && !activeHealth;
  const hasSubFilter = !!(activeVisual || activeHealth);

  // Restringir a 'mine' va SIEMPRE por useLayerVisibility (traduce a
  // filterByUserId, que es lo que el matcher consume). Los ejes propios
  // del popover (visualState, healthFilter) van por setFilters.
  const ensureMine = () => {
    if (ownershipFilter !== 'mine') setOwnershipFilter('mine');
  };

  const applyAll = () => {
    ensureMine();
    setFilters({
      ...useLocationsStore.getState().filters,
      visualState: undefined,
      healthFilter: undefined,
    });
    // Permanece abierto.
  };

  const applyVisual = (v: VisualStateFilter) => {
    if (activeVisual === v && !activeHealth) {
      applyAll();
      return;
    }
    ensureMine();
    setFilters({
      ...useLocationsStore.getState().filters,
      visualState: v,
      healthFilter: undefined,
    });
    // Permanece abierto: visualState NO mueve cámara.
  };

  const applyHealth = (h: HealthFilter) => {
    if (activeHealth === h && !activeVisual) {
      // Re-toggle del único activo → Ver todos. Cerramos porque el
      // cambio de healthFilter (h → undefined) dispara fit-reset.
      applyAll();
      setOpen(false);
      return;
    }
    ensureMine();
    setFilters({
      ...useLocationsStore.getState().filters,
      visualState: undefined,
      healthFilter: h,
    });
    // Cierra: subset-fit moverá cámara y el popover taparía el resultado.
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center gap-1.5 transition-all cursor-pointer rounded-full px-1 py-0.5 ${
            ownershipFilter === 'mine' ? 'text-emerald-400' : 'text-emerald-500 hover:text-emerald-400'
          } ${hasSubFilter ? 'ring-2 ring-emerald-500/40' : ''}`}
          title="Mis puntos en Catálogo — filtros rápidos"
        >
          <span className="text-base font-semibold tabular-nums leading-none">{formatCount(count)}</span>
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-64 p-2 z-[1100]">
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
    </Popover>
  );
}
