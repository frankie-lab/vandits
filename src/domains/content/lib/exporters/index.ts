/**
 * PR-EXPORT-2 — Registry de serializers de POI.
 *
 * Todos los serializers son DTO-only (consumen `PoiExportRecord[]`) y
 * comparten:
 *   - default scope `public`;
 *   - límites 5k warning / 10k block (`evaluatePoiExportSize`);
 *   - extension + mime + formatVersion (cuando aplica).
 *
 * Pipeline esperado por el caller:
 *   GeoLocation[]
 *     → permissions check
 *     → evaluatePoiExport (split eligible/excluded)
 *     → mapToPoiExportRecords(eligible, scope)
 *     → serialize[format](records, opts)
 *     → Blob → download
 *     → tracking
 */

import {
  POI_CSV_META,
  serializePoiCsv,
  type SerializePoiCsvOptions,
} from './poi-csv';
import {
  POI_KML_META,
  serializePoiKml,
  type KmlExportTarget,
  type SerializePoiKmlOptions,
} from './poi-kml';
import {
  POI_JSON_META,
  serializePoiJson,
  buildPoiJsonEnvelope,
  type SerializePoiJsonOptions,
  type PoiJsonEnvelope,
} from './poi-json';
import {
  POI_GEOJSON_META,
  serializePoiGeoJson,
  buildPoiGeoJsonEnvelope,
  type SerializePoiGeoJsonOptions,
  type GeoJsonFeatureCollection,
} from './poi-geojson';
import type {
  PoiExportFormat,
  PoiExportRecord,
  PoiExportScope,
} from '../poi-export-record';

export interface PoiExporterMeta {
  extension: string;
  mime: string;
  defaultScope: PoiExportScope;
  limits: { warn: number; block: number };
  formatVersion?: string;
}

export const POI_EXPORTERS: Record<PoiExportFormat, PoiExporterMeta> = {
  csv: POI_CSV_META,
  kml: POI_KML_META,
  json: POI_JSON_META,
  geojson: POI_GEOJSON_META,
};

export {
  serializePoiCsv,
  serializePoiKml,
  serializePoiJson,
  serializePoiGeoJson,
  buildPoiJsonEnvelope,
  buildPoiGeoJsonEnvelope,
};

export type {
  SerializePoiCsvOptions,
  SerializePoiKmlOptions,
  SerializePoiJsonOptions,
  SerializePoiGeoJsonOptions,
  KmlExportTarget,
  PoiJsonEnvelope,
  GeoJsonFeatureCollection,
  PoiExportRecord,
  PoiExportFormat,
  PoiExportScope,
};
