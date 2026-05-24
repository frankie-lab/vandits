/**
 * ExportResolver — UX canónica de exportación de POIs (PR-EXPORT-3).
 *
 * Sustituye dos UIs distintas (`ExportPanel` original + dropdown de
 * export en `SelectionActions`) por un único componente amable, con
 * resumen humano y sin lenguaje destructivo.
 *
 * Reglas duras:
 *   - Export NUNCA usa typed-token. CTA = "Generar archivo".
 *   - Copy siempre afirma propiedad ("son tuyas, esto es una copia").
 *   - Pipeline canónico intacto: `previewPoiExport` + `runPoiExport`
 *     + `downloadPoiExportBlob` + `useExportTracking`.
 *   - Sólo formatos con serializer real (KML/CSV/JSON/GeoJSON).
 *   - GPX no aparece (sin serializer).
 *
 * Dos puntos de montaje:
 *   - `<ExportResolverBody>` — inline, para paneles laterales.
 *   - `<ExportResolverDialog>` — Dialog, para acciones de selección.
 *
 * Ver `docs/contracts/poi-export-canon.md` § PR-EXPORT-3.
 */
import React, { useMemo, useState } from 'react';
import {
  FileCode,
  FileSpreadsheet,
  FileJson,
  Globe2,
  Map as MapIcon,
  Mountain,
  Info,
  Loader2,
  Check,
  Clock,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAuth } from '@/domains/identity';
import { useExportTracking } from '@/hooks/use-export-tracking';
import type { GeoLocation } from '@/types/location';
import {
  type ExportExclusionReason,
} from '@/domains/content/lib/poi-export-eligibility';
import {
  runPoiExport,
  previewPoiExport,
  downloadPoiExportBlob,
  type PoiExportOrigin,
} from '@/domains/content/lib/poi-export-pipeline';
import {
  POI_EXPORTERS,
} from '@/domains/content/lib/exporters';
import {
  POI_EXPORT_SIZE_THRESHOLDS,
  PoiExportSizeError,
  type PoiExportFormat,
  type PoiExportScope,
} from '@/domains/content/lib/poi-export-record';

// --------------------------------------------------------------------
// Source descriptor
// --------------------------------------------------------------------

export type ExportResolverSourceKind =
  | 'selection'
  | 'filters'
  | 'collection'
  | 'explicit';

export interface ExportResolverSource {
  kind: ExportResolverSourceKind;
  /** Etiqueta humana del origen ("Selección actual", "Filtros activos", ...). */
  label: string;
  /** POIs candidatos resueltos por el caller. */
  locations: GeoLocation[];
  /** Metadatos opcionales de colección (sólo KML los usa). */
  collection?: { id: string; name: string; description?: string };
  /** Nombre sugerido para el archivo. */
  documentName?: string;
}

export interface ExportResolverProps {
  source: ExportResolverSource;
  initialScope?: PoiExportScope;
  initialFormat?: PoiExportFormat;
  initialKmlTarget?: 'general' | 'mymaps' | 'gurumaps';
  /** Sólo dialog: callback al cerrar. */
  onClose?: () => void;
}

// --------------------------------------------------------------------
// Copy canon (sin lenguaje destructivo) — PR-EXPORT-4 scope-aware
// --------------------------------------------------------------------

/**
 * PR-EXPORT-4: copy y contadores SON DISTINTOS por scope.
 *
 *  - 'internal' (Mis datos): exporta TODO POI propio con coords válidas.
 *    Las únicas razones legítimas son `invalid-coordinates` y
 *    `not-owner`. Cualquier otra razón sería un bug del partition; se
 *    muestra defensivamente bajo "Errores técnicos".
 *    Prohibido leer "No incluidos" como si Vandits retuviese POIs
 *    propios — los `not-owner` se separan en su propia fila y los
 *    técnicos en otra.
 *
 *  - 'public' (Compartible): se mantiene el desglose completo por
 *    razón pública.
 */
const REASON_HUMAN_PUBLIC: Record<ExportExclusionReason, string> = {
  'invalid-coordinates': 'Coordenadas inválidas',
  'not-owner': 'Pertenece a otra persona',
  'not-enriched': 'Aún sin ficha',
  'editorial-only-1b': 'Sólo material editorial',
  'not-shareable': 'No listo para compartir',
  'curation-level-below-9': 'Aún en proceso de curación',
};

