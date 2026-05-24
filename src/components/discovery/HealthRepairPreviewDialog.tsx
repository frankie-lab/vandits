/**
 * HealthRepairPreviewDialog — Modal de previsualización + confirmación.
 *
 * - `partial` y `chain` muestran botón `Confirmar reparación` que llama a
 *   `enqueue_health_repair` (RPC SECURITY DEFINER). Encola en
 *   `geocoding_jobs` (reusa job running o crea uno) y escribe en
 *   `health_repair_actions` (audit log).
 * - `hardError` y `review` siguen sin escritura (flujo per-POI).
 *
 * PR-1 curated sharing (2026-05-13): la columna "Solo lectura · seguido" y
 * la separación reparables vs seguidos desaparecen. Tras la curated boundary
 * los seguidos sólo entran al pipeline si pasan `isShareablePoi` (incluye
 * `geo_health = 'ok'`), por lo que jamás aparecen aquí. Todo lo que se ve
 * es propio y accionable. Ver `mem://logic/sharing/curated-only-rule`.
 *
 * Ver `mem://logic/discovery/health-filter-axis`.
 */
import * as React from 'react';
import { Loader2 } from 'lucide-react';
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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';
import type { HealthFilter } from '@/types/location';
import {
  type HealthScopeResult,
  scopeModeLabel,
} from '@/domains/discovery/lib/health-filter-scope';
import { getHierarchyBreadcrumb } from '@/shared/geography/hierarchy';
import { requestSubsetFit } from '@/components/map/subset-fit';
import {
  partitionRepairScopeByRootStatus,
  type RepairPartition,
  type RepairFilterMode,
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
  // Modo agregado: acento neutro usando el token de partial.
  debt:      '--poi-health-partial',
};

const FILTER_HELP: Record<RepairFilterMode, string> = {
  partial:   'Reparación masiva sólo procesa POIs con identidad D (canon completo). A/B/C requieren resolución por su grupo (ver desglose abajo).',
  chain:     'Reparación masiva sólo procesa POIs con identidad D (canon completo). A/B/C requieren resolución por su grupo (ver desglose abajo).',
  hardError: 'Estos puntos fallaron por error técnico (timeout, sin créditos, red). La acción de reintento llegará en un próximo PR. La reparación masiva NO los encola.',
  review:    'Estos puntos requieren revisión manual. Abre cada uno desde el mapa para resolverlo individualmente. La reparación masiva NO los encola.',
  debt:      'Vista agregada del subconjunto activo. La reparación automática sólo procesa POIs con identidad D y ring partial o chain. A/B/C, hardError y review se muestran para contexto y se resuelven por su flujo específico.',
};

const PREVIEW_LIMIT = 5;

/**
 * Filtros que pueden disparar escritura en BD. En modo agregado `'debt'`
 * el partitioner ya intersecta D con rings reales partial/chain.
 */
const REPAIRABLE: ReadonlySet<RepairFilterMode> = new Set<RepairFilterMode>([
  'partial',
  'chain',
  'debt',
]);

const GROUP_META: Record<
  Exclude<keyof RepairPartition, 'repairableIds' | 'repairablePartialIds' | 'repairableChainIds' | 'total'>,
  { title: string; help: string }
> = {
  repairable: {
    title: 'Reparables automáticamente',
    help: 'Identidad D + deuda partial/chain. Se encolan en `enqueue_health_repair`.',
  },
  systemDebt: {
    title: 'Deuda de sistema (B)',
    help: 'Falta canon/backfill del lado sistema. Resuelve desde el panel Geo Maintenance (Backfill).',
  },
  review: {
    title: 'Revisión (C)',
    help: 'Nombre/coords incoherente. Abre cada POI individualmente desde el mapa.',
  },
  identityIncomplete: {
    title: 'Incompleto real (A)',
    help: 'Falta identidad básica (nombre o coords). Completa identidad antes de cualquier reparación.',
  },
  nonRepairableByType: {
    title: 'No reparables por tipo',
    help: 'Identidad D pero deuda activa es hardError/review — flujo per-POI.',
  },
};

