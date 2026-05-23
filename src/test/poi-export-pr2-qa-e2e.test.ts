import { describe, it, expect } from 'vitest';
import { runPoiExport } from '@/domains/content/lib/poi-export-pipeline';
import { PoiExportSizeError, evaluatePoiExportSize } from '@/domains/content/lib/poi-export-record';
import { POI_EXPORTERS } from '@/domains/content/lib/exporters';
import { serializePoiCsv } from '@/domains/content/lib/exporters/poi-csv';
import { serializePoiKml } from '@/domains/content/lib/exporters/poi-kml';
import { serializePoiJson } from '@/domains/content/lib/exporters/poi-json';
import { serializePoiGeoJson } from '@/domains/content/lib/exporters/poi-geojson';
import { mapToPoiExportRecords } from '@/domains/content/lib/poi-export-mapper';
import { partitionForExport } from '@/domains/content/lib/poi-export-eligibility';
import type { GeoLocation } from '@/types/location';

const OWNER = 'user-frankie';
const OTHER = 'user-other';

function poiEnriched(id: string, owner = OWNER): GeoLocation {
  return {
    id, name: `POI ${id}`,
    description: 'Descripción importada plana.',
    coordinates: { lat: 40.4, lng: -3.7 },
    ownerUserId: owner, is_approved: true,
    enriched_data: { descripcion: 'Texto enriquecido editorial.', categoria: 'monumento', rating: 4 } as any,
    raw_geocode: { provider: 'photon', hit: { foo: 'bar' } } as any,
    customData: {
      source: 'kml', external_id: 'abc-123', user_label: 'visita 2024',
      secret_internal: 'NO-DEBE-SALIR', session_token: 'SHOULD-NOT-LEAK',
    } as any,
    imageUrl: 'https://images.unsplash.com/photo-1?signature=abc&token=secret',
    tags: ['catedral'],
  } as unknown as GeoLocation;
}
function poiUnshareable(id: string): GeoLocation {
  const p = poiEnriched(id); delete (p as any).enriched_data; return p;
}
const fixtures = [poiEnriched('a'), poiEnriched('b'), poiEnriched('c', OTHER), poiUnshareable('d')];

