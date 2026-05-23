/**
 * EffectiveActionFooter — footer sticky de acciones para el panel Buscar y Filtrar.
 *
 * Plan: docs/audits/search-filter-maintain-tree-universe-plan.md §5/§6.
 * Aparece en los 4 modos (Explorar / Mantener→Con deuda / Mantener→Sin enriquecer /
 * Seleccionar). Opera SIEMPRE sobre `effectiveActionSet` (recibido como `locations`).
 *
 * Ajuste de alcance:
 *   - NO refactoriza `SelectionActions` a hook. Reusa la edge `batch-enrich`
 *     localmente para Enriquecer (mismo contrato que `SelectionActions`).
 *   - Para "Resolver deuda" delega visualmente en el `HealthFilterActionCTA`
 *     que se renderiza arriba (en modo debt).
 *   - Etiquetar/Reclasificar se posponen explícitamente (botones disabled con
 *     tooltip) — quedan disponibles desde `SelectionActions` con userSelection.
 *
 * Exporta abriendo `ExportPanel` vía evento `lovable:open-export-panel`
 * (ya cableado en `src/pages/Index.tsx`) con `source.locations = effectiveActionSet`.
 *
 * Confirmaciones tipadas (`DestructiveConfirmDialog`):
 *   - Exportar  > 250 → token "EXPORTAR"
 *   - Enriquecer > 25 → token "ENRIQUECER"
 *   - Eliminar siempre → token "ELIMINAR" (solo con userSelection)
 */
import React, { useMemo, useState } from 'react';
import {
  Download,
  Sparkles,
  Trash2,
  Tag as TagIcon,
  Layers,
  Loader2,
  HeartPulse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DestructiveConfirmDialog } from '@/shared/components/ui/destructive-confirm-dialog';
import { dispatchGlobalEvent } from '@/lib/global-events';
import { isPointEnriched } from '@/domains/content/lib/is-point-enriched';
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
}