const SCOPE_COPY = {
  internal: {
    ownership:
      'Vandits creará una copia. Tus ubicaciones seguirán aquí.',
    totalLabel: 'Tus ubicaciones',
    eligibleLabel: 'Exportables',
    technicalLabel: 'No exportables por error técnico',
    foreignLabel: 'pertenecen a otras personas',
    foreignHint:
      'No se exportan en Mis datos. Cambia a Compartible para tratarlas como POIs de terceros.',
  },
  public: {
    ownership:
      'Vandits creará una copia portable. Tus ubicaciones seguirán disponibles en Vandits.',
    totalLabel: 'Total candidatos',
    eligibleLabel: 'Compartibles',
    excludedLabel: 'No compartibles públicamente',
  },
} as const;

const FORMAT_META: Record<
  PoiExportFormat,
  { label: string; purpose: string; icon: React.ReactNode }
> = {
  kml: {
    label: 'KML',
    purpose: 'Google My Maps, GuruMaps, Earth',
    icon: <FileCode className="w-4 h-4" />,
  },
  csv: {
    label: 'CSV',
    purpose: 'Excel, Numbers, análisis tabular',
    icon: <FileSpreadsheet className="w-4 h-4" />,
  },
  json: {
    label: 'JSON',
    purpose: 'Backup técnico o integración',
    icon: <FileJson className="w-4 h-4" />,
  },
  geojson: {
    label: 'GeoJSON',
    purpose: 'QGIS, Kepler, Mapbox',
    icon: <Globe2 className="w-4 h-4" />,
  },
};

const ORIGIN_BY_KIND: Record<ExportResolverSourceKind, PoiExportOrigin> = {
  selection: 'selection',
  filters: 'panel',
  collection: 'panel',
  explicit: 'panel',
};

// Estimación grosera de tamaño en KB por POI por formato.
const SIZE_PER_POI_KB: Record<PoiExportFormat, number> = {
  kml: 1.4,
  csv: 0.6,
  json: 1.2,
  geojson: 1.0,
};

