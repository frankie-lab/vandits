/**
 * PR-EXPORT-2 — Serializer CSV.
 *
 * DTO-only: recibe `PoiExportRecord[]`. NUNCA lee `GeoLocation`.
 *
 * RFC 4180:
 *   - separador `,`
 *   - escape `"` → `""`
 *   - todos los campos entre comillas dobles
 *   - line ending `\n`
 *
 * `description` se serializa en plaintext (sin sanitización XML).
 */

import {
  POI_EXPORT_SIZE_THRESHOLDS,
  PoiExportSizeError,
  assertPoiExportRecords,
  evaluatePoiExportSize,
  type PoiExportRecord,
  type PoiExportScope,
} from '../poi-export-record';

export interface SerializePoiCsvOptions {
  scope: PoiExportScope;
  collection?: { id: string; name: string; description?: string };
}

const BASE_HEADERS_PUBLIC = [
  'id',
  'name',
  'description',
  'latitude',
  'longitude',
  'altitude',
  'continent',
  'country',
  'region',
  'zone',
  'image_url',
  'tags',
  'export_scope',
] as const;

const BASE_HEADERS_INTERNAL = [
  ...BASE_HEADERS_PUBLIC,
  'poi_level',
  'root_status',
  'enrichment_status',
  'geo_health',
] as const;

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

export function serializePoiCsv(
  records: PoiExportRecord[],
  options: SerializePoiCsvOptions,
): string {
  assertPoiExportRecords(records, 'serializePoiCsv');
  const verdict = evaluatePoiExportSize(records.length);
  if (verdict.level === 'block') throw new PoiExportSizeError(verdict);

  const { scope, collection } = options;
  const headers: string[] =
    scope === 'internal'
      ? [...BASE_HEADERS_INTERNAL]
      : [...BASE_HEADERS_PUBLIC];

  // Columnas opcionales de colección (no envelope formal en CSV — el
  // envelope formal aplica a JSON/GeoJSON/KML).
  if (collection) {
    headers.push('collection_id', 'collection_name');
  }

  // Columnas dinámicas por `customData` allowlist presente.
  const customKeys = new Set<string>();
  for (const r of records) {
    if (r.customData) for (const k of Object.keys(r.customData)) customKeys.add(k);
  }
  const customHeaders = Array.from(customKeys).sort();
  headers.push(...customHeaders);


  const rows: string[] = [headers.join(',')];

  for (const r of records) {
    const row: string[] = [
      escapeCsv(r.id),
      escapeCsv(r.name),
      escapeCsv(r.content.description ?? ''),
      escapeCsv(r.coordinates.latitude),
      escapeCsv(r.coordinates.longitude),
      escapeCsv(r.coordinates.altitude ?? ''),
      escapeCsv(r.geography.continent ?? ''),
      escapeCsv(r.geography.country ?? ''),
      escapeCsv(r.geography.region ?? ''),
      escapeCsv(r.geography.zone ?? ''),
      escapeCsv(r.content.imageUrl ?? ''),
      escapeCsv(r.content.tags ? r.content.tags.join(', ') : ''),
      escapeCsv(r.exportScope),
    ];

    if (scope === 'internal') {
      row.push(
        escapeCsv(r.classification?.poiLevel ?? ''),
        escapeCsv(r.classification?.rootStatus ?? ''),
        escapeCsv(r.enrichmentStatus ?? ''),
        escapeCsv(r.geoHealth ?? ''),
      );
    }

    if (collection) {
      row.push(escapeCsv(collection.id), escapeCsv(collection.name));
    }

    for (const k of customHeaders) {
      row.push(escapeCsv(r.customData?.[k] ?? ''));
    }

    rows.push(row.join(','));
  }

  return rows.join('\n');
}

export const POI_CSV_META = {
  extension: 'csv',
  mime: 'text/csv;charset=utf-8',
  defaultScope: 'public' as PoiExportScope,
  limits: POI_EXPORT_SIZE_THRESHOLDS,
};
