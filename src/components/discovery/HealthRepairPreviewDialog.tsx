/**
 * HealthRepairPreviewDialog — Modal de previsualización SÓLO LECTURA.
 *
 * PR-3A: lista los 10 primeros puntos del subconjunto resuelto por
 * `getHealthFilterScopeIds`. NO escribe en BD. NO confirma. Footer único:
 * `Cerrar` (evitamos un confirm deshabilitado que confundiría).
 *
 * La acción real (encolar job / reintentar enrich / abrir queue de revisión)
 * llega en PR-3B.
 *
 * Ver `mem://logic/discovery/health-filter-axis`.
 */
import * as React from 'react';
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
import type { HealthFilter } from '@/types/location';
import {
  type HealthScopeResult,
  scopeModeLabel,
} from '@/domains/discovery/lib/health-filter-scope';
import { getHierarchyBreadcrumb } from '@/shared/geography/hierarchy';

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
  partial:   'Estos puntos tienen niveles administrativos incompletos. Cuando se ejecute la reparación masiva, el job intentará rellenar los huecos vía geocoding.',
  chain:     'Estos puntos tienen la cadena administrativa rota o desactualizada. La reparación masiva re-resolverá los FKs desde sus coordenadas.',
  hardError: 'Estos puntos fallaron por error técnico (timeout, sin créditos, red). Cuando se ejecute, el reintento volverá a lanzar el enriquecimiento.',
  review:    'Estos puntos requieren revisión manual (incoherencia nombre/coords, sin verificar). Abre cada uno desde el mapa o desde la lista para resolverlo individualmente.',
};

const PREVIEW_LIMIT = 10;

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
              Previsualización · sin escritura en BD
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
