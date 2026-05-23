import { describe, it, expect } from 'vitest';
import { runPoiExport } from '@/domains/content/lib/poi-export-pipeline';
import { POI_EXPORTERS } from '@/domains/content/lib/exporters';
import { mapToPoiExportRecords } from '@/domains/content/lib/poi-export-mapper';
import type { GeoLocation } from '@/types/location';

const OWNER = 'user-frankie';
const OTHER = 'user-other';

function poiEnriched(id: string, owner = OWNER, overrides: Partial<GeoLocation> = {}): GeoLocation {
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
    tags: ['catedral'], ...overrides,
  } as GeoLocation;
}
function poiUnshareable(id: string): GeoLocation {
  const p = poiEnriched(id); delete (p as any).enriched_data; return p;
}
const fixtures = [poiEnriched('a'), poiEnriched('b'), poiEnriched('c', OTHER), poiUnshareable('d')];

describe('PR-EXPORT-2 QA E2E harness', () => {
  it('captures payload samples for audit doc', async () => {
    const out: Record<string, any> = {};
    for (const format of ['csv', 'kml', 'json', 'geojson'] as const) {
      const r = await runPoiExport(
        { locations: fixtures, format, scope: 'public', ctx: { currentUserId: OWNER }, documentName: 'qa-e2e', origin: 'qa-harness' },
        { confirmedOverWarn: false },
      );
      if (r.kind !== 'ok') { out[format] = { kind: r.kind }; continue; }
      const text = await r.blob.text();
      out[format] = { kind: r.kind, eligible: r.eligibleCount, excluded: r.excludedCount, filename: r.filename, mime: r.blob.type, bytes: r.blob.size, sample: text.slice(0, 800) };
    }
    const internal = await runPoiExport(
      { locations: fixtures, format: 'json', scope: 'internal', ctx: { currentUserId: OWNER }, origin: 'qa-harness' },
      { confirmedOverWarn: false },
    );
    const internalText = internal.kind === 'ok' ? await internal.blob.text() : '';
    const internalJson = internalText ? JSON.parse(internalText) : null;

    const big = Array.from({ length: 5500 }, (_, i) => poiEnriched(`big-${i}`));
    const warn = await runPoiExport({ locations: big, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, origin: 'qa-harness' }, { confirmedOverWarn: false });
    const warnConfirmed = await runPoiExport({ locations: big, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, origin: 'qa-harness' }, { confirmedOverWarn: true });
    const huge = Array.from({ length: 10500 }, (_, i) => poiEnriched(`huge-${i}`));
    const blocked = await runPoiExport({ locations: huge, format: 'csv', scope: 'public', ctx: { currentUserId: OWNER }, origin: 'qa-harness' }, { confirmedOverWarn: true });

    const records = mapToPoiExportRecords(fixtures, 'public', { currentUserId: OWNER });
    const allBytes = Object.values(out).map((v: any) => v?.sample ?? '').join('\n---\n');

    const security = {
      no_ownerUserId: !/ownerUserId/.test(allBytes),
      no_raw_geocode: !/raw_geocode/.test(allBytes),
      no_enriched_data_blob: !/"enriched_data"/.test(allBytes),
      no_secret_internal: !/secret_internal|NO-DEBE-SALIR/.test(allBytes),
      no_session_token: !/session_token|SHOULD-NOT-LEAK/.test(allBytes),
      no_signed_image: !/photo-1\?signature=/.test(allBytes),
      geojson_lng_lat_order: (() => {
        const fc = JSON.parse(out.geojson?.sample?.split('\n').join('') ?? '{}');
        const c = fc?.features?.[0]?.geometry?.coordinates;
        return Array.isArray(c) && c[0] < 0 && c[1] > 0;
      })(),
      json_envelope_v2: JSON.parse(out.json?.sample ?? '{}').export_format_version === 'poi-export-json-v2',
    };

    console.log('===QA-REPORT-START===');
    console.log(JSON.stringify({
      formats: out,
      registry: Object.keys(POI_EXPORTERS),
      internal_scope: { kind: internal.kind, envelope_keys: internalJson && Object.keys(internalJson), items: internalJson?.items?.length, first: internalJson?.items?.[0], excluded: internal.kind === 'ok' ? internal.excludedCount : undefined },
      limits: {
        warn_5500_no_confirm: warn.kind === 'warn' ? { kind: 'warn', limit: warn.limit, eligible: warn.eligibleCount } : { kind: warn.kind },
        warn_5500_confirmed: warnConfirmed.kind === 'ok' ? { kind: 'ok', eligible: warnConfirmed.eligibleCount } : { kind: warnConfirmed.kind },
        block_10500: blocked.kind === 'blocked' ? { kind: 'blocked', limit: blocked.limit, eligible: blocked.eligibleCount } : { kind: blocked.kind },
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
  });
});