describe('PR-EXPORT-2 QA E2E harness', () => {
  it('captures payload samples + security + limits for audit doc', () => {
    // === Pipeline shape (Blob path) ===
    const pipelineOk = runPoiExport(
      { locations: fixtures, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, documentName: 'qa-e2e', origin: 'panel' },
      { confirmedOverWarn: false },
    );
    const pipelineInternalEmpty = runPoiExport(
      { locations: [poiEnriched('z', OTHER)], format: 'json', scope: 'internal', ctx: { currentUserId: OWNER }, documentName: 'qa', origin: 'panel' },
      {},
    );

    // === Direct mapper+serializer path (string payloads, jsdom-safe) ===
    const partPublic = partitionForExport(fixtures, 'public' as any, { currentUserId: OWNER });
    const partInternal = partitionForExport(fixtures, 'internal' as any, { currentUserId: OWNER });
    const recordsPublic = mapToPoiExportRecords(partPublic.eligible, 'public');
    const recordsInternal = mapToPoiExportRecords(partInternal.eligible, 'internal');

    const csv = serializePoiCsv(recordsPublic, { scope: 'public' });
    const kml = serializePoiKml(recordsPublic, { scope: 'public', documentName: 'qa-e2e', target: 'general' });
    const json = serializePoiJson(recordsPublic, { scope: 'public' });
    const geojson = serializePoiGeoJson(recordsPublic, { scope: 'public' });
    const internalJsonStr = serializePoiJson(recordsInternal, { scope: 'internal' });
    const internalJson = JSON.parse(internalJsonStr);
    const jsonObj = JSON.parse(json);
    const geojsonObj = JSON.parse(geojson);

    // === Limits ===
    const big = Array.from({ length: 5500 }, (_, i) => poiEnriched(`big-${i}`));
    const warn = runPoiExport({ locations: big, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, documentName: 'big', origin: 'panel' }, { confirmedOverWarn: false });
    const warnConfirmed = runPoiExport({ locations: big, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, documentName: 'big', origin: 'panel' }, { confirmedOverWarn: true });
    const huge = Array.from({ length: 10500 }, (_, i) => poiEnriched(`huge-${i}`));
    let blockedThrew = false; let blockedLimit = 0;
    try { runPoiExport({ locations: huge, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, documentName: 'huge', origin: 'panel' }, { confirmedOverWarn: true }); }
    catch (e) { if (e instanceof PoiExportSizeError) { blockedThrew = true; blockedLimit = e.verdict.thresholds.block; } }
    const verdict5500 = evaluatePoiExportSize(5500);

    // === Security on emitted bytes (all 4 formats concatenated) ===
    const allBytes = [csv, kml, json, geojson, internalJsonStr].join('\n---\n');
    const security = {
      no_ownerUserId: !/ownerUserId|user-frankie|user-other/.test(allBytes),
      no_raw_geocode: !/raw_geocode|"photon"/.test(allBytes),
      no_enriched_data_blob: !/"enriched_data"/.test(allBytes),
      no_secret_internal: !/secret_internal|NO-DEBE-SALIR/.test(allBytes),
      no_session_token: !/session_token|SHOULD-NOT-LEAK/.test(allBytes),
      no_signed_image: !/signature=abc/.test(allBytes),
      geojson_lng_lat_order: (() => { const c = geojsonObj?.features?.[0]?.geometry?.coordinates; return Array.isArray(c) && Math.abs(c[0] - (-3.7)) < 0.01 && Math.abs(c[1] - 40.4) < 0.01; })(),
      json_envelope_v2: jsonObj?.export_format_version === 'poi-export-json-v2',
    };

    console.log('===QA-REPORT-START===');
    console.log(JSON.stringify({
      pipeline_shape: {
        ok_kind: pipelineOk.kind,
        ok_eligible: pipelineOk.kind === 'ok' ? pipelineOk.eligibleCount : null,
        ok_excluded: pipelineOk.kind === 'ok' ? pipelineOk.excludedCount : null,
        ok_filename: pipelineOk.kind === 'ok' ? pipelineOk.filename : null,
        ok_mime: pipelineOk.kind === 'ok' ? pipelineOk.mime : null,
        internal_with_no_own_pois: pipelineInternalEmpty.kind,
      },
      registry_formats: Object.keys(POI_EXPORTERS),
      eligibility: {
        total: fixtures.length,
        public_eligible_ids: partPublic.eligible.map(p => p.id),
        public_excluded_ids: partPublic.excluded.map(e => e.loc.id),
        internal_eligible_ids: partInternal.eligible.map(p => p.id),
      },
      samples: {
        csv: csv.slice(0, 600),
        kml: kml.slice(0, 600),
        json: json.slice(0, 700),
        geojson: geojson.slice(0, 700),
      },
      internal_scope: {
        envelope_keys: Object.keys(internalJson),
        scope: internalJson.scope,
        items_count: internalJson.items?.length,
        first_item_keys: internalJson.items?.[0] ? Object.keys(internalJson.items[0]) : null,
      },
      limits: {
        verdict_5500: verdict5500,
        warn_pipeline_no_confirm: warn.kind === 'warn-pending' ? { kind: warn.kind, eligible: warn.partition.eligibleCount, warn_threshold: warn.sizeVerdict.thresholds.warn, block_threshold: warn.sizeVerdict.thresholds.block } : { kind: warn.kind },
        warn_pipeline_confirmed: warnConfirmed.kind === 'ok' ? { kind: 'ok', eligible: warnConfirmed.eligibleCount } : { kind: warnConfirmed.kind },
        block_10500: blockedThrew ? { kind: 'threw-PoiExportSizeError', block_threshold: blockedLimit } : { kind: 'did-not-block' },
      },
      mapper_dto: {
        first_record_keys: Object.keys(recordsPublic[0] ?? {}),
        custom_data_keys: Object.keys((recordsPublic[0] as any)?.customData ?? {}),
      },
      security,
    }, null, 2));
    console.log('===QA-REPORT-END===');

    // Hard asserts
    expect(security.no_ownerUserId).toBe(true);
    expect(security.no_raw_geocode).toBe(true);
    expect(security.no_enriched_data_blob).toBe(true);
    expect(security.no_secret_internal).toBe(true);
    expect(security.no_session_token).toBe(true);
    expect(security.no_signed_image).toBe(true);
    expect(security.geojson_lng_lat_order).toBe(true);
    expect(security.json_envelope_v2).toBe(true);
    expect(blockedThrew).toBe(true);
    expect(warn.kind).toBe('warn-pending');
    expect(warnConfirmed.kind).toBe('ok');
    expect(pipelineOk.kind).toBe('ok');
  });
});
