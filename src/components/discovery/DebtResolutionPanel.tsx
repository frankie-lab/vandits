/**
 * DebtResolutionPanel — Fase 1.
 *
 * Subvista lateral dentro de FilterBar (Buscar y Filtrar) que reemplaza al
 * modal central `HealthRepairPreviewDialog` como VISTA PRIMARIA para
 * "Resolver deuda" (universo `debt`).
 *
 * Plan UX: docs/audits/search-filter-debt-resolution-sidepanel-ux-plan.md
 *
 * Garantías DURAS Fase 1 (cubiertas por tests):
 *  - Abrir el subpanel NO ejecuta RPC ni invoca edge functions.
 *  - Abrir el subpanel NO mueve la cámara (sin `requestSubsetFit` al montar).
 *  - Sólo acciones explícitas (Mapa grupo / Mapa POI) llaman `requestSubsetFit`.
 *  - El subpanel NO escribe en BD. La única ruta de escritura es:
 *      Reparar grupo → abre `HealthRepairPreviewDialog` → usuario confirma
 *      → modal llama `enqueue_health_repair` (intacto).
 *  - "Abrir en Geo Maintenance" sólo aparece en grupo B y sólo si el usuario
 *    tiene AMBAS capabilities (`view_geo_maintenance` + `run_geo_backfill`).
 *    Click despacha el bridge existente; NO ejecuta backfill.
 *
 * Fuera de alcance Fase 1: selección múltiple, footer contextual, eliminación
 * del modal como fallback, cambios en `health-repair-partition` o capabilities.
 */
import * as React from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  MapPin,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import { Button } from '@/design-system/primitives/button';
import { Badge } from '@/design-system/primitives/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { GeoLocation } from '@/types/location';
import type { HealthScopeResult } from '@/domains/discovery/lib/health-filter-scope';
import { getHierarchyBreadcrumb } from '@/shared/geography/hierarchy';
import { requestSubsetFit } from '@/components/map/subset-fit';
import { useCapability } from '@/domains/identity/hooks/use-permissions';
import {
  dispatchGeoMaintenanceHandoff,
  navigateToGeoMaintenance,
} from '@/shared/events/geo-maintenance-handoff';
import { useLocationsStore } from '@/domains/content';
import {
  partitionRepairScopeByRootStatus,
  type RepairPartition,
} from './health-repair-partition';

type DisplayGroupKey = Exclude<
  keyof RepairPartition,
  'repairableIds' | 'repairablePartialIds' | 'repairableChainIds' | 'total'
>;

const GROUP_META: Record<
  DisplayGroupKey,
  { title: string; help: string; rootBadge: string }
> = {
  repairable: {
    title: 'Reparables automáticamente',
    help: 'Identidad D + deuda partial/chain. Confirma la reparación masiva en el diálogo.',
    rootBadge: 'D',
  },
  systemDebt: {
    title: 'Deuda de sistema (B)',
    help: 'Falta canon/backfill del lado sistema. Envíalos a Mantenimiento Geográfico para previsualizar y confirmar.',
    rootBadge: 'B',
  },
  review: {
    title: 'Revisión (C)',
    help: 'Nombre/coords incoherente. Abre cada POI desde el mapa para resolverlo.',
    rootBadge: 'C',
  },
  identityIncomplete: {
    title: 'Incompleto real (A)',
    help: 'Falta identidad básica (nombre o coords). Completa identidad antes de cualquier reparación.',
    rootBadge: 'A',
  },
  nonRepairableByType: {
    title: 'No reparables por tipo',
    help: 'Identidad D pero deuda activa es hardError/review o sin rings — flujo per-POI.',
    rootBadge: 'D',
  },
};

const GROUP_ORDER: readonly DisplayGroupKey[] = [
  'repairable',
  'systemDebt',
  'review',
  'identityIncomplete',
  'nonRepairableByType',
];

function dispatchExport(locations: GeoLocation[], label: string): void {
  if (locations.length === 0) return;
  window.dispatchEvent(
    new CustomEvent('lovable:open-export-panel', {
      detail: { locations, label, scope: 'internal' as const },
    }),
  );
}

export interface DebtResolutionPanelProps {
  scope: HealthScopeResult;
  currentUserId?: string | null;
  onBack: () => void;
  /** Abre HealthRepairPreviewDialog (modal de confirmación de D repair). */
  onOpenRepairConfirm: () => void;
}

