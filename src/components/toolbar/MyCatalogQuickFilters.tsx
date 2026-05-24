/**
 * MyCatalogQuickFilters — popover anclado al contador verde de "mis POI".
 *
 * Combina los dos ejes canónicos (`visualState` + `healthFilter`) SIEMPRE
 * restringidos a `ownershipFilter='mine'`.
 *
 * Contrato de interacción del selector (sistémico, NO por valor):
 *   - Toda fila visible es 100% interactiva o 100% disabled. No existe
 *     estado intermedio "activa pero ignora click".
 *   - Click sobre fila interactiva SIEMPRE:
 *       1. cierra el popover,
 *       2. emite `lovable:my-catalog-popover-applied` con un opId único,
 *       3. produce traza observable (Camera QA / heavy-ops).
 *   - Re-click sobre la fila ya activa = reafirmación de intención
 *     (replay del fit/refocus). Nunca silent noop.
 *   - `setFilters` solo se invoca cuando la selección cambia realmente;
 *     el replay del recenter NO necesita mutar el store.
 *
 * Ver ADR-0004, docs/contracts/subset-fit-contract.md.
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
  MY_CATALOG_POPOVER_EMPTY_EVENT,
  type MyCatalogPopoverAppliedDetail,
  type MyCatalogPopoverEmptyDetail,
} from '@/components/toolbar/use-my-catalog-popover-fit';
import { traceCameraFit } from '@/components/debug/camera-fit-trace';
import { startOperation } from '@/shared/operations/heavy-operations-store';
import {
  runSelectable,
  resolveSelectableState,
} from '@/shared/interaction/selectable-kernel';
import type { VisualStateFilter, HealthFilter, OwnershipFilter } from '@/types/location';

interface RowProps {
  label: string;
  count: number;
  dotClass: string;
  active: boolean;
  empty?: boolean;
  onClick: () => void;
  testId?: string;
}

function Row({ label, count, dotClass, active, empty, onClick, testId }: RowProps) {
  // Selectable contract: count===0 && !active ⇒ truly disabled (no false
  // affordance). Active rows stay interactive even when count==0 because
  // the user must be able to clear / replay the empty state.
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
      onClick={(e) => {
        if (disabled) return;
        // Contract: never silent noop. Always invoke the handler. The
        // handler decides whether to recenter or activate, but it ALWAYS
        // emits an observable interaction.
        traceCameraFit('MyCatalogQuickFilters.Row onClick', {
          label,
          active,
          defaultPrevented: e.defaultPrevented,
        });
        onClick();
      }}
      className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? empty
            ? 'bg-red-500/10 text-foreground ring-1 ring-red-500/40'
            : 'bg-emerald-500/10 text-foreground ring-1 ring-emerald-500/40'
          : disabled
            ? 'opacity-50 cursor-not-allowed text-foreground/60'
            : 'hover:bg-muted text-foreground/90'
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="truncate">{label}</span>
      </span>
      {active && empty ? (
        <span className="text-[11px] font-medium text-red-500">Sin resultados</span>
      ) : (
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

interface MyCatalogQuickFiltersButtonProps {
  count: number;
  ownershipFilter: OwnershipFilter;
  formatCount: (n: number) => string;
}

/** Acción canónica de fila (axis + value opcional). */
type RowAction =
  | { axis: 'all' }
  | { axis: 'visual'; value: VisualStateFilter }
  | { axis: 'health'; value: HealthFilter };

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

  const ensureMine = React.useCallback(() => {
    if (ownershipFilter !== 'mine') setOwnershipFilter('mine');
  }, [ownershipFilter, setOwnershipFilter]);

  /**
   * Handler único para CUALQUIER fila del selector. No ramifica por axis
   * ni por value. Ejecuta el contrato de interacción al pie de la letra:
   *
   *   1. Cierra el popover (feedback inmediato).
   *   2. Calcula si la selección ya estaba activa (recenter) o cambia.
   *   3. Mutar `setFilters` SOLO cuando la selección cambia.
   *   4. Abre una heavy-op con opId UNIQUE (sin blockReentry → re-click
   *      legítimo nunca queda en silent noop).
   *   5. Emite el evento del popover con el mismo opId; el listener
   *      cerrará la op y disparará `requestSubsetFit`.
   */
  const applyRow = React.useCallback(
    (action: RowAction) => {
      const detailBase: MyCatalogPopoverAppliedDetail =
        action.axis === 'all'
          ? { axis: 'all', value: null }
          : action.axis === 'visual'
            ? { axis: 'visual', value: action.value }
            : { axis: 'health', value: action.value };

      traceCameraFit('MyCatalogQuickFilters.applyRow', detailBase);

      const cur = useLocationsStore.getState().filters;
      const wasActive =
        (action.axis === 'all' && !cur.visualState && !cur.healthFilter) ||
        (action.axis === 'visual' &&
          cur.visualState === action.value &&
          !cur.healthFilter) ||
        (action.axis === 'health' &&
          cur.healthFilter === action.value &&
          !cur.visualState);

      const sourcePrefix =
        action.axis === 'all'
          ? 'my-catalog-popover:all'
          : `my-catalog-popover:${action.axis}:${String(action.value)}`;

      // Selectable + Replayable kernel. `onAlways` runs the universal
      // contract (close + emit + heavy-op start). `onChange` only mutates
      // the filter store. `onReplay` is a no-op marker: the recenter is
      // produced downstream by the popover-fit listener consuming the
      // re-emitted event with a fresh opId.
      runSelectable({
        source: sourcePrefix,
        wasActive,
        onAlways: ({ opId }) => {
          // 1. Close popover unconditionally so the click is always observable
          //    even if downstream listeners skip side-effects (e.g. empty subset).
          setOpen(false);
          // 2. Heavy-op tied to THIS click's opId. blockReentry=false so a
          //    legitimate re-click is never converted into silent noop.
          startOperation({
            operationId: opId,
            label: 'Filtrando…',
            source: 'filter',
            indeterminate: true,
            blockReentry: false,
            safetyTimeoutMs: 10000,
            safetyMessage: 'Tiempo agotado aplicando filtro',
          });
          ensureMine();
          // 3. Emit the event carrying THIS opId so the listener closes the
          //    correct operation (avoids id mismatch on parallel clicks).
          emitMyCatalogPopoverApplied({ ...detailBase, opId });
          traceCameraFit('applyRow: emitMyCatalogPopoverApplied dispatched', {
            ...detailBase,
            opId,
            recenter: wasActive,
          });
        },
        onChange: () => {
          const next = { ...useLocationsStore.getState().filters };
          if (action.axis === 'all') {
            next.visualState = undefined;
            next.healthFilter = undefined;
          } else if (action.axis === 'visual') {
            next.visualState = action.value;
            next.healthFilter = undefined;
          } else {
            next.visualState = undefined;
            next.healthFilter = action.value;
          }
          setFilters(next);
        },
        // onReplay omitted on purpose: recenter happens server-side via the
        // popover-fit listener consuming the re-emitted event.
      });
    },
    [ensureMine, setFilters],
  );

  const isEmpty = (axis: 'visual' | 'health' | 'all', value: unknown): boolean =>
    emptyAxisValue === `${axis}:${String(value ?? 'all')}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        traceCameraFit('MyCatalogQuickFilters.Popover onOpenChange', {
          from: open,
          to: next,
        });
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          data-testid="my-poi-trigger"
          onClick={(e) => {
            traceCameraFit('MyCatalogQuickFilters.Trigger click', {
              currentlyOpen: open,
            });
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
            empty={isEmpty('all', null)}
            onClick={() => applyRow({ axis: 'all' })}
          />
          <Row
            testId="filter-enriched"
            label="Enriquecidos"
            count={counts.enriched}
            dotClass="bg-emerald-500"
            active={activeVisual === 'enriched'}
            empty={isEmpty('visual', 'enriched')}
            onClick={() => applyRow({ axis: 'visual', value: 'enriched' })}
          />
          <Row
            testId="filter-imported"
            label="Sin actualizar"
            count={counts.imported}
            dotClass="bg-muted-foreground/60"
            active={activeVisual === 'imported'}
            empty={isEmpty('visual', 'imported')}
            onClick={() => applyRow({ axis: 'visual', value: 'imported' })}
          />
          <Row
            testId="filter-empty"
            label="Vacíos"
            count={counts.empty}
            dotClass="bg-orange-500"
            active={activeVisual === 'empty'}
            empty={isEmpty('visual', 'empty')}
            onClick={() => applyRow({ axis: 'visual', value: 'empty' })}
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
            empty={isEmpty('health', 'partial')}
            onClick={() => applyRow({ axis: 'health', value: 'partial' })}
          />
          <Row
            testId="filter-health-chain"
            label="Reparar cadena"
            count={counts.chain}
            dotClass="bg-yellow-400"
            active={activeHealth === 'chain'}
            empty={isEmpty('health', 'chain')}
            onClick={() => applyRow({ axis: 'health', value: 'chain' })}
          />
          <Row
            testId="filter-health-review"
            label="Revisar"
            count={counts.review}
            dotClass="bg-fuchsia-500"
            active={activeHealth === 'review'}
            empty={isEmpty('health', 'review')}
            onClick={() => applyRow({ axis: 'health', value: 'review' })}
          />
          <Row
            testId="filter-health-hardError"
            label="Rotos / Reintentar"
            count={counts.hardError}
            dotClass="bg-red-500"
            active={activeHealth === 'hardError'}
            empty={isEmpty('health', 'hardError')}
            onClick={() => applyRow({ axis: 'health', value: 'hardError' })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
