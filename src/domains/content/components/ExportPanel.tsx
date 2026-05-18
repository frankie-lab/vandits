import React, { useMemo, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, FileCode, Map as MapIcon, Mountain, Clock, AlertCircle, Check, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocationsStore } from '@/domains/content';
import { useAuth } from '@/domains/identity';
import { exportToKML, exportToCSV, exportToJSON } from '@/lib/kml-parser';
import { ExportFormat } from '@/types/location';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useExportTracking } from '@/hooks/use-export-tracking';
import {
  partitionForExport,
  EXPORT_EXCLUSION_LABEL,
  type ExportScope,
  type ExportExclusionReason,
} from '@/domains/content/lib/poi-export-eligibility';

const formatIcons: Record<ExportFormat, React.ReactNode> = {
  kml: <FileCode className="w-4 h-4" />,
  csv: <FileSpreadsheet className="w-4 h-4" />,
  json: <FileJson className="w-4 h-4" />,
};

const formatLabels: Record<ExportFormat, string> = {
  kml: 'KML',
  csv: 'CSV',
  json: 'JSON',
};

type ExportTarget = 'mymaps' | 'gurumaps' | 'general';

export function ExportPanel() {
  const { selectedDocument, selectedLocations, getFilteredLocations } = useLocationsStore();
  const [isExporting, setIsExporting] = useState(false);
  const [scope, setScope] = useState<ExportScope>('public');
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const {
    lastExport,
    modifiedCount,
    recordExport,
    formatLastExportTime,
  } = useExportTracking();

  const candidateLocations = useMemo(() => {
    if (!selectedDocument) return [];
    return selectedLocations.size > 0
      ? selectedDocument.locations.filter((l) => selectedLocations.has(l.id))
      : getFilteredLocations();
  }, [selectedDocument, selectedLocations, getFilteredLocations]);

  const partition = useMemo(
    () => partitionForExport(candidateLocations, scope, { currentUserId }),
    [candidateLocations, scope, currentUserId],
  );

  const exclusionGroups = useMemo(() => {
    const map = new Map<ExportExclusionReason, number>();
    for (const e of partition.excluded) {
      map.set(e.reason, (map.get(e.reason) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [partition.excluded]);

  const eligibleCount = partition.eligible.length;
  const totalCount = candidateLocations.length;

  const internalDisabled = scope === 'internal' && !currentUserId;

  const handleExport = async (format: ExportFormat, target: ExportTarget = 'general') => {
    if (!selectedDocument) {
      toast.error('No hay documento seleccionado');
      return;
    }
    if (internalDisabled) {
      toast.error('Inicia sesión para exportar en modo interno');
      return;
    }
    if (eligibleCount === 0) {
      toast.error(
        scope === 'public'
          ? 'Ningún POI cumple el contrato público (POI-9/10 + compartible)'
          : 'Ningún POI exportable en modo interno (requiere ser del usuario actual)',
      );
      return;
    }

    setIsExporting(true);
    try {
      const ctx = { currentUserId };
      let content: string;
      let mimeType: string;
      let extension: string;

      switch (format) {
        case 'kml':
          content = exportToKML(partition.eligible, selectedDocument.name, target, scope, ctx, { scopeProvided: true });
          mimeType = 'application/vnd.google-earth.kml+xml';
          extension = 'kml';
          break;
        case 'csv':
          content = exportToCSV(partition.eligible, scope, ctx, { scopeProvided: true });
          mimeType = 'text/csv';
          extension = 'csv';
          break;
        case 'json':
          content = exportToJSON(partition.eligible, scope, ctx, { scopeProvided: true });
          mimeType = 'application/json';
          extension = 'json';
          break;
      }

      const targetSuffix = target !== 'general' ? `_${target}` : '';
      const scopeSuffix = `_${scope}`;
      const timestamp = new Date().toISOString().split('T')[0];
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedDocument.name}${scopeSuffix}${targetSuffix}_${timestamp}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      recordExport(format, target, partition.eligible.map((l) => l.id));
      const excludedNote = partition.excluded.length > 0 ? ` (${partition.excluded.length} excluidos)` : '';
      toast.success(`Exportados ${eligibleCount} POIs en ${format.toUpperCase()}${excludedNote}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
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
        <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Elegibles</span>
          <span className="font-medium">
            {eligibleCount} / {totalCount}
          </span>
        </div>
        {exclusionGroups.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ShieldAlert className="w-3.5 h-3.5" />
              {partition.excluded.length} excluidos · ver razones
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
      </div>

      <Separator />

      {/* Quick export for apps */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Exportar para aplicación</p>
        <div className="grid gap-2">
          <Button
            variant="outline"
            onClick={() => handleExport('kml', 'mymaps')}
            disabled={!selectedDocument || isExporting || eligibleCount === 0 || internalDisabled}
            className="justify-start gap-3 h-auto py-3"
          >
            <Map className="w-5 h-5 text-blue-500" />
            <div className="text-left">
              <div className="font-medium">Google My Maps</div>
              <div className="text-xs text-muted-foreground">KML optimizado · {eligibleCount} puntos</div>
            </div>
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport('kml', 'gurumaps')}
            disabled={!selectedDocument || isExporting || eligibleCount === 0 || internalDisabled}
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
        <div className="flex flex-wrap gap-2">
          {(['kml', 'csv', 'json'] as ExportFormat[]).map((format) => (
            <Button
              key={format}
              variant="outline"
              size="sm"
              onClick={() => handleExport(format)}
              disabled={!selectedDocument || isExporting || eligibleCount === 0 || internalDisabled}
              className="gap-2"
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