export function DebtResolutionPanel({
  scope,
  onBack,
  onOpenRepairConfirm,
}: DebtResolutionPanelProps) {
  const partition = React.useMemo(
    () => partitionRepairScopeByRootStatus(scope.locations, 'debt'),
    [scope.locations],
  );

  const canViewGeoMaintenance = useCapability('view_geo_maintenance').allowed;
  const canRunGeoBackfill = useCapability('run_geo_backfill').allowed;
  const geoMaintenanceHandoffEnabled =
    canViewGeoMaintenance && canRunGeoBackfill;

  // Estado inicial expandido: sólo el primer grupo no vacío (preferentemente
  // Reparable). NO se ejecuta network ni camera-fit al montar (regla dura).
  const initialOpen = React.useMemo<Record<DisplayGroupKey, boolean>>(() => {
    const out: Record<DisplayGroupKey, boolean> = {
      repairable: false,
      systemDebt: false,
      review: false,
      identityIncomplete: false,
      nonRepairableByType: false,
    };
    for (const key of GROUP_ORDER) {
      if (partition[key].length > 0) {
        out[key] = true;
        break;
      }
    }
    return out;
  }, [partition]);

  const [openGroups, setOpenGroups] =
    React.useState<Record<DisplayGroupKey, boolean>>(initialOpen);

  React.useEffect(() => {
    setOpenGroups(initialOpen);
  }, [initialOpen]);

  const handleOpenGeoMaintenance = React.useCallback(
    (ids: string[], groupTitle: string) => {
      if (ids.length === 0) return;
      dispatchGeoMaintenanceHandoff({
        locationIds: ids,
        source: 'health-repair-triage',
        label: `Resolver deuda · ${groupTitle} · ${ids.length} ${
          ids.length === 1 ? 'punto' : 'puntos'
        }`,
      });
      navigateToGeoMaintenance();
    },
    [],
  );

  const repairableCount = partition.repairableIds.length;
  const aCount = partition.identityIncomplete.length;
  const bCount = partition.systemDebt.length;
  const cCount = partition.review.length;
  // D count = todo lo de identityIncomplete? no: D = repairable + nonRepairableByType
  const dCount = repairableCount + partition.nonRepairableByType.length;
  const nonRepairableCount = partition.nonRepairableByType.length;

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="debt-resolution-panel"
      data-debt-total={partition.total}
      data-debt-repairable-count={repairableCount}
      data-debt-a-count={aCount}
      data-debt-b-count={bCount}
      data-debt-c-count={cCount}
      data-debt-d-count={dCount}
      data-debt-non-repairable-count={nonRepairableCount}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1"
          onClick={onBack}
          data-testid="debt-resolution-back"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Volver
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Wrench className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">
            Resolver deuda
          </span>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {partition.total} {partition.total === 1 ? 'punto' : 'puntos'}
          </Badge>
        </div>
      </div>

      {/* Scope summary (read-only chips) */}
      <div
        className="flex flex-wrap items-center gap-1 px-1"
        data-testid="debt-resolution-scope-summary"
      >
        <Badge variant="outline" className="text-[10px] tabular-nums">
          Total: {partition.total}
        </Badge>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          Reparables: {repairableCount}
        </Badge>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          A: {aCount}
        </Badge>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          B: {bCount}
        </Badge>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          C: {cCount}
        </Badge>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          D: {dCount}
        </Badge>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          No reparables: {nonRepairableCount}
        </Badge>
      </div>

      {partition.total === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          No hay puntos con deuda en el subconjunto.
        </div>
      ) : (
        <div className="space-y-2">
          {GROUP_ORDER.map((key) => {
            const list = partition[key];
            if (list.length === 0) return null;
            const meta = GROUP_META[key];
            const isOpen = openGroups[key];
            const ids = list.map((l) => l.id);
            return (
              <Collapsible
                key={key}
                open={isOpen}
                onOpenChange={(o) =>
                  setOpenGroups((prev) => ({ ...prev, [key]: o }))
                }
                className="rounded-md border bg-muted/30"
                data-debt-group={key}
                data-debt-group-count={list.length}
              >
                <div className="px-2 py-1.5 border-b bg-muted/40 flex items-center justify-between gap-2">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-left flex-1 min-w-0"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="text-xs font-semibold truncate">
                        {meta.title}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] tabular-nums shrink-0"
                      >
                        {list.length}
                      </Badge>
                    </button>
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-1 shrink-0">
                    {key === 'repairable' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="h-7 px-2 text-[11px]"
                        onClick={onOpenRepairConfirm}
                        data-debt-group-action="repair-confirm"
                        title="Abrir diálogo de confirmación para reparar este grupo"
                      >
                        <Wrench className="w-3 h-3 mr-1" />
                        Reparar grupo
                      </Button>
                    )}
                    {key === 'systemDebt' &&
                      geoMaintenanceHandoffEnabled &&
                      ids.length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            handleOpenGeoMaintenance(ids, meta.title)
                          }
                          data-debt-group-action="geo-maintenance"
                          title="Abrir estos puntos en Mantenimiento Geográfico (allí se confirma antes de ejecutar)"
                        >
                          <Wrench className="w-3 h-3 mr-1" />
                          Geo Maintenance
                        </Button>
                      )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        dispatchExport(
                          list,
                          `Resolver deuda · ${meta.title}`,
                        )
                      }
                      data-debt-group-action="export"
                      title="Exportar este grupo"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Exportar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        requestSubsetFit(ids, {
                          mode: 'always',
                          reason: 'debt-sidepanel-group-fit',
                        })
                      }
                      data-debt-group-action="map"
                      title="Centrar mapa en este grupo"
                    >
                      <MapPin className="w-3 h-3 mr-1" />
                      Mapa
                    </Button>
                  </div>
                </div>
                <div className="px-2 py-1 text-[11px] text-muted-foreground leading-snug">
                  {meta.help}
                </div>
                <CollapsibleContent>
                  <ul className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                    {list.map((loc) => {
                      const breadcrumb = getHierarchyBreadcrumb(loc);
                      return (
                        <li
                          key={loc.id}
                          className="px-2 py-1.5 flex items-center gap-2"
                          data-debt-poi-id={loc.id}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">
                              {loc.name || '(sin nombre)'}
                            </div>
                            {breadcrumb && (
                              <div className="text-[10px] text-muted-foreground truncate">
                                {breadcrumb}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() =>
                                requestSubsetFit([loc.id], {
                                  mode: 'always',
                                  reason: 'debt-sidepanel-row-focus',
                                })
                              }
                              data-debt-row-action="map"
                              title="Centrar mapa en este POI"
                            >
                              <Crosshair className="w-3 h-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() =>
                                useLocationsStore
                                  .getState()
                                  .setFocusedLocation(loc.id)
                              }
                              data-debt-row-action="popup"
                              title="Abrir popup del POI"
                            >
                              <MessageSquare className="w-3 h-3" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
