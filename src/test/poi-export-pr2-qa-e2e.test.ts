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
import { poi9, poi10, poi5, poi1bEditorial, OWNER_A, OWNER_B } from './fixtures/poi-export-fixtures';
import type { GeoLocation } from '@/types/location';

function leak(p: GeoLocation): GeoLocation {
  return {
    ...p,
    rawGeocode: { provider: 'photon', score: 0.91, hit: { foo: 'bar' } },
    raw_geocode: { provider: 'photon', hit: { foo: 'bar' } },
    imageUrl: 'https://images.unsplash.com/photo-1?signature=abc&token=secret',
    customData: {
      ...(p as any).customData,
      source: 'kml',
      external_id: 'abc-123',
      user_label: 'visita 2024',
      secret_internal: 'NO-DEBE-SALIR',
      session_token: 'SHOULD-NOT-LEAK',
    },
    tags: ['catedral', 'gótico'],
  } as unknown as GeoLocation;
}

const fixtures: GeoLocation[] = [
  leak({ ...poi9(OWNER_A), id: 'a' }),
  leak({ ...poi10(OWNER_A), id: 'b' }),
  leak({ ...poi9(OWNER_B), id: 'c' }), // ajeno
  leak({ ...poi5(OWNER_A), id: 'd' }), // deuda geo → no público
  leak({ ...poi1bEditorial(OWNER_A), id: 'e' }), // 1b editorial → no público
];

describe('PR-EXPORT-2 QA E2E harness', () => {
  it('captures payload samples + security + limits for audit doc', () => {
    const pipelineOk = runPoiExport(
      { locations: fixtures, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER_A }, documentName: 'qa-e2e', origin: 'panel' },
      { confirmedOverWarn: false },
    );

    const partPublic = partitionForExport(fixtures, 'public' as any, { currentUserId: OWNER_A });
    const partInternal = partitionForExport(fixtures, 'internal' as any, { currentUserId: OWNER_A });
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

    const big = Array.from({ length: 5500 }, (_, i) => leak({ ...poi9(OWNER_A), id: `big-${i}` }));
    const warn = runPoiExport({ locations: big, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER_A }, documentName: 'big', origin: 'panel' }, { confirmedOverWarn: false });
    const warnConfirmed = runPoiExport({ locations: big, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER_A }, documentName: 'big', origin: 'panel' }, { confirmedOverWarn: true });
    const huge = Array.from({ length: 10500 }, (_, i) => leak({ ...poi9(OWNER_A), id: `huge-${i}` }));
    let blockedThrew = false; let blockedLimit = 0;
    try { runPoiExport({ locations: huge, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER_A }, documentName: 'huge', origin: 'panel' }, { confirmedOverWarn: true }); }
    catch (e) { if (e instanceof PoiExportSizeError) { blockedThrew = true; blockedLimit = e.verdict.thresholds.block; } }
    const verdict5500 = evaluatePoiExportSize(5500);

    const allBytes = [csv, kml, json, geojson, internalJsonStr].join('\n---\n');
    const security = {
      no_ownerUserId_field: !/"ownerUserId"|user-a|user-b/.test(allBytes),
      no_raw_geocode_field: !/raw_geocode|rawGeocode|"photon"/.test(allBytes),
      no_enriched_data_blob: !/"enriched_data"|"enrichedData"|verification_notes|nombre_lugar/.test(allBytes),
      no_secret_internal: !/secret_internal|NO-DEBE-SALIR/.test(allBytes),
      no_session_token: !/session_token|SHOULD-NOT-LEAK/.test(allBytes),
      no_signed_image_public: !/signature=abc/.test([csv, kml, json, geojson].join('\n')),
      geojson_lng_lat_order: (() => { const c = geojsonObj?.features?.[0]?.geometry?.coordinates; return Array.isArray(c) && c.length === 2 && c[0] === 2.0 && c[1] === 41.0; })(),
      json_envelope_v2: jsonObj?.export_format_version === 'poi-export-json-v2',
      geojson_envelope_v1: geojsonObj?.export_format_version === 'poi-export-geojson-v1' && geojsonObj?.type === 'FeatureCollection',
    };

    console.log('===QA-REPORT-START===');
    console.log(JSON.stringify({
      pipeline_shape: {
        kind: pipelineOk.kind,
        eligible: pipelineOk.kind === 'ok' ? pipelineOk.eligibleCount : null,
        excluded: pipelineOk.kind === 'ok' ? pipelineOk.excludedCount : null,
        filename: pipelineOk.kind === 'ok' ? pipelineOk.filename : null,
        mime: pipelineOk.kind === 'ok' ? pipelineOk.mime : null,
      },
      registry_formats: Object.keys(POI_EXPORTERS),
      eligibility: {
        total: fixtures.length,
        public_eligible_ids: partPublic.eligible.map(p => p.id),
        public_excluded: partPublic.excluded.map(e => ({ id: e.loc.id, reason: e.reason })),
        internal_eligible_ids: partInternal.eligible.map(p => p.id),
        internal_excluded: partInternal.excluded.map(e => ({ id: e.loc.id, reason: e.reason })),
      },
      samples: {
        csv: csv.slice(0, 800),
        kml: kml.slice(0, 900),
        json: json.slice(0, 900),
        geojson: geojson.slice(0, 900),
      },
      internal_envelope: {
        keys: Object.keys(internalJson),
        scope: internalJson.scope,
        items_count: internalJson.items?.length,
        first_item: internalJson.items?.[0],
      },
      limits: {
        verdict_5500: verdict5500,
        warn_pipeline_no_confirm: warn.kind === 'warn-pending' ? { kind: warn.kind, eligible: warn.partition.eligibleCount, warn_threshold: warn.sizeVerdict.thresholds.warn, block_threshold: warn.sizeVerdict.thresholds.block } : { kind: warn.kind },
        warn_pipeline_confirmed_5500: warnConfirmed.kind === 'ok' ? { kind: 'ok', eligible: warnConfirmed.eligibleCount } : { kind: warnConfirmed.kind },
        block_10500: blockedThrew ? { kind: 'threw-PoiExportSizeError', block_threshold: blockedLimit } : { kind: 'did-not-block' },
      },
      mapper_dto: {
        first_record_keys: Object.keys(recordsPublic[0] ?? {}),
        custom_data_keys: Object.keys((recordsPublic[0] as any)?.customData ?? {}),
      },
      security,
    }, null, 2));
    console.log('===QA-REPORT-END===');

    expect(pipelineOk.kind).toBe('ok');
    expect(partPublic.eligible.length).toBeGreaterThan(0);
    expect(security.no_ownerUserId_field).toBe(true);
    expect(security.no_raw_geocode_field).toBe(true);
    expect(security.no_enriched_data_blob).toBe(true);
    expect(security.no_secret_internal).toBe(true);
    expect(security.no_session_token).toBe(true);
    expect(security.geojson_lng_lat_order).toBe(true);
    expect(security.json_envelope_v2).toBe(true);
    expect(security.geojson_envelope_v1).toBe(true);
    expect(blockedThrew).toBe(true);
    expect(warn.kind).toBe('warn-pending');
    expect(warnConfirmed.kind).toBe('ok');
  });
});
