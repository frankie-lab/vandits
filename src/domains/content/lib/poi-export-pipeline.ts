/**
 * PR-EXPORT-2 — Pipeline canónico de export (Fase 3 UX).
 *
 * Único orquestador del flujo:
 *
 *   GeoLocation[]
 *     → partitionForExport (PR-EXPORT-1, eligibility + scope gate)
 *     → evaluatePoiExportSize (5k warn / 10k block)
 *     → mapToPoiExportRecords (DTO)
 *     → POI_EXPORTERS[format] (serializer)
 *     → Blob → download
 *     → recordExport (tracking)
 *
 * Todo call site de UX (ExportPanel, SelectionActions, futuros popups con
 * "export single POI") DEBE pasar por aquí. NUNCA importar serializers
 * directamente fuera de este módulo + tests.
 *
 * Boundary con dominio sharing:
 *   - Este módulo vive en `domains/content/lib/` y NO debe importarse desde
 *     `domains/sharing/**`. ShareSheet sólo puede abrir ExportPanel.
 *
 * Ver `docs/contracts/pr-export-2-poi-export-canon.md`.
 */

import type { GeoLocation } from '@/types/location';
import {
  partitionForExport,
  type ExportExclusionReason,
  type ExportScope,
} from '@/domains/content/lib/poi-export-eligibility';
import { mapToPoiExportRecords } from '@/domains/content/lib/poi-export-mapper';
import {
  POI_EXPORTERS,
  serializePoiCsv,
  serializePoiKml,
  serializePoiJson,
  serializePoiGeoJson,
  type KmlExportTarget,
} from '@/domains/content/lib/exporters';
import {
  evaluatePoiExportSize,
  PoiExportSizeError,
  type PoiExportFormat,
  type PoiExportRecord,
  type PoiExportScope,
  type PoiExportSizeVerdict,
} from '@/domains/content/lib/poi-export-record';

export type PoiExportOrigin = 'panel' | 'selection' | 'popup';

export interface PoiExportCollectionEnvelope {
  id: string;
  name: string;
  description?: string;
}

export interface PoiExportPipelineInput {
  locations: GeoLocation[];
  format: PoiExportFormat;
  scope: PoiExportScope;
  ctx: { currentUserId: string | null };
  documentName: string;
  /** Sólo KML — `mymaps` | `gurumaps` | `general`. */
  target?: KmlExportTarget;
  collection?: PoiExportCollectionEnvelope;
  origin: PoiExportOrigin;
}

export interface PoiExportPipelinePartition {
  eligible: GeoLocation[];
  excluded: Array<{ locationId: string; reason: ExportExclusionReason }>;
  eligibleCount: number;
  excludedCount: number;
  totalCount: number;
}

export interface PoiExportPipelinePreview extends PoiExportPipelinePartition {
  sizeVerdict: PoiExportSizeVerdict;
}

export interface PoiExportPipelineResult {
  kind: 'ok';
  blob: Blob;
  filename: string;
  mime: string;
  extension: string;
  format: PoiExportFormat;
  scope: PoiExportScope;
  target?: KmlExportTarget;
  origin: PoiExportOrigin;
  eligibleCount: number;
  excludedCount: number;
  /** IDs exportados — usados por `recordExport`. NUNCA contenido. */
  exportedIds: string[];
  sizeVerdict: PoiExportSizeVerdict;
}

export type PoiExportPipelineOutcome =
  | PoiExportPipelineResult
  | { kind: 'no-eligible'; partition: PoiExportPipelinePartition }
  | { kind: 'warn-pending'; partition: PoiExportPipelinePartition; sizeVerdict: PoiExportSizeVerdict };

/** Evalúa elegibilidad + tamaño sin serializar. UI lo usa para preview. */
export function previewPoiExport(
  input: Omit<PoiExportPipelineInput, 'origin' | 'documentName'> & {
    documentName?: string;
  },
): PoiExportPipelinePreview {
  const partition = partitionForExport(input.locations, input.scope as ExportScope, input.ctx);
  const sizeVerdict = evaluatePoiExportSize(partition.eligible.length);
  return {
    eligible: partition.eligible,
    excluded: partition.excluded,
    eligibleCount: partition.eligible.length,
    excludedCount: partition.excluded.length,
    totalCount: input.locations.length,
    sizeVerdict,
  };
}

