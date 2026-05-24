/**
 * EffectiveActionFooter — footer sticky de acciones para el panel Buscar y Filtrar.
 *
 * Contrato (PR-MAINTAIN-FOOTER-1 — single primary + "Más acciones"):
 *   Layout: `[Primary] [Más acciones ▾]` (sin grid de 2 columnas).
 *   Una sola acción principal visible por modo:
 *     - all        → Exportar
 *     - debt       → Resolver (SIEMPRE, nunca Exportar). Si count===1 abre
 *                    popup canónico del POI (lovable:open-poi-popup). Si
 *                    count>1 o sin selección, abre HealthRepairPreviewDialog
 *                    vía onResolveDebt para procesar lo posible y dejar
 *                    residual para resolución manual.
 *     - unenriched → Enriquecer IA
 *   El resto siempre vive dentro del DropdownMenu "Más acciones".
 *   En `debt`, "Exportar" SOLO existe como item del menú (escape hatch), nunca primary.
 *
 *   Estado vacío (count===0): primary disabled, "Más acciones" disabled,
 *   texto "No hay POIs en este subconjunto".
 *
 *   Confirmaciones tipadas:
 *     - Exportar  > 250 → token "EXPORTAR"
 *     - Enriquecer > 25 → token "ENRIQUECER"
 *     - Eliminar siempre → token "ELIMINAR" (solo con userSelection)
 *
 *   Ver mem://ui/discovery/maintain-footer-resolve-canon
 */
import React, { useMemo, useState } from 'react';
import {
  Download,
  Sparkles,
  Trash2,
  Tag as TagIcon,
  Layers,
  Loader2,
  Wrench,
  MoreHorizontal,
  CheckSquare,
  XSquare,
  Map as MapIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DestructiveConfirmDialog } from '@/shared/components/ui/destructive-confirm-dialog';
import { dispatchGlobalEvent } from '@/lib/global-events';
import { isPointEnriched } from '@/domains/content/lib/point-visual-state';
import { partitionRepairScopeByRootStatus } from '@/components/discovery/health-repair-partition';
import { requestSubsetFit } from '@/components/map/subset-fit';
import { dispatchGeoMaintenanceHandoff, navigateToGeoMaintenance } from '@/shared/events/geo-maintenance-handoff';
import type { GeoLocation } from '@/types/location';
import {
  buildFooterLabel,
  buildExportLabel,
  type FooterMode,
} from './footer-label';


const ENRICH_CONFIRM_THRESHOLD = 25;
const EXPORT_CONFIRM_THRESHOLD = 250;

export interface EffectiveActionFooterProps {
  mode: FooterMode;
  locations: GeoLocation[];
  hasUserSelection: boolean;
  scopeLabel?: string | null;
  onClearSelection: () => void;
  /** Callback para abrir HealthRepairPreviewDialog. Solo aplica en mode='debt'
   *  Y SOLO se invoca si repairableCount > 0 (PR-INLINE-3.1). */
  onResolveDebt?: () => void;
  /** Callback "Seleccionar todo" del modo activo. */
  onSelectAll?: () => void;
  /** PR-INLINE-3.1: capabilities para Geo Maintenance handoff (boolean para tests). */
  canViewGeoMaintenance?: boolean;
  canRunGeoBackfill?: boolean;
}


