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
import {
  emitMyCatalogPopoverApplied,
  buildMyCatalogPopoverOpId,
  MY_CATALOG_POPOVER_EMPTY_EVENT,
  type MyCatalogPopoverEmptyDetail,
} from '@/components/toolbar/use-my-catalog-popover-fit';
import { startOperation } from '@/shared/operations/heavy-operations-store';
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

  // Empty-result feedback for the active row, reset whenever selection
  // changes. Driven by `MY_CATALOG_POPOVER_EMPTY_EVENT`.
  const [emptyAxisValue, setEmptyAxisValue] = React.useState<string | null>(null);
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MyCatalogPopoverEmptyDetail>).detail;
      if (!detail) return;
      setEmptyAxisValue(`${detail.axis}:${String(detail.value ?? 'all')}`);
    };
    window.addEventListener(MY_CATALOG_POPOVER_EMPTY_EVENT, handler);
    return () => window.removeEventListener(MY_CATALOG_POPOVER_EMPTY_EVENT, handler);
  }, []);
  React.useEffect(() => {
    setEmptyAxisValue(null);
  }, [activeVisual, activeHealth]);

  // Restringir a 'mine' va SIEMPRE por useLayerVisibility (traduce a
  // filterByUserId, que es lo que el matcher consume). Los ejes propios
  // del popover (visualState, healthFilter) van por setFilters.
  const ensureMine = () => {
    if (ownershipFilter !== 'mine') setOwnershipFilter('mine');
  };

  /**
   * Start a heavy-op BEFORE setFilters so the bottom badge appears in the
   * next React frame. blockReentry guards against double clicks on the
   * same axis/value while the previous op is still pending.
   */
  const beginOp = (
    axis: 'visual' | 'health' | 'all',
    value: VisualStateFilter | HealthFilter | null,
  ): boolean => {
    const opId = buildMyCatalogPopoverOpId({ axis, value });
    return startOperation({
      operationId: opId,
      label: 'Filtrando…',
      source: 'filter',
      indeterminate: true,
      blockReentry: true,
      // Safety watchdog: si el evento applied no llega o falla el listener,
      // la op no se queda colgada. 10s es holgado para un filtro local.
      safetyTimeoutMs: 10000,
      safetyMessage: 'Tiempo agotado aplicando filtro',
    });
  };

  const applyAll = () => {
    if (!beginOp('all', null)) return;
    ensureMine();
    setFilters({
      ...useLocationsStore.getState().filters,
      visualState: undefined,
      healthFilter: undefined,
    });
    emitMyCatalogPopoverApplied({ axis: 'all', value: null });
  };

  const applyVisual = (v: VisualStateFilter) => {
    if (activeVisual === v && !activeHealth) {
      applyAll();
      return;
    }
    if (!beginOp('visual', v)) return;
    ensureMine();
    setFilters({
      ...useLocationsStore.getState().filters,
      visualState: v,
      healthFilter: undefined,
    });
    emitMyCatalogPopoverApplied({ axis: 'visual', value: v });
  };

  const applyHealth = (h: HealthFilter) => {
    if (activeHealth === h && !activeVisual) {
      applyAll();
      setOpen(false);
      return;
    }
    if (!beginOp('health', h)) return;
    ensureMine();
    setFilters({
      ...useLocationsStore.getState().filters,
      visualState: undefined,
      healthFilter: h,
    });
    emitMyCatalogPopoverApplied({ axis: 'health', value: h });
    setOpen(false);
  };

  const isEmpty = (axis: 'visual' | 'health' | 'all', value: unknown): boolean =>
    emptyAxisValue === `${axis}:${String(value ?? 'all')}`;

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
