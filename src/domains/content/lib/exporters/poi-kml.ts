/**
 * PR-EXPORT-2 — Serializer KML.
 *
 * DTO-only: recibe `PoiExportRecord[]`. NUNCA lee `GeoLocation`.
 *
 * Sanitización:
 *   - `description`/`name`/etc. → XML-escape vía `escapeXml` (no CDATA
 *     dependiente — usamos texto escapado plano para evitar `]]>`).
 *   - Coordenadas KML: `<coordinates>lng,lat[,altitude]</coordinates>`.
 *
 * Envelope de colección (opcional) → `<Document><name>{collection.name}</name>...`.
 */

import {
  POI_EXPORT_SIZE_THRESHOLDS,
  PoiExportSizeError,
  assertPoiExportRecords,
  evaluatePoiExportSize,
  type PoiExportRecord,
  type PoiExportScope,
} from '../poi-export-record';

export type KmlExportTarget = 'general' | 'mymaps' | 'gurumaps';

export interface SerializePoiKmlOptions {
  scope: PoiExportScope;
  documentName: string;
  target?: KmlExportTarget;
  collection?: { id: string; name: string; description?: string };
}

function escapeXml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderExtendedData(r: PoiExportRecord): string {
  const data: Array<[string, string]> = [];
  data.push(['export_scope', r.exportScope]);
  if (r.geography.continent) data.push(['continent', r.geography.continent]);
  if (r.geography.country) data.push(['country', r.geography.country]);
  if (r.geography.region) data.push(['region', r.geography.region]);
  if (r.geography.zone) data.push(['zone', r.geography.zone]);
  if (r.content.imageUrl) data.push(['image_url', r.content.imageUrl]);
  if (r.content.tags && r.content.tags.length > 0) {
    data.push(['tags', r.content.tags.join(', ')]);
  }
  if (r.classification?.poiLevel !== undefined) {
    data.push(['poi_level', String(r.classification.poiLevel)]);
  }
  if (r.classification?.rootStatus) {
    data.push(['root_status', r.classification.rootStatus]);
  }
  if (r.enrichmentStatus) data.push(['enrichment_status', r.enrichmentStatus]);
  if (r.geoHealth) data.push(['geo_health', r.geoHealth]);
  if (r.customData) {
    for (const [k, v] of Object.entries(r.customData)) {
      data.push([k, v]);
    }
  }
  return data
    .map(
      ([k, v]) =>
        `<Data name="${escapeXml(k)}"><value>${escapeXml(v)}</value></Data>`,
    )
    .join('');
}

function renderPlacemark(r: PoiExportRecord): string {
  const desc = r.content.description ? escapeXml(r.content.description) : '';
  const altPart =
    typeof r.coordinates.altitude === 'number'
      ? `,${r.coordinates.altitude}`
      : '';
  return `
  <Placemark>
    <name>${escapeXml(r.name)}</name>
    ${desc ? `<description>${desc}</description>` : ''}
    <ExtendedData>${renderExtendedData(r)}</ExtendedData>
    <Point>
      <coordinates>${r.coordinates.longitude},${r.coordinates.latitude}${altPart}</coordinates>
    </Point>
  </Placemark>`;
}

export function serializePoiKml(
  records: PoiExportRecord[],
  options: SerializePoiKmlOptions,
): string {
  assertPoiExportRecords(records, 'serializePoiKml');
  const verdict = evaluatePoiExportSize(records.length);
  if (verdict.level === 'block') throw new PoiExportSizeError(verdict);

  const { scope, documentName, collection } = options;
  const docName = collection?.name ?? documentName;
  const docDesc = collection?.description;

  const placemarks = records.map(renderPlacemark).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
  <Document>
    <name>${escapeXml(docName)}</name>
    ${docDesc ? `<description>${escapeXml(docDesc)}</description>` : ''}
    <atom:author><atom:name>vandits-${escapeXml(scope)}</atom:name></atom:author>
    ${collection ? `<ExtendedData><Data name="collection_id"><value>${escapeXml(collection.id)}</value></Data></ExtendedData>` : ''}
    ${placemarks}
  </Document>
</kml>`;
}

export const POI_KML_META = {
  extension: 'kml',
  mime: 'application/vnd.google-earth.kml+xml',
  defaultScope: 'public' as PoiExportScope,
  limits: POI_EXPORT_SIZE_THRESHOLDS,
};