export function EffectiveActionFooter({
  mode,
  locations,
  hasUserSelection,
  scopeLabel,
  onClearSelection,
  onResolveDebt,
  onSelectAll,
  canViewGeoMaintenance = false,
  canRunGeoBackfill = false,
}: EffectiveActionFooterProps) {
  const count = locations.length;
  const label = buildFooterLabel({ mode, count, hasUserSelection, scopeLabel });
  const exportLabel = buildExportLabel({ mode, hasUserSelection, scopeLabel });


  const [busy, setBusy] = useState<null | 'export' | 'enrich' | 'delete'>(null);
  const [confirmEnrich, setConfirmEnrich] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const enrichable = useMemo(
    () => locations.filter((l) => !isPointEnriched(l as any)),
    [locations],
  );
  const enrichCount = enrichable.length;
  const disabled = count === 0;

  // ---- Exportar ----
  const doExport = () => {
    if (count === 0) {
      toast.error('No hay POIs para exportar');
      return;
    }
    setBusy('export');
    try {
      window.dispatchEvent(
        new CustomEvent('lovable:open-export-panel', {
          detail: { locations, label: exportLabel, scope: 'public' },
        }),
      );
    } finally {
      setBusy(null);
    }
  };
  const onExportClick = () => {
    if (disabled) return;
    if (count > EXPORT_CONFIRM_THRESHOLD) { setConfirmExport(true); return; }
    doExport();
  };

  // ---- Enriquecer IA ----
  const doEnrich = async () => {
    if (enrichCount === 0) {
      toast.info('No hay POIs por enriquecer en el subconjunto activo');
      return;
    }
    setBusy('enrich');
    const toastId = toast.loading(`Enriqueciendo ${enrichCount} ubicaciones con IA...`);
    try {
      const byDoc = new Map<string, string[]>();
      for (const loc of enrichable) {
        const docId = (loc as any).documentId as string | undefined;
        if (!docId) continue;
        if (!byDoc.has(docId)) byDoc.set(docId, []);
        byDoc.get(docId)!.push(loc.id);
      }
      if (byDoc.size === 0) {
        toast.error('No se pudo determinar el documento de los POIs', { id: toastId });
        return;
      }
      const jobIds: string[] = [];
      const errors: string[] = [];
      for (const [documentId, locationIds] of byDoc.entries()) {
        const { data, error } = await supabase.functions.invoke('batch-enrich', {
          body: { action: 'start', documentId, locationIds },
        });
        if (error) { errors.push(error.message || 'Error'); continue; }
        if (data?.error) { errors.push(data.error); continue; }
        if (data?.jobId) {
          jobIds.push(data.jobId);
          window.dispatchEvent(new CustomEvent('enrichment-started', { detail: { jobId: data.jobId } }));
        }
      }
      if (jobIds.length === 0) {
        toast.error(errors[0] || 'Error al iniciar enriquecimiento', { id: toastId });
      } else if (errors.length > 0) {
        toast.warning(`Iniciados ${jobIds.length} jobs · ${errors.length} fallidos`, { id: toastId });
      } else {
        toast.success(
          jobIds.length === 1 ? 'Enriquecimiento iniciado en segundo plano' : `Iniciados ${jobIds.length} jobs`,
          { id: toastId },
        );
      }
    } catch (err) {
      console.error('[EffectiveActionFooter] enrich error:', err);
      toast.error('Error al iniciar enriquecimiento', { id: toastId });
    } finally {
      setBusy(null);
    }
  };
  const onEnrichClick = () => {
    if (enrichCount === 0) return;
    if (enrichCount > ENRICH_CONFIRM_THRESHOLD) { setConfirmEnrich(true); return; }
    void doEnrich();
  };

  // ---- Eliminar ----
  const doDelete = async () => {
    if (!hasUserSelection || count === 0) return;
    setBusy('delete');
    const ids = locations.map((l) => l.id);
    const toastId = toast.loading(`Eliminando ${ids.length} puntos...`);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} puntos movidos a la papelera`, { id: toastId });
      onClearSelection();
      dispatchGlobalEvent('trash-updated');
      window.dispatchEvent(new CustomEvent('store-updated'));
    } catch (err) {
      console.error('[EffectiveActionFooter] delete error:', err);
      toast.error('Error al eliminar', { id: toastId });
    } finally {
      setBusy(null);
    }
  };

  // ---- PR-INLINE-3.1 — partición debt: solo abrir modal si hay reparables ----
  const debtPartition = useMemo(
    () => (mode === 'debt' ? partitionRepairScopeByRootStatus(locations, 'debt') : null),
    [mode, locations],
  );
  const repairableCount = debtPartition?.repairableIds.length ?? 0;
  const systemDebtIds = useMemo(
    () => (debtPartition ? debtPartition.systemDebt.map((l) => l.id) : []),
    [debtPartition],
  );
  const allAreSystemDebt =
    mode === 'debt' && count > 0 && systemDebtIds.length === count;

  // ---- Geo Maintenance handoff (B + capability) ----
  const canHandoffGeoMaintenance =
    canViewGeoMaintenance && canRunGeoBackfill && systemDebtIds.length > 0;

  const doGeoMaintenance = (ids: string[], label: string) => {
    if (ids.length === 0) return;
    dispatchGeoMaintenanceHandoff({
      locationIds: ids,
      source: 'health-repair-triage',
      label,
    });
    navigateToGeoMaintenance();
  };
  const onGeoMaintenancePrimary = () => {
    doGeoMaintenance(
      systemDebtIds,
      `Mantener · Grupo B · ${systemDebtIds.length} puntos`,
    );
  };
  const onGeoMaintenanceSubgroup = () => {
    doGeoMaintenance(
      systemDebtIds,
      `Mantener · Subgrupo B · ${systemDebtIds.length} puntos`,
    );
  };

  // ---- Abrir en mapa (helper canónico requestSubsetFit) ----
  const onFocusInMap = () => {
    if (count === 0) return;
    requestSubsetFit(
      locations.map((l) => l.id),
      { mode: 'always', reason: 'health-filter' },
    );
  };

  // ---- Exportar no reparables (debt sin reparables) ----
  const nonRepairableLocations = useMemo(() => {
    if (!debtPartition) return [];
    return [
      ...debtPartition.nonRepairableByType,
      ...debtPartition.review,
      ...debtPartition.identityIncomplete,
      ...debtPartition.systemDebt,
    ];
  }, [debtPartition]);
  const doExportNonRepairable = () => {
    if (nonRepairableLocations.length === 0) return;
    window.dispatchEvent(
      new CustomEvent('lovable:open-export-panel', {
        detail: {
          locations: nonRepairableLocations,
          label: `${exportLabel} · no reparables`,
          scope: 'public',
        },
      }),
    );
  };

  // ---- Primary por modo ----
  type Primary = {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
    disabled: boolean;
    dataAction: string;
    testid: string;
    count?: number;
  };
  const primary: Primary = (() => {
    if (mode === 'debt') {
      // Caso 1: hay reparables → Reparar N (abre modal de confirmación).
      if (repairableCount > 0) {
        return {
          label: 'Reparar',
          icon: Wrench,
          onClick: () => onResolveDebt?.(),
          disabled: disabled || !onResolveDebt,
          dataAction: 'footer-primary-resolve-debt',
          testid: 'footer-primary-resolve-debt',
          count: repairableCount,
        };
      }
      // Caso 2: 0 reparables + todo B + capability → Geo Maintenance.
      if (allAreSystemDebt && canHandoffGeoMaintenance) {
        return {
          label: 'Geo Maintenance',
          icon: Wrench,
          onClick: onGeoMaintenancePrimary,
          disabled: disabled,
          dataAction: 'footer-primary-geo-maintenance',
          testid: 'footer-primary-geo-maintenance',
          count: systemDebtIds.length,
        };
      }
      // Caso 3: 0 reparables resto → Exportar.
      return {
        label: 'Exportar',
        icon: Download,
        onClick: onExportClick,
        disabled: disabled || busy !== null,
        dataAction: 'footer-primary-export',
        testid: 'footer-primary-export',
      };
    }
    if (mode === 'unenriched') {
      return {
        label: 'Enriquecer IA',
        icon: Sparkles,
        onClick: onEnrichClick,
        disabled: disabled || enrichCount === 0 || busy !== null,
        dataAction: 'footer-primary-enrich',
        testid: 'footer-primary-enrich',
        count: enrichCount,
      };
    }
    return {
      label: 'Exportar',
      icon: Download,
      onClick: onExportClick,
      disabled: disabled || busy !== null,
      dataAction: 'footer-primary-export',
      testid: 'footer-primary-export',
    };
  })();
  const PrimaryIcon = primary.icon;

  // ---- Hint debt sin reparables ----
  const debtNoRepairablesHint = (() => {
    if (mode !== 'debt' || repairableCount > 0 || disabled) return null;
    // Si el primary YA es una acción positiva (Geo Maintenance), no hace
    // falta el hint negativo.
    if (primary.testid === 'footer-primary-geo-maintenance') return null;
    const hasAlternatives = canHandoffGeoMaintenance;
    return hasAlternatives
      ? 'No hay POIs reparables automáticamente en este subconjunto.'
      : 'No hay reparación automática disponible.';
  })();

  const showEnrichInMenu = mode === 'all' && enrichCount > 0;
  const showExportInMenu = mode !== 'all' && primary.testid !== 'footer-primary-export';
  const showDebtExtras = mode === 'debt' && repairableCount === 0 && !disabled;
  const showGeoMaintenanceInMenu =
    showDebtExtras &&
    canHandoffGeoMaintenance &&
    primary.testid !== 'footer-primary-geo-maintenance';
  const showFocusInMapInMenu = showDebtExtras;
  const showExportNonRepairableInMenu =
    showDebtExtras && nonRepairableLocations.length > 0;
  const moreDisabled = disabled;



  return (
    <div
      data-effective-action-footer
      data-footer-mode={mode}
      data-footer-count={count}
      className="shrink-0 border-t bg-background/95 backdrop-blur-sm px-3 py-2 space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="text-[11px] font-medium text-muted-foreground"
          data-testid="effective-action-footer-label"
        >
          {label}
        </div>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs gap-1.5 flex-1 min-w-0"
          onClick={primary.onClick}
          disabled={primary.disabled}
          data-action={primary.dataAction}
          data-testid={primary.testid}
        >
          <PrimaryIcon className="w-3.5 h-3.5" />
          <span className="truncate">{primary.label}</span>
          {typeof primary.count === 'number' && (
            <span className="tabular-nums text-primary-foreground/80">({primary.count})</span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 shrink-0"
              disabled={moreDisabled}
              data-action="footer-more-actions"
              data-testid="footer-more-actions"
              aria-label="Más acciones"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              Más acciones
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {showExportInMenu && (
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); onExportClick(); }}
                data-action="footer-export"
                data-testid="footer-menu-export"
                disabled={disabled || busy !== null}
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                Exportar
              </DropdownMenuItem>
            )}
            {showEnrichInMenu && (
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); onEnrichClick(); }}
                data-action="footer-enrich"
                data-testid="footer-menu-enrich"
                disabled={busy !== null}
              >
                <Sparkles className="w-3.5 h-3.5 mr-2" />
                Enriquecer IA
                <span className="ml-auto tabular-nums text-muted-foreground">({enrichCount})</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled
              data-action="footer-tag-disabled"
              data-testid="footer-menu-tag"
              title="Próximamente"
            >
              <TagIcon className="w-3.5 h-3.5 mr-2" />
              Etiquetar
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled
              data-action="footer-reclassify-disabled"
              data-testid="footer-menu-reclassify"
              title="Próximamente"
            >
              <Layers className="w-3.5 h-3.5 mr-2" />
              Reclasificar
            </DropdownMenuItem>

            {(showFocusInMapInMenu ||
              showGeoMaintenanceInMenu ||
              showExportNonRepairableInMenu) && <DropdownMenuSeparator />}
            {showFocusInMapInMenu && (
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); onFocusInMap(); }}
                data-action="footer-focus-map"
                data-testid="footer-menu-focus-map"
                disabled={disabled}
              >
                <MapIcon className="w-3.5 h-3.5 mr-2" />
                Abrir en mapa
              </DropdownMenuItem>
            )}
            {showGeoMaintenanceInMenu && (
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); onGeoMaintenanceSubgroup(); }}
                data-action="footer-geo-maintenance-b"
                data-testid="footer-menu-geo-maintenance-b"
                disabled={disabled}
              >
                <Wrench className="w-3.5 h-3.5 mr-2" />
                Geo Maintenance subgrupo B
                <span className="ml-auto tabular-nums text-muted-foreground">({systemDebtIds.length})</span>
              </DropdownMenuItem>
            )}
            {showExportNonRepairableInMenu && (
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); doExportNonRepairable(); }}
                data-action="footer-export-non-repairable"
                data-testid="footer-menu-export-non-repairable"
                disabled={disabled || busy !== null}
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                Exportar no reparables
                <span className="ml-auto tabular-nums text-muted-foreground">({nonRepairableLocations.length})</span>
              </DropdownMenuItem>
            )}


            {(onSelectAll || hasUserSelection) && <DropdownMenuSeparator />}
            {onSelectAll && (
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); onSelectAll(); }}
                data-action="footer-select-all"
                data-testid="footer-menu-select-all"
                disabled={disabled}
              >
                <CheckSquare className="w-3.5 h-3.5 mr-2" />
                Seleccionar todo
              </DropdownMenuItem>
            )}
            {hasUserSelection && (
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); onClearSelection(); }}
                data-action="footer-clear-selection"
                data-testid="footer-menu-clear-selection"
              >
                <XSquare className="w-3.5 h-3.5 mr-2" />
                Limpiar selección
              </DropdownMenuItem>
            )}

            {hasUserSelection && count > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); setConfirmDelete(true); }}
                  data-action="footer-delete"
                  data-testid="footer-menu-delete"
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  disabled={busy !== null}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Eliminar selección ({count})
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {disabled && (
        <div className="text-[11px] text-muted-foreground/80 italic">
          No hay POIs en este subconjunto
        </div>
      )}

      {debtNoRepairablesHint && (
        <div
          className="text-[11px] text-muted-foreground/80 italic"
          data-testid="footer-debt-no-repairables-hint"
        >
          {debtNoRepairablesHint}
        </div>
      )}


      <DestructiveConfirmDialog
        open={confirmEnrich}
        onOpenChange={setConfirmEnrich}
        title="Confirmar enriquecimiento masivo"
        description={`Vas a enriquecer ${enrichCount} POIs con IA. Esta acción es costosa y consume cuota.`}
        token="ENRIQUECER"
        confirmLabel="Enriquecer"
        inputHelper={'Escribe "ENRIQUECER" para confirmar:'}
        busy={busy === 'enrich'}
        onConfirm={async () => { await doEnrich(); setConfirmEnrich(false); }}
      />

      <DestructiveConfirmDialog
        open={confirmExport}
        onOpenChange={setConfirmExport}
        title="Confirmar exportación grande"
        description={`Vas a abrir el panel de exportación con ${count} POIs (más de ${EXPORT_CONFIRM_THRESHOLD}).`}
        token="EXPORTAR"
        confirmLabel="Continuar"
        inputHelper={'Escribe "EXPORTAR" para confirmar:'}
        onConfirm={() => { doExport(); setConfirmExport(false); }}
      />

      <DestructiveConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar POIs seleccionados"
        description={`Vas a mover ${count} POIs a la papelera. Podrás restaurarlos desde la papelera.`}
        token="ELIMINAR"
        confirmLabel="Eliminar"
        inputHelper={'Escribe "ELIMINAR" para confirmar:'}
        busy={busy === 'delete'}
        onConfirm={async () => { await doDelete(); setConfirmDelete(false); }}
      />
    </div>
  );
}