export function EffectiveActionFooter({
  mode,
  locations,
  hasUserSelection,
  scopeLabel,
  onClearSelection,
}: EffectiveActionFooterProps) {
  const count = locations.length;
  const label = buildFooterLabel({ mode, count, hasUserSelection, scopeLabel });
  const exportLabel = buildExportLabel({ mode, hasUserSelection, scopeLabel });

  const [busy, setBusy] = useState<null | 'export' | 'enrich' | 'delete'>(null);
  const [confirmEnrich, setConfirmEnrich] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Enriquecibles (no enriquecidos) dentro del subset activo.
  const enrichable = useMemo(
    () => locations.filter((l) => !isPointEnriched(l as any)),
    [locations],
  );

  // Mostrar Enriquecer solo en modos all/unenriched.
  const showEnrich = mode !== 'debt' && enrichable.length > 0;
  // Mostrar Eliminar solo si hay userSelection explícita.
  const showDelete = hasUserSelection && count > 0;

  const disabled = count === 0;

  // ---- Exportar: dispatcha el bridge global `lovable:open-export-panel`. ----
  const doExport = () => {
    if (count === 0) {
      toast.error('No hay POIs para exportar');
      return;
    }
    setBusy('export');
    try {
      window.dispatchEvent(
        new CustomEvent('lovable:open-export-panel', {
          detail: {
            locations,
            label: exportLabel,
            scope: 'public',
          },
        }),
      );
    } finally {
      setBusy(null);
    }
  };

  const onExportClick = () => {
    if (disabled) return;
    if (count > EXPORT_CONFIRM_THRESHOLD) {
      setConfirmExport(true);
      return;
    }
    doExport();
  };

  // ---- Enriquecer IA: invoca `batch-enrich` agrupando por documentId. ----
  const doEnrich = async () => {
    if (enrichable.length === 0) {
      toast.info('No hay POIs por enriquecer en el subconjunto activo');
      return;
    }
    setBusy('enrich');
    const toastId = toast.loading(`Enriqueciendo ${enrichable.length} ubicaciones con IA...`);
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
        if (error) {
          errors.push(error.message || 'Error desconocido');
          continue;
        }
        if (data?.error) {
          errors.push(data.error);
          continue;
        }
        if (data?.jobId) {
          jobIds.push(data.jobId);
          window.dispatchEvent(
            new CustomEvent('enrichment-started', { detail: { jobId: data.jobId } }),
          );
        }
      }
      if (jobIds.length === 0) {
        toast.error(errors[0] || 'Error al iniciar enriquecimiento', { id: toastId });
      } else if (errors.length > 0) {
        toast.warning(
          `Iniciados ${jobIds.length} jobs · ${errors.length} fallidos: ${errors[0]}`,
          { id: toastId },
        );
      } else {
        toast.success(
          jobIds.length === 1
            ? 'Enriquecimiento iniciado en segundo plano'
            : `Iniciados ${jobIds.length} jobs de enriquecimiento`,
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
    if (enrichable.length === 0) return;
    if (enrichable.length > ENRICH_CONFIRM_THRESHOLD) {
      setConfirmEnrich(true);
      return;
    }
    void doEnrich();
  };

  // ---- Eliminar (papelera) — solo con userSelection. ----
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

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={onExportClick}
          disabled={disabled || busy !== null}
          data-action="footer-export"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar
        </Button>

        {showEnrich && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={onEnrichClick}
            disabled={busy !== null}
            data-action="footer-enrich"
            title={`Enriquecer ${enrichable.length} POIs sin descripción IA`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Enriquecer IA
            <span className="tabular-nums text-muted-foreground">({enrichable.length})</span>
          </Button>
        )}

        {mode === 'debt' && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled
            data-action="footer-debt-hint"
            title="Las acciones de deuda se ejecutan desde el CTA superior"
          >
            <HeartPulse className="w-3.5 h-3.5" />
            Resolver deuda (arriba)
          </Button>
        )}

        {/* Etiquetar / Reclasificar — pospuestos en este PR.
            Permanecen disponibles en `SelectionActions` cuando hay selección manual. */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled
          data-action="footer-tag-disabled"
          title="Disponible próximamente desde el footer. Usa la selección manual para etiquetar."
        >
          <TagIcon className="w-3.5 h-3.5" />
          Etiquetar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled
          data-action="footer-reclassify-disabled"
          title="Disponible próximamente desde el footer. Usa la selección manual para reclasificar."
        >
          <Layers className="w-3.5 h-3.5" />
          Reclasificar
        </Button>

        {showDelete && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 col-span-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmDelete(true)}
            disabled={busy !== null}
            data-action="footer-delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar selección ({count})
          </Button>
        )}
      </div>

      {/* Confirmaciones tipadas */}
      <DestructiveConfirmDialog
        open={confirmEnrich}
        onOpenChange={setConfirmEnrich}
        title="Confirmar enriquecimiento masivo"
        description={`Vas a enriquecer ${enrichable.length} POIs con IA. Esta acción es costosa y consume cuota.`}
        token="ENRIQUECER"
        confirmLabel="Enriquecer"
        inputHelper={'Escribe "ENRIQUECER" para confirmar:'}
        busy={busy === 'enrich'}
        onConfirm={async () => {
          await doEnrich();
          setConfirmEnrich(false);
        }}
      />

      <DestructiveConfirmDialog
        open={confirmExport}
        onOpenChange={setConfirmExport}
        title="Confirmar exportación grande"
        description={`Vas a abrir el panel de exportación con ${count} POIs (más de ${EXPORT_CONFIRM_THRESHOLD}).`}
        token="EXPORTAR"
        confirmLabel="Continuar"
        inputHelper={'Escribe "EXPORTAR" para confirmar:'}
        onConfirm={() => {
          doExport();
          setConfirmExport(false);
        }}
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
        onConfirm={async () => {
          await doDelete();
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
