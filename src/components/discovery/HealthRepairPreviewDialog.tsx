/**
 * HealthRepairPreviewDialog — Modal de previsualización + confirmación.
 *
 * PR-3A: sólo lectura, footer con `Cerrar`.
 * PR-3B: para `partial` y `chain` añade botón `Confirmar reparación` que
 *   llama a `enqueue_health_repair` (RPC SECURITY DEFINER): valida ownership,
 *   encola en `geocoding_jobs` (reusa job running o crea uno) y escribe en
 *   `health_repair_actions` (audit log). `hardError` y `review` siguen
 *   sin escritura (PR-3C / panel manual).
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
import type { HealthFilter } from '@/types/location';
import {
  type HealthScopeResult,
  scopeModeLabel,
} from '@/domains/discovery/lib/health-filter-scope';
import { getHierarchyBreadcrumb } from '@/shared/geography/hierarchy';
import { requestSubsetFit } from '@/components/map/subset-fit';

const FILTER_TITLES: Record<HealthFilter, string> = {
  partial:   'Rellenar huecos',
  chain:     'Reparar cadenas',
  hardError: 'Reintentar',
  review:    'Revisar manualmente',
};

const FILTER_CSS_VAR: Record<HealthFilter, string> = {
  partial:   '--poi-health-partial',
  chain:     '--poi-health-chain',
  hardError: '--poi-health-hard-error',
  review:    '--poi-health-review',
};

const FILTER_HELP: Record<HealthFilter, string> = {
  partial:   'Estos puntos tienen niveles administrativos incompletos. La reparación masiva intentará rellenar los huecos vía geocoding.',
  chain:     'Estos puntos tienen la cadena administrativa rota o desactualizada. La reparación masiva re-resolverá los FKs desde sus coordenadas.',
  hardError: 'Estos puntos fallaron por error técnico (timeout, sin créditos, red). La acción de reintento llegará en un próximo PR.',
  review:    'Estos puntos requieren revisión manual (incoherencia nombre/coords, sin verificar). Abre cada uno desde el mapa o desde la lista para resolverlo individualmente.',
};

const PREVIEW_LIMIT = 10;

/** Sólo estos dos disparan escritura en BD en PR-3B. */
const REPAIRABLE: ReadonlySet<HealthFilter> = new Set<HealthFilter>(['partial', 'chain']);

export interface HealthRepairPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: HealthFilter;
  scope: HealthScopeResult;
}

export function HealthRepairPreviewDialog({
  open,
  onOpenChange,
  filter,
  scope,
}: HealthRepairPreviewDialogProps) {
  const sample = React.useMemo(
    () => scope.locations.slice(0, PREVIEW_LIMIT),
    [scope.locations],
  );
  const remainder = Math.max(0, scope.total - sample.length);

  const [submitting, setSubmitting] = React.useState(false);
  const [exhausted, setExhausted] = React.useState(false);
  const canConfirm = REPAIRABLE.has(filter) && scope.total > 0 && !submitting && !exhausted;

  // Reset exhausted state when scope or filter changes
  React.useEffect(() => {
    setExhausted(false);
  }, [filter, scope.mode, scope.total]);

  // Auto-focus mapa al subconjunto del preview (PR-4A.1).
  // Único trigger automático aprobado dentro del workflow de salud.
  const idsKey = scope.ids.join('|');
  React.useEffect(() => {
    if (!open) return;
    if (scope.ids.length === 0) return;
    requestSubsetFit(scope.ids, { mode: 'if-outside', reason: 'repair-preview' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey]);

  const handleConfirm = React.useCallback(async () => {
    if (!REPAIRABLE.has(filter) || scope.ids.length === 0) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('enqueue_health_repair', {
        _action: filter,
        _scope_mode: scope.mode,
        _location_ids: scope.ids,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const enq = row?.enqueued_count ?? 0;
      if (enq > 0) {
        toast.success(`Encolados ${enq} ${enq === 1 ? 'punto' : 'puntos'} para reparación`);
        onOpenChange(false);
      } else {
        // Input válido pero 0 elegibles, o todo ya en cola. Audit registrado.
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
  }, [filter, scope.ids, scope.mode, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: `hsl(var(${FILTER_CSS_VAR[filter]}))` }}
            />
            {FILTER_TITLES[filter]} — {scope.total} {scope.total === 1 ? 'punto' : 'puntos'}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              Modo: {scopeModeLabel(scope.mode)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {REPAIRABLE.has(filter)
                ? 'Previsualización antes de encolar'
                : 'Previsualización · sin escritura en BD'}
            </span>
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {FILTER_HELP[filter]}
        </p>

        {sample.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No hay puntos en el subconjunto.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border max-h-72 overflow-y-auto">
            {sample.map((loc) => {
              const breadcrumb = getHierarchyBreadcrumb(loc);
              return (
                <li key={loc.id} className="px-3 py-2 flex items-start gap-2">
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ background: `hsl(var(${FILTER_CSS_VAR[filter]}))` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {loc.name || 'Sin nombre'}
                    </div>
                    {breadcrumb && (
                      <div className="text-xs text-muted-foreground truncate">
                        {breadcrumb}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {remainder > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            … y {remainder} más
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cerrar
          </Button>
          {REPAIRABLE.has(filter) && (
            <Button
              variant="default"
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {exhausted ? 'Sin acciones disponibles' : `Confirmar reparación (${scope.total})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
