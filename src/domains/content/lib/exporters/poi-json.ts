/**
 * PR-EXPORT-2 — Serializer JSON v2.
 *
 * BREAKING CHANGE respecto a la versión legacy de `kml-parser.ts` que
 * volcaba `GeoLocation` completo. El marker `export_format_version` lo
 * señaliza explícitamente.
 *
 * Envelope canónico:
 * {
 *   "export_format_version": "poi-export-json-v2",
 *   "scope": "public" | "internal",
 *   "generatedAt": "<ISO-8601>",
 *   "collection": { "id", "name", "description"? } | null,
 *   "count": <n>,
 *   "items": PoiExportRecord[]
 * }
 *
 * DTO-only: NUNCA lee `GeoLocation`. Comunicar el cambio en
 * release notes / README según convención del proyecto.
 */

import {
  POI_EXPORT_FORMAT_VERSION,
  POI_EXPORT_SIZE_THRESHOLDS,
  PoiExportSizeError,
  assertPoiExportRecords,
  evaluatePoiExportSize,
  type PoiExportRecord,
  type PoiExportScope,
} from '../poi-export-record';

export interface SerializePoiJsonOptions {
  scope: PoiExportScope;
  collection?: { id: string; name: string; description?: string };
  /** Inyectable en tests para snapshot estable. */
  generatedAt?: string;
  pretty?: boolean;
}

export interface PoiJsonEnvelope {
  export_format_version: typeof POI_EXPORT_FORMAT_VERSION.json;
  scope: PoiExportScope;
  generatedAt: string;
  collection: { id: string; name: string; description?: string } | null;
  count: number;
  items: PoiExportRecord[];
}

export function buildPoiJsonEnvelope(
  records: PoiExportRecord[],
  options: SerializePoiJsonOptions,
): PoiJsonEnvelope {
  assertPoiExportRecords(records, 'buildPoiJsonEnvelope');
  return {
    export_format_version: POI_EXPORT_FORMAT_VERSION.json,
    scope: options.scope,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    collection: options.collection ?? null,
    count: records.length,
    items: records,
  };
}

export function serializePoiJson(
  records: PoiExportRecord[],
  options: SerializePoiJsonOptions,
): string {
  assertPoiExportRecords(records, 'serializePoiJson');
  const verdict = evaluatePoiExportSize(records.length);
  if (verdict.level === 'block') throw new PoiExportSizeError(verdict);

  const envelope = buildPoiJsonEnvelope(records, options);
  return options.pretty === false
    ? JSON.stringify(envelope)
    : JSON.stringify(envelope, null, 2);
}

export const POI_JSON_META = {
  extension: 'json',
  mime: 'application/json',
  defaultScope: 'public' as PoiExportScope,
  limits: POI_EXPORT_SIZE_THRESHOLDS,
  formatVersion: POI_EXPORT_FORMAT_VERSION.json,
};
