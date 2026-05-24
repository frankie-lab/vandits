/**
 * HealthRepairPreviewDialog — Triage operativo por grupos.
 *
 * Plan: docs/audits/health-repair-triage-dialog-plan.md
 *
 * - Cada grupo (Reparable / Sistema B / Revisión C / Incompleto A /
 *   No reparable por tipo) recibe acciones reales: Exportar grupo + Abrir
 *   grupo en mapa. Cada POI: Abrir en mapa.
 * - La reparación automática (`enqueue_health_repair`) sigue limitada
 *   estrictamente a D ∩ {partial, chain} via `partitionRepairScopeByRootStatus`.
 *   A/B/C/no-reparables NUNCA entran en `_location_ids`.
 * - Exportar usa `lovable:open-export-panel` (scope `'internal'`).
 * - Abrir en mapa usa `requestSubsetFit` (ya canónico).
 * - No se añade botón "Geo Maintenance" en grupo B (acción futura, ver plan §3).
 *
 * Ver `mem://logic/discovery/health-filter-axis` y
 * `mem://logic/sharing/curated-only-rule`.
 */
import * as React from 'react';
import { ChevronDown, ChevronRight, Download, Loader2, MapPin, Wrench } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/primitives/dialog';
import { Button } from '@/design-system/primitives/button';
import { Badge } from '@/design-system/primitives/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';
import type { GeoLocation, HealthFilter } from '@/types/location';
import {
  type HealthScopeResult,
  scopeModeLabel,
} from '@/domains/discovery/lib/health-filter-scope';
import { getHierarchyBreadcrumb } from '@/shared/geography/hierarchy';
import { getPointHealthRings } from '@/domains/content/lib/point-health-rings';
import { requestSubsetFit } from '@/components/map/subset-fit';
import { useCapability } from '@/domains/identity/hooks/use-permissions';
import {
  dispatchGeoMaintenanceHandoff,
  navigateToGeoMaintenance,
} from '@/shared/events/geo-maintenance-handoff';
import {
  partitionRepairScopeByRootStatus,
  type RepairPartition,
  type RepairFilterMode,
  type RepairGroupKey,
} from './health-repair-partition';

const FILTER_TITLES: Record<RepairFilterMode, string> = {
  partial:   'Rellenar huecos',
  chain:     'Reparar cadenas',
  hardError: 'Reintentar',
  review:    'Revisar manualmente',
  debt:      'Resolver deuda',
};

const FILTER_CSS_VAR: Record<RepairFilterMode, string> = {
  partial:   '--poi-health-partial',
  chain:     '--poi-health-chain',
  hardError: '--poi-health-hard-error',
  review:    '--poi-health-review',
  debt:      '--poi-health-partial',
};

/**
 * Filtros que pueden disparar escritura en BD. En modo agregado `'debt'`
 * el partitioner ya intersecta D con rings reales partial/chain.
 */
const REPAIRABLE: ReadonlySet<RepairFilterMode> = new Set<RepairFilterMode>([
  'partial',
  'chain',
  'debt',
]);

type DisplayGroupKey = Exclude<
  keyof RepairPartition,
  'repairableIds' | 'repairablePartialIds' | 'repairableChainIds' | 'total'
>;

const GROUP_META: Record<
  DisplayGroupKey,
  { title: string; help: string; recommendation: string; rootBadge: string }
> = {
  repairable: {
    title: 'Reparables automáticamente',
    help: 'Identidad D + deuda partial/chain. Se encolan en reparación masiva.',
    recommendation: 'Reparación automática',
    rootBadge: 'D',
  },
  identityIncomplete: {
    title: 'Incompleto real (A)',
    help: 'Falta identidad básica (nombre o coords). Completa identidad antes de cualquier reparación.',
    recommendation: 'Completar identidad por POI',
    rootBadge: 'A',
  },
  systemDebt: {
    title: 'Deuda de sistema (B)',
    help: 'Falta canon/backfill del lado sistema. Acción masiva canónica llegará en un PR futuro.',
    recommendation: 'Backfill (futuro)',
    rootBadge: 'B',
  },
  review: {
    title: 'Revisión (C)',
    help: 'Nombre/coords incoherente. Abre cada POI desde el mapa para resolverlo.',
    recommendation: 'Revisar por POI',
    rootBadge: 'C',
  },
  nonRepairableByType: {
    title: 'No reparables por tipo',
    help: 'Identidad D pero deuda activa es hardError/review o sin rings — flujo per-POI.',
    recommendation: 'Resolver por POI',
    rootBadge: 'D',
  },
};

