/**
 * ExportPanel — Fase 3 UX de PR-EXPORT-2.
 *
 * Toda la lógica vive en el pipeline canónico
 * (`src/domains/content/lib/poi-export-pipeline.ts`):
 *
 *   partitionForExport → evaluatePoiExportSize →
 *     mapToPoiExportRecords → POI_EXPORTERS[format] → Blob → download → tracking
 *
 * Este componente sólo:
 *   - elige scope (default public);
 *   - elige formato (KML/CSV/JSON/GeoJSON);
 *   - muestra contador exportables/excluidos;
 *   - muestra warning >5.000 y bloquea >10.000;
 *   - invoca `runPoiExport` y `recordExport`.
 *
 * NUNCA importa serializers, mapper ni `GeoLocation` para serializar.
 */
import React, { useMemo, useState } from 'react';
import {
  FileJson,
  FileSpreadsheet,
  FileCode,
  Map as MapIcon,
  Mountain,
  Clock,
  AlertCircle,
  Check,
  ShieldAlert,
  TriangleAlert,
  Globe2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocationsStore } from '@/domains/content';
import { useAuth } from '@/domains/identity';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useExportTracking } from '@/hooks/use-export-tracking';
import type { GeoLocation } from '@/types/location';
import {
  EXPORT_EXCLUSION_LABEL,
  type ExportExclusionReason,
} from '@/domains/content/lib/poi-export-eligibility';
import {
  POI_EXPORTERS,
  type PoiExportFormat,
  type PoiExportScope,
} from '@/domains/content/lib/exporters';
import {
  PoiExportSizeError,
  POI_EXPORT_SIZE_THRESHOLDS,
} from '@/domains/content/lib/poi-export-record';
import {
  runPoiExport,
  previewPoiExport,
  downloadPoiExportBlob,
  type PoiExportOrigin,
} from '@/domains/content/lib/poi-export-pipeline';
import {
  resolveExportCandidates,
  describeExportOrigin,
} from '@/domains/content/lib/export-source-resolver';

const FORMATS: PoiExportFormat[] = ['kml', 'csv', 'json', 'geojson'];

const formatIcons: Record<PoiExportFormat, React.ReactNode> = {
  kml: <FileCode className="w-4 h-4" />,
  csv: <FileSpreadsheet className="w-4 h-4" />,
  json: <FileJson className="w-4 h-4" />,
  geojson: <Globe2 className="w-4 h-4" />,
};

const formatLabels: Record<PoiExportFormat, string> = {
  kml: 'KML',
  csv: 'CSV',
  json: 'JSON',
  geojson: 'GeoJSON',
};

type KmlTarget = 'mymaps' | 'gurumaps' | 'general';

const ORIGIN: PoiExportOrigin = 'panel';

/**
 * PR-EXPORT-2 Fase 3A — `source` opcional permite que el caller propague
 * una selección explícita (toolbar global, bridge ShareSheet, popup,
 * etc.) sin depender de `selectedDocument`. Si `source` es `null` o no
 * se pasa, el panel cae a `selectedLocations` (cross-doc) y luego al
 * universo filtrado del mapa.
 */
export interface ExportPanelSource {
  locations: GeoLocation[];
  /** Etiqueta opcional para el header del panel. */
  label?: string;
  /** Sugerencia opcional de scope inicial. */
  initialScope?: PoiExportScope;
}

export interface ExportPanelProps {
  source?: ExportPanelSource | null;
}

