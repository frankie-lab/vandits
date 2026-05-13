/**
 * HealthFilterActionCTA — CTA contextual del eje "Salud" en FilterBar.
 *
 * PR-3A: sólo abre HealthRepairPreviewDialog (read-only). Sin escritura.
 *
 * Reglas:
 *  - Sólo se renderiza si hay healthFilter activo.
 *  - Toggle "Sólo visibles" off por defecto. Se oculta si hay selección manual
 *    no vacía (la selección manda).
 *  - Subconjunto y modo se resuelven 100% por `getHealthFilterScopeIds`.
 *
 * Ver `mem://logic/discovery/health-filter-axis`.
 */
import * as React from 'react';
import { Wrench } from 'lucide-react';
import type { HealthFilter, GeoLocation } from '@/types/location';
import { Button } from '@/design-system/primitives/button';
import { useDiscoveryStore } from '@/domains/discovery';
import { useAuth } from '@/domains/identity';
import {
  getHealthFilterScopeIds,
  scopeModeLabel,
} from '@/domains/discovery/lib/health-filter-scope';
import { HealthRepairPreviewDialog } from './HealthRepairPreviewDialog';

const ACTION_LABEL: Record<HealthFilter, string> = {
  partial:   'Rellenar mis huecos',
  chain:     'Reparar mis cadenas',
  hardError: 'Reintentar',
  review:    'Abrir revisión',
};

const REPAIRABLE_FILTERS: ReadonlySet<HealthFilter> = new Set<HealthFilter>(['partial', 'chain']);

export interface HealthFilterActionCTAProps {
  healthFilter: HealthFilter | null | undefined;
  filteredLocations: GeoLocation[];
  selectedLocationIds: Set<string>;
}

export function HealthFilterActionCTA({
  healthFilter,
  filteredLocations,
  selectedLocationIds,
}: HealthFilterActionCTAProps) {
  const [onlyVisible, setOnlyVisible] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const visibleLocationIds = useDiscoveryStore((s) => s.visibleLocationIds);
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  // Cuando hay selección manual, "Sólo visibles" se oculta y la selección manda.
  const hasSelection = selectedLocationIds.size > 0;
  const effectiveOnlyVisible = hasSelection ? false : onlyVisible;

  const scope = React.useMemo(
    () =>
      getHealthFilterScopeIds({
        filteredLocations,
        selectedLocationIds,
        visibleLocationIds: visibleLocationIds as Set<string>,
        healthFilter: healthFilter ?? null,
        onlyVisible: effectiveOnlyVisible,
        currentUserId,
      }),
    [filteredLocations, selectedLocationIds, visibleLocationIds, healthFilter, effectiveOnlyVisible, currentUserId],
  );

  if (!healthFilter) return null;

  const isRepairable = REPAIRABLE_FILTERS.has(healthFilter);
  // Para partial/chain el CTA habla de reparables propios.
  // Para review/hardError el contador sigue siendo el universo (preview).
  const ctaCount = isRepairable ? scope.repairableCount : scope.total;
  const disabled = ctaCount === 0;
  const label = ACTION_LABEL[healthFilter];

  const tooltip = isRepairable && scope.total > 0 && scope.repairableCount === 0
    ? 'Estos puntos son de usuarios que sigues; no puedes repararlos'
    : `Modo: ${scopeModeLabel(scope.mode)}`;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-7 px-2 text-xs gap-1.5"
        title={tooltip}
      >
        <Wrench className="w-3 h-3" />
        {label} ({ctaCount})
      </Button>

      {!hasSelection && (
        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyVisible}
            onChange={(e) => setOnlyVisible(e.target.checked)}
            className="h-3 w-3 accent-primary"
          />
          Sólo visibles
        </label>
      )}

      <HealthRepairPreviewDialog
        open={open}
        onOpenChange={setOpen}
        filter={healthFilter}
        scope={scope}
        currentUserId={currentUserId}
      />
    </div>
  );
}