function formatFilename(opts: {
  documentName: string;
  scope: PoiExportScope;
  target?: KmlExportTarget;
  extension: string;
  origin: PoiExportOrigin;
}): string {
  const safeBase = (opts.documentName || 'export').replace(/[\\/:*?"<>|]+/g, '_');
  const originSuffix = opts.origin === 'selection' ? '_seleccion' : '';
  const targetSuffix = opts.target && opts.target !== 'general' ? `_${opts.target}` : '';
  const scopeSuffix = `_${opts.scope}`;
  const timestamp = new Date().toISOString().split('T')[0];
  return `${safeBase}${originSuffix}${scopeSuffix}${targetSuffix}_${timestamp}.${opts.extension}`;
}

function serialize(
  records: PoiExportRecord[],
  input: PoiExportPipelineInput,
): string {
  switch (input.format) {
    case 'csv':
      return serializePoiCsv(records, { scope: input.scope, collection: input.collection });
    case 'kml':
      return serializePoiKml(records, {
        scope: input.scope,
        documentName: input.documentName,
        target: input.target ?? 'general',
        collection: input.collection,
      });
    case 'json':
      return serializePoiJson(records, { scope: input.scope, collection: input.collection });
    case 'geojson':
      return serializePoiGeoJson(records, { scope: input.scope, collection: input.collection });
  }
}

/**
 * Ejecuta el pipeline completo. Devuelve `no-eligible` o `warn-pending`
 * sin serializar cuando corresponda. Lanza `PoiExportSizeError` si el
 * eligibleCount supera `block`.
 *
 * NOTA: `partitionForExport` ya filtra POIs no elegibles, garantizando
 * que los serializers JAMÁS reciban POIs no autorizados.
 */
export function runPoiExport(
  input: PoiExportPipelineInput,
  opts: { confirmedOverWarn?: boolean } = {},
): PoiExportPipelineOutcome {
  const meta = POI_EXPORTERS[input.format];
  if (!meta) {
    throw new Error(`[poi-export] formato no soportado: ${String(input.format)}`);
  }
  const partition = partitionForExport(input.locations, input.scope as ExportScope, input.ctx);
  const eligibleCount = partition.eligible.length;
  const excludedCount = partition.excluded.length;
  const totalCount = input.locations.length;
  const sizeVerdict = evaluatePoiExportSize(eligibleCount);

  if (eligibleCount === 0) {
    return {
      kind: 'no-eligible',
      partition: {
        eligible: partition.eligible,
        excluded: partition.excluded,
        eligibleCount,
        excludedCount,
        totalCount,
      },
    };
  }

  if (sizeVerdict.level === 'block') {
    // Defensa adicional: el serializer también lanza, pero abortamos antes
    // del mapper para no malgastar trabajo.
    throw new PoiExportSizeError(sizeVerdict);
  }

  if (sizeVerdict.level === 'warn' && !opts.confirmedOverWarn) {
    return {
      kind: 'warn-pending',
      partition: {
        eligible: partition.eligible,
        excluded: partition.excluded,
        eligibleCount,
        excludedCount,
        totalCount,
      },
      sizeVerdict,
    };
  }

  const records = mapToPoiExportRecords(partition.eligible, input.scope);
  const content = serialize(records, input);
  const blob = new Blob([content], { type: meta.mime });
  const filename = formatFilename({
    documentName: input.documentName,
    scope: input.scope,
    target: input.target,
    extension: meta.extension,
    origin: input.origin,
  });

  return {
    kind: 'ok',
    blob,
    filename,
    mime: meta.mime,
    extension: meta.extension,
    format: input.format,
    scope: input.scope,
    target: input.target,
    origin: input.origin,
    eligibleCount,
    excludedCount,
    exportedIds: partition.eligible.map((l) => l.id),
    sizeVerdict,
  };
}

/**
 * Descarga el blob mediante DOM. Aislado en helper para tests.
 */
export function downloadPoiExportBlob(result: PoiExportPipelineResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
