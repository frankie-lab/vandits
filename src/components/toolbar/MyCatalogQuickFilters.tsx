/**
 * MyCatalogQuickFilters — popover anclado al contador verde de "mis POI".
 *
 * Contrato vigente:
 *   - Siempre trabaja sobre `ownershipFilter='mine'`.
 *   - `visualState` y `Ver todos` filtran sin mover cámara y dejan el popover abierto.
 *   - `healthFilter` filtra y cierra el popover; el subset-fit lo resuelve el flujo
 *     ya existente que escucha `filters.healthFilter`.
 *   - Re-click sobre la fila activa vuelve a `Ver todos`.
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
import { resolveSelectableState } from '@/shared/interaction/selectable-kernel';
import type { VisualStateFilter, HealthFilter, OwnershipFilter } from '@/types/location';

interface RowProps {
  label: string;
  count: number;
  dotClass: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}

function Row({ label, count, dotClass, active, onClick, testId }: RowProps) {
  const state = resolveSelectableState({ active, count });
  const disabled = state === 'disabled';

  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      data-state={state}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? 'bg-emerald-500/10 text-foreground ring-1 ring-emerald-500/40'
          : disabled
            ? 'opacity-50 cursor-not-allowed text-foreground/60'
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

  const ensureMine = React.useCallback(() => {
    if (ownershipFilter !== 'mine') setOwnershipFilter('mine');
  }, [ownershipFilter, setOwnershipFilter]);

  const applySelection = React.useCallback(
    (
      nextVisual: VisualStateFilter | undefined,
      nextHealth: HealthFilter | undefined,
      shouldClose: boolean,
    ) => {
      ensureMine();
      const current = useLocationsStore.getState().filters;
      setFilters({
        ...current,
        ownershipFilter: 'mine',
        visualState: nextVisual,
        healthFilter: nextHealth,
      });
      if (shouldClose) setOpen(false);
    },
    [ensureMine, setFilters],
  );

  const applyAll = React.useCallback(() => {
    applySelection(undefined, undefined, false);
  }, [applySelection]);

  const applyVisual = React.useCallback(
    (value: VisualStateFilter) => {
      const current = useLocationsStore.getState().filters;
      const nextVisual = current.visualState === value && !current.healthFilter ? undefined : value;
      applySelection(nextVisual, undefined, false);
    },
    [applySelection],
  );

  const applyHealth = React.useCallback(
    (value: HealthFilter) => {
      const current = useLocationsStore.getState().filters;
      const nextHealth = current.healthFilter === value && !current.visualState ? undefined : value;
      applySelection(undefined, nextHealth, true);
    },
    [applySelection],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="my-poi-trigger"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={`flex items-center gap-1.5 transition-all cursor-pointer rounded-full px-1 py-0.5 ${
            ownershipFilter === 'mine' ? 'text-emerald-400' : 'text-emerald-500 hover:text-emerald-400'
          } ${hasSubFilter ? 'ring-2 ring-emerald-500/40' : ''}`}
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
            testId="filter-all"
            label="Ver todos"
            count={counts.all}
            dotClass="bg-emerald-500"
            active={noneActive}
            onClick={applyAll}
          />
          <Row
            testId="filter-enriched"
            label="Enriquecidos"
            count={counts.enriched}
            dotClass="bg-emerald-500"
            active={activeVisual === 'enriched'}
            onClick={() => applyVisual('enriched')}
          />
          <Row
            testId="filter-imported"
            label="Sin actualizar"
            count={counts.imported}
            dotClass="bg-muted-foreground/60"
            active={activeVisual === 'imported'}
            onClick={() => applyVisual('imported')}
          />
          <Row
            testId="filter-empty"
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
            testId="filter-health-partial"
            label="Rellenar huecos"
            count={counts.partial}
            dotClass="bg-amber-500"
            active={activeHealth === 'partial'}
            onClick={() => applyHealth('partial')}
          />
          <Row
            testId="filter-health-chain"
            label="Reparar cadena"
            count={counts.chain}
            dotClass="bg-yellow-400"
            active={activeHealth === 'chain'}
            onClick={() => applyHealth('chain')}
          />
          <Row
            testId="filter-health-review"
            label="Revisar"
            count={counts.review}
            dotClass="bg-fuchsia-500"
            active={activeHealth === 'review'}
            onClick={() => applyHealth('review')}
          />
          <Row
            testId="filter-health-hardError"
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
