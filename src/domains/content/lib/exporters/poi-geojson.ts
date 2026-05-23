/**
 * PR-EXPORT-2 — Serializer GeoJSON v1 (FeatureCollection).
 *
 * - `coordinates` orden canónico **[lng, lat]** (RFC 7946 §3.1.1).
 * - `properties` = `PoiExportRecord` SIN `coordinates` (ya viven en
 *   `geometry`).
 * - Envelope de colección opcional a nivel FeatureCollection.
 *
 * DTO-only: NUNCA lee `GeoLocation`.
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

export interface SerializePoiGeoJsonOptions {
  scope: PoiExportScope;
  collection?: { id: string; name: string; description?: string };
  generatedAt?: string;
  pretty?: boolean;
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'Point'; coordinates: [number, number, number] };
  properties: Omit<PoiExportRecord, 'coordinates'>;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  export_format_version: typeof POI_EXPORT_FORMAT_VERSION.geojson;
  scope: PoiExportScope;
  generatedAt: string;
  collection: { id: string; name: string; description?: string } | null;
  features: GeoJsonFeature[];
}

function recordToFeature(r: PoiExportRecord): GeoJsonFeature {
  const { coordinates, ...rest } = r;
  const coords: [number, number] | [number, number, number] =
    typeof coordinates.altitude === 'number'
      ? [coordinates.longitude, coordinates.latitude, coordinates.altitude]
      : [coordinates.longitude, coordinates.latitude];
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: rest,
  };
}

export function buildPoiGeoJsonEnvelope(
  records: PoiExportRecord[],
  options: SerializePoiGeoJsonOptions,
): GeoJsonFeatureCollection {
  assertPoiExportRecords(records, 'buildPoiGeoJsonEnvelope');
  return {
    type: 'FeatureCollection',
    export_format_version: POI_EXPORT_FORMAT_VERSION.geojson,
    scope: options.scope,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    collection: options.collection ?? null,
    features: records.map(recordToFeature),
  };
}

export function serializePoiGeoJson(
  records: PoiExportRecord[],
  options: SerializePoiGeoJsonOptions,
): string {
  assertPoiExportRecords(records, 'serializePoiGeoJson');
  const verdict = evaluatePoiExportSize(records.length);
  if (verdict.level === 'block') throw new PoiExportSizeError(verdict);

  const envelope = buildPoiGeoJsonEnvelope(records, options);
  return options.pretty === false
    ? JSON.stringify(envelope)
    : JSON.stringify(envelope, null, 2);
}

export const POI_GEOJSON_META = {
  extension: 'geojson',
  mime: 'application/geo+json',
  defaultScope: 'public' as PoiExportScope,
  limits: POI_EXPORT_SIZE_THRESHOLDS,
  formatVersion: POI_EXPORT_FORMAT_VERSION.geojson,
};
