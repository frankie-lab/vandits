import { describe, it, expect } from 'vitest';
import { runPoiExport } from '@/domains/content/lib/poi-export-pipeline';
import { PoiExportSizeError } from '@/domains/content/lib/poi-export-record';
import { POI_EXPORTERS } from '@/domains/content/lib/exporters';
import { mapToPoiExportRecords } from '@/domains/content/lib/poi-export-mapper';
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

async function blobText(b: Blob) { return await b.text(); }

describe('PR-EXPORT-2 QA E2E harness', () => {
  it('captures payload samples + security + limits for audit doc', async () => {
    const out: Record<string, any> = {};
    for (const format of ['csv', 'kml', 'json', 'geojson'] as const) {
      const r = runPoiExport(
        { locations: fixtures, format, scope: 'public', ctx: { currentUserId: OWNER }, documentName: 'qa-e2e', origin: 'panel', documentName: 'qa-e2e' },
        { confirmedOverWarn: false },
      );
      if (r.kind !== 'ok') { out[format] = { kind: r.kind }; continue; }
      const text = await blobText(r.blob);
      out[format] = { kind: r.kind, eligible: r.eligibleCount, excluded: r.excludedCount, filename: r.filename, mime: r.mime, bytes: r.blob.size, sample: text.slice(0, 800), full: text };
    }
    const internal = runPoiExport(
      { locations: fixtures, format: 'json', scope: 'internal', ctx: { currentUserId: OWNER }, origin: 'panel', documentName: 'qa-e2e' },
      { confirmedOverWarn: false },
    );
    const internalText = internal.kind === 'ok' ? await blobText(internal.blob) : '';
    const internalJson = internalText ? JSON.parse(internalText) : null;

    const big = Array.from({ length: 5500 }, (_, i) => poiEnriched(`big-${i}`));
    const warn = runPoiExport({ locations: big, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, origin: 'panel', documentName: 'qa-e2e' }, { confirmedOverWarn: false });
    const warnConfirmed = runPoiExport({ locations: big, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, origin: 'panel', documentName: 'qa-e2e' }, { confirmedOverWarn: true });
    const huge = Array.from({ length: 10500 }, (_, i) => poiEnriched(`huge-${i}`));
    let blockedThrew = false; let blockedLimit = 0;
    try { runPoiExport({ locations: huge, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, origin: 'panel', documentName: 'qa-e2e' }, { confirmedOverWarn: true }); }
    catch (e) { if (e instanceof PoiExportSizeError) { blockedThrew = true; blockedLimit = e.verdict.thresholds.block; } }

    const records = mapToPoiExportRecords(fixtures.slice(0, 2), 'public');

    const allBytes = ['csv','kml','json','geojson'].map(f => out[f]?.full ?? '').join('\n---\n');
    const geoJsonObj = out.geojson?.full ? JSON.parse(out.geojson.full) : null;
    const jsonObj = out.json?.full ? JSON.parse(out.json.full) : null;
    const security = {
      no_ownerUserId: !/ownerUserId|user-frankie|user-other/.test(allBytes),
      no_raw_geocode: !/raw_geocode|"photon"/.test(allBytes),
      no_enriched_data_blob: !/"enriched_data"/.test(allBytes),
      no_secret_internal: !/secret_internal|NO-DEBE-SALIR/.test(allBytes),
      no_session_token: !/session_token|SHOULD-NOT-LEAK/.test(allBytes),
      no_signed_image: !/signature=abc/.test(allBytes),
      geojson_lng_lat_order: (() => { const c = geoJsonObj?.features?.[0]?.geometry?.coordinates; return Array.isArray(c) && Math.abs(c[0] - (-3.7)) < 0.01 && Math.abs(c[1] - 40.4) < 0.01; })(),
      json_envelope_v2: jsonObj?.export_format_version === 'poi-export-json-v2',
    };

    // strip `full` from console output
    const outCompact = Object.fromEntries(Object.entries(out).map(([k, v]: any) => [k, { ...v, full: undefined }]));

    console.log('===QA-REPORT-START===');
    console.log(JSON.stringify({
      formats: outCompact,
      registry: Object.keys(POI_EXPORTERS),
      internal_scope: { kind: internal.kind, envelope_keys: internalJson && Object.keys(internalJson), items: internalJson?.items?.length, first: internalJson?.items?.[0], excluded: internal.kind === 'ok' ? internal.excludedCount : undefined },
      limits: {
        warn_5500_no_confirm: warn.kind === 'warn-pending' ? { kind: 'warn-pending', warn_at: warn.sizeVerdict.thresholds.warn, block_at: warn.sizeVerdict.thresholds.block, eligible: warn.partition.eligibleCount } : { kind: warn.kind },
        warn_5500_confirmed: warnConfirmed.kind === 'ok' ? { kind: 'ok', eligible: warnConfirmed.eligibleCount } : { kind: warnConfirmed.kind },
        block_10500: blockedThrew ? { kind: 'threw-PoiExportSizeError', limit: blockedLimit } : { kind: 'did-not-block' },
      },
      mapper_dto_keys: Object.keys(records[0] ?? {}),
      mapper_custom_data_keys: Object.keys((records[0] as any)?.customData ?? {}),
      security,
    }, null, 2));
    console.log('===QA-REPORT-END===');

    expect(security.no_ownerUserId).toBe(true);
    expect(security.no_raw_geocode).toBe(true);
    expect(security.no_secret_internal).toBe(true);
    expect(security.no_session_token).toBe(true);
    expect(security.no_signed_image).toBe(true);
    expect(security.json_envelope_v2).toBe(true);
    expect(security.geojson_lng_lat_order).toBe(true);
    expect(blockedThrew).toBe(true);
    expect(warn.kind).toBe('warn-pending');
    expect(warnConfirmed.kind).toBe('ok');
  });
});