const GROUP_ORDER: readonly DisplayGroupKey[] = [
  'repairable',
  'identityIncomplete',
  'systemDebt',
  'review',
  'nonRepairableByType',
];

export interface HealthRepairPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: RepairFilterMode;
  scope: HealthScopeResult;
  currentUserId?: string | null;
}

function dispatchExport(locations: GeoLocation[], label: string) {
  if (locations.length === 0) return;
  window.dispatchEvent(
    new CustomEvent('lovable:open-export-panel', {
      detail: { locations, label, scope: 'internal' as const },
    }),
  );
}

function fitToIds(ids: string[], reason: string) {
  if (ids.length === 0) return;
  requestSubsetFit(ids, { mode: 'always', reason });
}

function ringChips(loc: GeoLocation): string[] {
  try {
    return getPointHealthRings(loc) ?? [];
  } catch {
    return [];
  }
}

export function HealthRepairPreviewDialog({
  open,
  onOpenChange,
  filter,
  scope,
}: HealthRepairPreviewDialogProps) {
  const partition = React.useMemo(
    () => partitionRepairScopeByRootStatus(scope.locations, filter),
    [scope.locations, filter],
  );

  const isRepairableFilter = REPAIRABLE.has(filter);
  const repairableCount = partition.repairableIds.length;

  const [submitting, setSubmitting] = React.useState(false);
  const [exhausted, setExhausted] = React.useState(false);

  const canConfirm =
    isRepairableFilter && repairableCount > 0 && !submitting && !exhausted;

  React.useEffect(() => {
    setExhausted(false);
  }, [filter, scope.mode, scope.total]);

  // Auto-focus mapa al subconjunto del preview al abrir.
  const idsKey = scope.ids.join('|');
  React.useEffect(() => {
    if (!open) return;
    if (scope.ids.length === 0) return;
    requestSubsetFit(scope.ids, {
      mode: 'if-outside',
      reason: 'repair-preview',
      minZoom: 7,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey]);

  // Estado de expansión por grupo. Reparable abierto si N>0; resto cerrado.
  const initialOpen = React.useMemo<Record<DisplayGroupKey, boolean>>(() => {
    return {
      repairable: partition.repairable.length > 0,
      identityIncomplete: false,
      systemDebt: false,
      review: false,
      nonRepairableByType: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partition.repairable.length]);
  const [openGroups, setOpenGroups] = React.useState<Record<DisplayGroupKey, boolean>>(initialOpen);
  React.useEffect(() => {
    setOpenGroups(initialOpen);
  }, [initialOpen]);

  const handleConfirm = React.useCallback(async () => {
    if (!isRepairableFilter || partition.repairableIds.length === 0) return;
    setSubmitting(true);
    try {
      type CallSpec = { action: 'partial' | 'chain'; ids: string[] };
      const calls: CallSpec[] = [];
      if (filter === 'debt') {
        if (partition.repairablePartialIds.length > 0) {
          calls.push({ action: 'partial', ids: partition.repairablePartialIds });
        }
        if (partition.repairableChainIds.length > 0) {
          calls.push({ action: 'chain', ids: partition.repairableChainIds });
        }
      } else {
        calls.push({
          action: filter as 'partial' | 'chain',
          ids: partition.repairableIds,
        });
      }

      let totalEnqueued = 0;
      let firstJobId: string | null = null;

      for (const call of calls) {
        const { data, error } = await supabase.rpc('enqueue_health_repair', {
          _action: call.action,
          _scope_mode: scope.mode,
          _location_ids: call.ids,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        const enq = row?.enqueued_count ?? 0;
        totalEnqueued += enq;
        if (!firstJobId && row?.job_id) firstJobId = row.job_id;
      }

      if (totalEnqueued > 0) {
        if (firstJobId) {
          await useGeocodingJobStore.getState().attachToJob(firstJobId);
        }
        toast.success(
          `Encolados ${totalEnqueued} ${totalEnqueued === 1 ? 'punto' : 'puntos'} para reparación`,
        );
        onOpenChange(false);
      } else {
        toast.info('Sin puntos elegibles ahora mismo. Acción auditada.');
        setExhausted(true);
      }
    } catch (err) {
      console.error('[health-repair] enqueue failed', err);
      toast.error('No se pudo encolar la reparación', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    filter,
    partition.repairableIds,
    partition.repairablePartialIds,
    partition.repairableChainIds,
    scope.mode,
    onOpenChange,
    isRepairableFilter,
  ]);

  let confirmLabel: string;
  if (submitting) confirmLabel = 'Encolando…';
  else if (exhausted) confirmLabel = 'Sin acciones disponibles';
  else if (!isRepairableFilter || repairableCount === 0)
    confirmLabel = 'No hay POIs reparables automáticamente';
  else
    confirmLabel = `Reparar automáticamente ${repairableCount} ${repairableCount === 1 ? 'POI' : 'POIs'}`;

  // Conjuntos para exportación global.
  const nonRepairableLocations = React.useMemo<GeoLocation[]>(
    () => [
      ...partition.identityIncomplete,
      ...partition.systemDebt,
      ...partition.review,
      ...partition.nonRepairableByType,
    ],
    [partition],
  );

  const closeAfter = (fn: () => void) => () => {
    fn();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        data-testid="health-repair-preview-dialog"
        data-filter-mode={filter}
        data-repairable-count={repairableCount}
        data-repairable-partial-count={partition.repairablePartialIds.length}
        data-repairable-chain-count={partition.repairableChainIds.length}
        data-total={partition.total}
        data-submitting={submitting ? 'true' : 'false'}
        data-exhausted={exhausted ? 'true' : 'false'}
        aria-busy={submitting}
      >
        <div aria-live="polite" className="sr-only" data-testid="health-repair-status">
          {submitting
            ? 'Encolando reparación…'
            : exhausted
              ? 'Sin acciones disponibles'
              : ''}
        </div>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: `hsl(var(${FILTER_CSS_VAR[filter]}))` }}
            />
            {FILTER_TITLES[filter]} — {partition.total} {partition.total === 1 ? 'punto' : 'puntos'}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              Modo: {scopeModeLabel(scope.mode)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Reparables: {repairableCount} / {partition.total}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Solo los reparables automáticamente se encolan. El resto requiere flujo específico.
        </p>

        {partition.total === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No hay puntos en el subconjunto.
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
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
                  data-triage-group={key}
                  data-triage-group-count={list.length}
                >
                  <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between gap-2">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left flex-1 min-w-0"
                      >
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="text-xs font-semibold truncate">{meta.title}</span>
                        <Badge variant="outline" className="text-[10px] tabular-nums">
                          {list.length}
                        </Badge>
                      </button>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={closeAfter(() =>
                          dispatchExport(list, `Resolver deuda · ${meta.title}`),
                        )}
                        data-triage-group-action="export"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Exportar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={closeAfter(() =>
                          fitToIds(ids, 'health-triage-open-group'),
                        )}
                        data-triage-group-action="map"
                      >
                        <MapPin className="w-3 h-3 mr-1" />
                        Mapa
                      </Button>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 text-[11px] text-muted-foreground leading-snug">
                    {meta.help} · <span className="italic">Acción recomendada: {meta.recommendation}</span>
                  </div>
                  <CollapsibleContent>
                    <ul className="divide-y divide-border/60">
                      {list.map((loc) => {
                        const breadcrumb = getHierarchyBreadcrumb(loc);
                        const rings = ringChips(loc);
                        return (
                          <li
                            key={loc.id}
                            className="px-3 py-1.5 flex items-center gap-2"
                            data-triage-poi-id={loc.id}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium truncate flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[9px] px-1 py-0 leading-none">
                                  {meta.rootBadge}
                                </Badge>
                                <span className="truncate">{loc.name || 'Sin nombre'}</span>
                              </div>
                              {breadcrumb && (
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {breadcrumb}
                                </div>
                              )}
                              {rings.length > 0 && (
                                <div className="text-[10px] text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                                  {rings.map((r) => (
                                    <span
                                      key={r}
                                      className="px-1 rounded bg-muted text-[9px]"
                                    >
                                      {r}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 shrink-0"
                              title="Abrir en mapa"
                              aria-label={`Abrir ${loc.name || loc.id} en el mapa`}
                              onClick={closeAfter(() =>
                                fitToIds([loc.id], 'health-triage-open-poi'),
                              )}
                              data-triage-poi-action="map"
                            >
                              <MapPin className="w-3 h-3" />
                            </Button>
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

        <DialogFooter className="flex-wrap gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting || partition.total === 0}
            onClick={closeAfter(() =>
              dispatchExport(scope.locations, 'Resolver deuda · Todo el scope'),
            )}
            data-triage-export-target="all"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar todo ({partition.total})
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting || nonRepairableLocations.length === 0}
            onClick={closeAfter(() =>
              dispatchExport(nonRepairableLocations, 'Resolver deuda · No reparables'),
            )}
            data-triage-export-target="non-repairable"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar no reparables ({nonRepairableLocations.length})
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cerrar
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid="health-repair-confirm"
            data-action="confirm"
            data-repairable-ids-count={repairableCount}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