function formatBytes(kb: number): string {
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// --------------------------------------------------------------------
// Body
// --------------------------------------------------------------------

export function ExportResolverBody({
  source,
  initialScope = 'internal',
  initialFormat = 'kml',
  initialKmlTarget = 'general',
  onClose,
}: ExportResolverProps) {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const { recordExport, lastExport, formatLastExportTime } = useExportTracking();

  const [scope, setScope] = useState<PoiExportScope>(initialScope);
  const [format, setFormat] = useState<PoiExportFormat>(initialFormat);
  const [kmlTarget, setKmlTarget] = useState(initialKmlTarget);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmedLarge, setConfirmedLarge] = useState(false);
  const [showExclusionDetails, setShowExclusionDetails] = useState(false);

  // Whenever scope changes, reset the "large confirm" gate.
  React.useEffect(() => {
    setConfirmedLarge(false);
  }, [scope]);

  const preview = useMemo(
    () =>
      previewPoiExport({
        locations: source.locations,
        format,
        scope,
        ctx: { currentUserId },
      }),
    [source.locations, format, scope, currentUserId],
  );

  const exclusionGroups = useMemo(() => {
    const map = new Map<ExportExclusionReason, number>();
    for (const e of preview.excluded) {
      map.set(e.reason, (map.get(e.reason) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [preview.excluded]);

  const internalDisabled = scope === 'internal' && !currentUserId;
  const sizeLevel = preview.sizeVerdict.level;
  const isLarge = sizeLevel === 'warn';
  const isBlocked = sizeLevel === 'block';
  const estimatedKb = preview.eligibleCount * SIZE_PER_POI_KB[format];

  const canGenerate =
    !isExporting &&
    !isBlocked &&
    !internalDisabled &&
    preview.eligibleCount > 0 &&
    (!isLarge || confirmedLarge);

  const docName =
    source.documentName ||
    source.collection?.name ||
    (source.kind === 'selection' ? 'seleccion' : 'export');

  async function handleGenerate() {
    if (preview.eligibleCount === 0) return;
    setIsExporting(true);
    try {
      const outcome = runPoiExport(
        {
          locations: source.locations,
          format,
          scope,
          ctx: { currentUserId },
          documentName: docName,
          target: format === 'kml' ? kmlTarget : undefined,
          origin: ORIGIN_BY_KIND[source.kind],
          collection: source.collection,
        },
        { confirmedOverWarn: true },
      );

      if (outcome.kind === 'no-eligible') {
        toast.error('No hay ubicaciones elegibles con este alcance.');
        return;
      }
      if (outcome.kind === 'warn-pending') {
        // No debería ocurrir (pasamos confirmedOverWarn:true), pero por
        // si acaso reintentamos.
        toast.message('Confirma el tamaño antes de generar.');
        return;
      }

      downloadPoiExportBlob(outcome);
      recordExport(format, kmlTarget, outcome.exportedIds, {
        scope,
        origin: ORIGIN_BY_KIND[source.kind],
        excludedCount: outcome.excludedCount,
        success: true,
      });
      toast.success(
        `Archivo generado · ${outcome.eligibleCount} ubicaciones en ${FORMAT_META[format].label}`,
      );
      onClose?.();
    } catch (err) {
      if (err instanceof PoiExportSizeError) {
        toast.error(
          `Demasiadas ubicaciones (${err.verdict.count.toLocaleString()}). Reduce el alcance para generar el archivo.`,
        );
      } else {
        console.error('[ExportResolver] error', err);
        toast.error('No se pudo generar el archivo. Inténtalo de nuevo.');
      }
      recordExport(format, kmlTarget, [], {
        scope,
        origin: ORIGIN_BY_KIND[source.kind],
        excludedCount: preview.excludedCount,
        success: false,
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-4" data-export-resolver="v1" data-export-source-kind={source.kind}>
      {/* Promesa de propiedad — copy obligatorio */}
      <p className="text-sm text-muted-foreground leading-relaxed" data-export-ownership-copy>
        Vandits creará una copia portable. Tus ubicaciones seguirán disponibles en Vandits.
      </p>

      {/* Resumen del origen */}
      <div
        className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-sm"
        data-export-summary
      >
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Origen</span>
          <span className="font-medium">{source.label}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total candidatos</span>
          <span className="font-medium" data-export-total-count>
            {preview.totalCount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Elegibles</span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400" data-export-eligible-count>
            {preview.eligibleCount.toLocaleString()}
          </span>
        </div>
        {preview.excludedCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">No incluidos</span>
            <span className="font-medium" data-export-excluded-count>
              {preview.excludedCount.toLocaleString()}
            </span>
          </div>
        )}
        {preview.eligibleCount > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>Tamaño estimado</span>
            <span>~{formatBytes(estimatedKb)}</span>
          </div>
        )}
      </div>

      {/* Scope */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Alcance</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setScope('internal')}
            disabled={!currentUserId}
            className={`text-left rounded-lg border p-3 transition-colors disabled:opacity-50 ${
              scope === 'internal'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            }`}
            data-export-scope-option="internal"
            aria-pressed={scope === 'internal'}
          >
            <div className="text-sm font-medium">Mis datos</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Todas tus ubicaciones, completas.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setScope('public')}
            className={`text-left rounded-lg border p-3 transition-colors ${
              scope === 'public'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            }`}
            data-export-scope-option="public"
            aria-pressed={scope === 'public'}
          >
            <div className="text-sm font-medium">Compartible</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Sólo lo que cualquiera puede ver.
            </div>
          </button>
        </div>
        {internalDisabled && (
          <p className="text-xs text-muted-foreground">
            Inicia sesión para exportar tus datos completos.
          </p>
        )}
      </div>

      {/* Formato */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Formato</p>
        <div className="grid grid-cols-2 gap-2" data-export-formats>
          {(Object.keys(POI_EXPORTERS) as PoiExportFormat[]).map((f) => {
            const meta = FORMAT_META[f];
            const active = format === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}
                data-export-format={f}
                aria-pressed={active}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {meta.icon}
                  {meta.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {meta.purpose}
                </div>
              </button>
            );
          })}
        </div>

        {/* KML sub-target — sólo si format=kml */}
        {format === 'kml' && (
          <div className="flex flex-wrap gap-1.5 pt-1" data-export-kml-target>
            {(
              [
                { id: 'general', label: 'General', icon: <FileCode className="w-3.5 h-3.5" /> },
                { id: 'mymaps', label: 'Google My Maps', icon: <MapIcon className="w-3.5 h-3.5" /> },
                { id: 'gurumaps', label: 'GuruMaps', icon: <Mountain className="w-3.5 h-3.5" /> },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKmlTarget(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  kmlTarget === t.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
                aria-pressed={kmlTarget === t.id}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Razones de exclusión (colapsado por defecto) */}
      {exclusionGroups.length > 0 && (
        <div className="space-y-2" data-export-exclusion-details>
          <button
            type="button"
            onClick={() => setShowExclusionDetails((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            {showExclusionDetails ? 'Ocultar detalles' : 'Ver detalles de no incluidos'}
          </button>
          {showExclusionDetails && (
            <ul className="text-xs space-y-1 pl-1" data-export-exclusion-list>
              {exclusionGroups.map(([reason, n]) => (
                <li
                  key={reason}
                  className="flex items-center justify-between rounded border border-border/50 px-2 py-1.5"
                  data-export-exclusion-reason={reason}
                >
                  <span className="text-muted-foreground">{REASON_HUMAN[reason]}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {n}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Aviso de tamaño grande (5k–10k) — calmado, sin typed-token */}
      {isLarge && !isBlocked && (
        <div
          className="rounded-lg border border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs space-y-2"
          data-export-size-large
        >
          <div className="flex items-start gap-2 text-amber-900 dark:text-amber-100">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">
                Vas a generar un archivo con {preview.eligibleCount.toLocaleString()} ubicaciones.
              </p>
              <p className="text-amber-800/80 dark:text-amber-200/80">
                Puede tardar unos segundos. El archivo se descargará automáticamente.
              </p>
            </div>
          </div>
          {!confirmedLarge && (
            <label className="flex items-center gap-2 cursor-pointer text-amber-900 dark:text-amber-100">
              <input
                type="checkbox"
                checked={confirmedLarge}
                onChange={(e) => setConfirmedLarge(e.target.checked)}
                className="h-3.5 w-3.5"
                data-export-confirm-large
              />
              <span>Entiendo, continuar</span>
            </label>
          )}
        </div>
      )}

      {/* Bloqueo amable (>10k) — sin lenguaje destructivo */}
      {isBlocked && (
        <div
          className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs"
          data-export-size-blocked
        >
          <p className="font-medium text-sm">
            Demasiadas ubicaciones para un solo archivo
          </p>
          <p className="text-muted-foreground">
            Has seleccionado {preview.eligibleCount.toLocaleString()} ubicaciones. Para
            mantener el archivo manejable, sugerimos dividirlo:
          </p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1" data-export-blocked-alternatives>
            <li>Reduce los filtros activos.</li>
            <li>Exporta por país o región.</li>
            <li>Exporta por colección.</li>
          </ul>
        </div>
      )}

      {/* Last export — info opcional */}
      {lastExport && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-export-last-info>
          <Clock className="w-3.5 h-3.5" />
          <span>
            Última exportación: {formatLastExportTime()} · {lastExport.locationCount.toLocaleString()} ubicaciones
          </span>
        </div>
      )}

      <Separator />

      {/* Acciones */}
      <div className="flex items-center justify-end gap-2">
        {onClose && (
          <Button type="button" variant="ghost" onClick={onClose} disabled={isExporting}>
            Cancelar
          </Button>
        )}
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          data-export-generate-cta
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Preparando archivo…
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Generar archivo
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------
// Dialog wrapper
// --------------------------------------------------------------------

export interface ExportResolverDialogProps extends ExportResolverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportResolverDialog({
  open,
  onOpenChange,
  ...rest
}: ExportResolverDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-export-resolver-dialog>
        <DialogHeader>
          <DialogTitle>Exportar tus ubicaciones</DialogTitle>
          <DialogDescription className="sr-only">
            Genera una copia portable de tus ubicaciones en el formato que elijas.
          </DialogDescription>
        </DialogHeader>
        <ExportResolverBody
          {...rest}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
