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
import type { PoiExportContent } from '../poi-export-content-model';

export interface SerializePoiCsvOptions {
  scope: PoiExportScope;
  collection?: { id: string; name: string; description?: string };
}

const BASE_HEADERS_PUBLIC = [
  'id',
  'name',
  'highlight',
  'description',
  'observation',
  'latitude',
  'longitude',
  'altitude',
  'continent',
  'country',
  'region',
  'province',
  'locality',
  'address',
  'category',
  'subcategory',
  'image_url',
  'image_attribution',
  'tags',
  'links',
  'export_scope',
] as const;

const BASE_HEADERS_INTERNAL = [
  ...BASE_HEADERS_PUBLIC,
  'poi_level',
  'root_status',
  'enrichment_status',
  'geo_health',
  'created_at',
  'collection',
  'personal_notes',
  'own_state',
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
    const layered = r.layeredContent as PoiExportContent | undefined;
    const links = layered
      ? [
          ...(layered.provenance.webReference ? [layered.provenance.webReference] : []),
          ...layered.provenance.sources.filter((s) => /^https?:\/\//i.test(s)),
        ].join(' | ')
      : '';
    const row: string[] = [
      escapeCsv(r.id),
      escapeCsv(r.name),
      escapeCsv(layered?.summary.highlight ?? ''),
      escapeCsv(layered?.summary.longDescription ?? r.content.description ?? ''),
      escapeCsv(layered?.summary.observation ?? ''),
      escapeCsv(r.coordinates.latitude),
      escapeCsv(r.coordinates.longitude),
      escapeCsv(r.coordinates.altitude ?? ''),
      escapeCsv(r.geography.continent ?? ''),
      escapeCsv(layered?.geography.country ?? r.geography.country ?? ''),
      escapeCsv(layered?.geography.region ?? r.geography.region ?? ''),
      escapeCsv(layered?.geography.province ?? r.geography.zone ?? ''),
      escapeCsv(layered?.geography.locality ?? ''),
      escapeCsv(layered?.geography.address ?? ''),
      escapeCsv(layered?.classification.category ?? ''),
      escapeCsv(layered?.classification.subcategory ?? ''),
      escapeCsv(layered?.media.imageUrl ?? r.content.imageUrl ?? ''),
      escapeCsv(layered?.media.imageAttribution ?? ''),
      escapeCsv(
        layered?.classification.tags?.join(', ') ??
          (r.content.tags ? r.content.tags.join(', ') : ''),
      ),
      escapeCsv(links),
      escapeCsv(r.exportScope),
    ];

    if (scope === 'internal') {
      row.push(
        escapeCsv(r.classification?.poiLevel ?? ''),
        escapeCsv(r.classification?.rootStatus ?? ''),
        escapeCsv(r.enrichmentStatus ?? ''),
        escapeCsv(r.geoHealth ?? ''),
        escapeCsv(layered?.userContext?.createdAt ?? ''),
        escapeCsv(layered?.userContext?.collection ?? ''),
        escapeCsv(layered?.userContext?.personalNotes ?? ''),
        escapeCsv(layered?.userContext?.ownState ?? ''),
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