export function ExportPanel({ source = null }: ExportPanelProps = {}) {
  const documents = useLocationsStore((s) => s.documents);
  const selectedDocument = useLocationsStore((s) => s.selectedDocument);
  const selectedLocations = useLocationsStore((s) => s.selectedLocations);
  const getFilteredLocations = useLocationsStore((s) => s.getFilteredLocations);
  const [isExporting, setIsExporting] = useState(false);
  const [scope, setScope] = useState<PoiExportScope>(
    source?.initialScope ?? 'public',
  );
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const {
    lastExport,
    modifiedCount,
    recordExport,
    formatLastExportTime,
  } = useExportTracking();

  const resolution = useMemo(
    () =>
      resolveExportCandidates({
        explicitLocations: source?.locations ?? null,
        selectedIds: selectedLocations,
        documents,
        getFiltered: getFilteredLocations,
      }),
    [source, selectedLocations, documents, getFilteredLocations],
  );

  const candidateLocations = resolution.locations;
  const originLabel =
    source?.label ?? describeExportOrigin(resolution.origin, candidateLocations.length);

  // Preview de elegibilidad + tamaño (sin serializar).
  const preview = useMemo(
    () =>
      previewPoiExport({
        locations: candidateLocations,
        // format no afecta el preview de elegibilidad/tamaño; pasamos uno cualquiera.
        format: 'csv',
        scope,
        ctx: { currentUserId },
      }),
    [candidateLocations, scope, currentUserId],
  );

  const exclusionGroups = useMemo(() => {
    const map = new Map<ExportExclusionReason, number>();
    for (const e of preview.excluded) {
      map.set(e.reason, (map.get(e.reason) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [preview.excluded]);

  const eligibleCount = preview.eligibleCount;
  const totalCount = preview.totalCount;
  const sizeLevel = preview.sizeVerdict.level;
  const blocked = sizeLevel === 'block';
  const internalDisabled = scope === 'internal' && !currentUserId;

  const handleExport = async (
    format: PoiExportFormat,
    target: KmlTarget = 'general',
  ) => {
    if (candidateLocations.length === 0) {
      toast.error('No hay POIs para exportar');
      return;
    }
    if (internalDisabled) {
      toast.error('Inicia sesión para exportar en modo interno');
      return;
    }
    if (!POI_EXPORTERS[format]) {
      toast.error(`Formato no soportado: ${format}`);
      return;
    }

    setIsExporting(true);
    try {
      const docName =
        source?.label ||
        selectedDocument?.name ||
        (resolution.origin === 'selection' ? 'seleccion' : 'export');
      const exec = (confirmedOverWarn: boolean) =>
        runPoiExport(
          {
            locations: candidateLocations,
            format,
            scope,
            ctx: { currentUserId },
            documentName: docName,
            target: format === 'kml' ? target : undefined,
            origin: ORIGIN,
          },
          { confirmedOverWarn },
        );

      let outcome = exec(false);

      if (outcome.kind === 'no-eligible') {
        toast.error(
          scope === 'public'
            ? 'Ningún POI cumple el contrato público (POI-9/10 + compartible)'
            : 'Ningún POI exportable en modo interno (requiere ser del usuario actual)',
        );
        return;
      }
      if (outcome.kind === 'warn-pending') {
        const ok = window.confirm(
          `Vas a exportar ${outcome.partition.eligibleCount} POIs (más de ${POI_EXPORT_SIZE_THRESHOLDS.warn}).\nEl archivo puede ser muy grande. ¿Continuar?`,
        );
        if (!ok) {
          toast.message('Exportación cancelada');
          return;
        }
        outcome = exec(true);
        if (outcome.kind !== 'ok') {
          toast.error('No se pudo ejecutar la exportación');
          return;
        }
      }

      downloadPoiExportBlob(outcome);
      recordExport(format, target, outcome.exportedIds, {
        scope,
        origin: ORIGIN,
        excludedCount: outcome.excludedCount,
        success: true,
      });
      const excludedNote =
        outcome.excludedCount > 0 ? ` (${outcome.excludedCount} excluidos)` : '';
      toast.success(
        `Exportados ${outcome.eligibleCount} POIs en ${format.toUpperCase()}${excludedNote}`,
      );
    } catch (error) {
      if (error instanceof PoiExportSizeError) {
        toast.error(
          `Export bloqueado: ${error.verdict.count} POIs supera el límite de ${error.verdict.thresholds.block}`,
        );
      } else {
        console.error('Export error:', error);
        toast.error('Error al exportar');
      }
      recordExport(
        format,
        target,
        [],
        { scope, origin: ORIGIN, excludedCount: preview.excludedCount, success: false },
      );
    } finally {
      setIsExporting(false);
    }
  };

  const disableButtons =
    !selectedDocument || isExporting || eligibleCount === 0 || internalDisabled || blocked;

  return (
    <div className="space-y-4" data-export-panel="pr-export-2">
      {/* Last export indicator */}
      {lastExport && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-muted/50 border border-border/50"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Última exportación:</span>
              <span className="font-medium">{formatLastExportTime()}</span>
            </div>
            <Badge variant="outline" className="text-xs">{lastExport.locationCount} pts</Badge>
          </div>
          <AnimatePresence>
            {modifiedCount > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 pt-2 border-t border-border/50">
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    {modifiedCount} {modifiedCount === 1 ? 'punto modificado' : 'puntos modificados'} desde la última exportación
                  </span>
                </div>
              </motion.div>
            )}
            {modifiedCount === 0 && lastExport && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 pt-2 border-t border-border/50">
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="w-4 h-4" />
                  <span>Todo sincronizado</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      <Separator />

      {/* Scope selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Alcance de la exportación</p>
        <div className="flex gap-2">
          <Button
            variant={scope === 'public' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScope('public')}
            className="flex-1"
          >
            Público (curado)
          </Button>
          <Button
            variant={scope === 'internal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScope('internal')}
            className="flex-1"
            disabled={!currentUserId}
            title={!currentUserId ? 'Requiere sesión' : undefined}
          >
            Interno (sólo míos)
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {scope === 'public'
            ? 'Sólo POI-9 / POI-10 con datos canónicos compartibles.'
            : 'Diagnóstico: cualquier nivel, pero sólo POIs de tu cuenta.'}
        </div>
        <div
          className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-xs"
          data-export-counter
        >
          <span className="text-muted-foreground">Elegibles</span>
          <span className="font-medium">
            <span data-export-eligible-count>{eligibleCount}</span> / <span data-export-total-count>{totalCount}</span>
          </span>
        </div>
        {exclusionGroups.length > 0 && (
          <details className="text-xs" data-export-excluded>
            <summary className="cursor-pointer flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span data-export-excluded-count>{preview.excludedCount}</span> excluidos · ver razones
            </summary>
            <ul className="mt-2 pl-5 space-y-1 list-disc text-muted-foreground">
              {exclusionGroups.map(([reason, n]) => (
                <li key={reason}>
                  <span className="font-medium text-foreground">{n}</span> · {EXPORT_EXCLUSION_LABEL[reason]}
                </li>
              ))}
            </ul>
          </details>
        )}
        {sizeLevel === 'warn' && (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
            data-export-size-warning
          >
            <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {eligibleCount} POIs supera {POI_EXPORT_SIZE_THRESHOLDS.warn.toLocaleString()}.
              Se pedirá confirmación antes de descargar.
            </span>
          </div>
        )}
        {blocked && (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            data-export-size-block
          >
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Export bloqueado: {eligibleCount.toLocaleString()} supera el
              límite de {POI_EXPORT_SIZE_THRESHOLDS.block.toLocaleString()} POIs
              por descarga.
            </span>
          </div>
        )}
      </div>

      <Separator />

      {/* Quick export for apps (KML targets) */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Exportar para aplicación</p>
        <div className="grid gap-2">
          <Button
            variant="outline"
            onClick={() => handleExport('kml', 'mymaps')}
            disabled={disableButtons}
            className="justify-start gap-3 h-auto py-3"
          >
            <MapIcon className="w-5 h-5 text-blue-500" />
            <div className="text-left">
              <div className="font-medium">Google My Maps</div>
              <div className="text-xs text-muted-foreground">KML optimizado · {eligibleCount} puntos</div>
            </div>
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport('kml', 'gurumaps')}
            disabled={disableButtons}
            className="justify-start gap-3 h-auto py-3"
          >
            <Mountain className="w-5 h-5 text-emerald-500" />
            <div className="text-left">
              <div className="font-medium">Guru Maps</div>
              <div className="text-xs text-muted-foreground">KML compatible · {eligibleCount} puntos</div>
            </div>
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-sm font-medium">Exportar ({eligibleCount} elegibles)</p>
        <div className="flex flex-wrap gap-2" data-export-formats>
          {FORMATS.map((format) => (
            <Button
              key={format}
              variant="outline"
              size="sm"
              onClick={() => handleExport(format)}
              disabled={disableButtons}
              className="gap-2"
              data-export-format={format}
            >
              {formatIcons[format]}
              {formatLabels[format]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