export interface HealthRepairPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `'debt'` = modo agregado (Mantener → Con deuda). El partitioner intersecta
   * D con rings reales (partial|chain) y `handleConfirm` dispara una RPC por
   * bucket (`_action='partial'` y/o `_action='chain'`).
   */
  filter: RepairFilterMode;
  scope: HealthScopeResult;
  /** Mantenido por compat — ya no se usa para distinguir reparable vs lectura. */
  currentUserId?: string | null;
}

export function HealthRepairPreviewDialog({
  open,
  onOpenChange,
  filter,
  scope,
}: HealthRepairPreviewDialogProps) {
  // Partición por Root Status (PR-FILTER-ROOTSTATUS-2.1).
  const partition = React.useMemo(
    () => partitionRepairScopeByRootStatus(scope.locations, filter),
    [scope.locations, filter],
  );

  const isRepairableFilter = REPAIRABLE.has(filter);
  const repairableCount = partition.repairableIds.length;

  const [submitting, setSubmitting] = React.useState(false);
  const [exhausted, setExhausted] = React.useState(false);

  // Sólo confirma reparación si hay POIs en `repairable` (D ∩ partial|chain).
  const canConfirm =
    isRepairableFilter && repairableCount > 0 && !submitting && !exhausted;

  React.useEffect(() => {
    setExhausted(false);
  }, [filter, scope.mode, scope.total]);

  // Auto-focus mapa al subconjunto del preview.
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

  const handleConfirm = React.useCallback(async () => {
    if (!isRepairableFilter || partition.repairableIds.length === 0) return;
    setSubmitting(true);
    try {
      // En modo `'debt'`: una RPC por bucket real (partial/chain). En modos
      // puntuales: una sola RPC con `_action: filter`. Siempre
      // `_location_ids ⊆ D ∩ {partial,chain}`. Si la primera RPC falla,
      // cortamos: no se dispara la segunda y el modal queda actionable.
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
        toast.success(`Encolados ${totalEnqueued} ${totalEnqueued === 1 ? 'punto' : 'puntos'} para reparación`);
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

  // Botón confirm copy contract.
  let confirmLabel: string;
  if (submitting) confirmLabel = 'Encolando…';
  else if (exhausted) confirmLabel = 'Sin acciones disponibles';
  else if (!isRepairableFilter)
    confirmLabel = 'No hay POIs reparables automáticamente';
  else if (repairableCount === 0)
    confirmLabel = 'No hay POIs reparables automáticamente';
  else
    confirmLabel = `Confirmar reparación de ${repairableCount} ${repairableCount === 1 ? 'POI reparable' : 'POIs reparables'}`;

  const groupOrder: Array<Exclude<keyof RepairPartition, 'repairableIds' | 'repairablePartialIds' | 'repairableChainIds' | 'total'>> = [
    'repairable',
    'identityIncomplete',
    'systemDebt',
    'review',
    'nonRepairableByType',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
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
          {FILTER_HELP[filter]}
        </p>

        {partition.total === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No hay puntos en el subconjunto.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {groupOrder.map((key) => {
              const list = partition[key];
              if (list.length === 0) return null;
              const meta = GROUP_META[key];
              const sample = list.slice(0, PREVIEW_LIMIT);
              const remainder = list.length - sample.length;
              return (
                <div
                  key={key}
                  className="rounded-md border bg-muted/30"
                  data-group={key}
                  data-group-count={list.length}
                >
                  <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold">
                      {meta.title}
                    </div>
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {list.length}
                    </Badge>
                  </div>
                  <div className="px-3 py-1.5 text-[11px] text-muted-foreground leading-snug">
                    {meta.help}
                  </div>
                  <ul className="divide-y divide-border/60">
                    {sample.map((loc) => {
                      const breadcrumb = getHierarchyBreadcrumb(loc);
                      return (
                        <li key={loc.id} className="px-3 py-1.5">
                          <div className="text-xs font-medium truncate">
                            {loc.name || 'Sin nombre'}
                          </div>
                          {breadcrumb && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {breadcrumb}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {remainder > 0 && (
                    <div className="px-3 py-1 text-[10px] text-muted-foreground text-center">
                      … y {remainder} más
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
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
