/**
 * PR-EXPORT-2 — Tests Fase 2 Core.
 *
 * Cubre:
 *   - mapper: ownerUserId nunca en DTO, scope=public omite internal-only,
 *     customData solo allowlist, imageUrl signed/private excluida en public.
 *   - JSON v2: envelope, no GeoLocation crudo, format version.
 *   - GeoJSON: FeatureCollection, [lng, lat].
 *   - Serializers DTO-only (assertPoiExportRecords).
 *   - Pipeline: evaluatePoiExport antes del mapper.
 *   - Size helper: 5k warn / 10k block.
 *   - ShareSheet boundary (grep estático).
 *   - Tracking single hook (re-export alias).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  CUSTOM_DATA_EXPORT_ALLOWLIST,
  POI_EXPORT_FORMAT_VERSION,
  PoiExportSizeError,
  assertPoiExportRecords,
  evaluatePoiExportSize,
  filterCustomDataForExport,
  type PoiExportRecord,
} from '@/domains/content/lib/poi-export-record';
import {
  mapToPoiExportRecord,
  mapToPoiExportRecords,
} from '@/domains/content/lib/poi-export-mapper';
import {
  serializePoiCsv,
  serializePoiJson,
  serializePoiGeoJson,
  serializePoiKml,
  POI_EXPORTERS,
} from '@/domains/content/lib/exporters';
import { partitionForExport } from '@/domains/content/lib/poi-export-eligibility';
import { OWNER_A, OWNER_B, poi5, poi9 } from '@/test/fixtures/poi-export-fixtures';
import type { GeoLocation } from '@/types/location';

const ctxA = { currentUserId: OWNER_A };

function withCustom(
  loc: GeoLocation,
  custom: Record<string, string>,
): GeoLocation {
  return { ...loc, customData: { ...(loc.customData ?? {}), ...custom } };
}

function withImage(loc: GeoLocation, imagen: string): GeoLocation {
  const ed = loc.enrichedData;
  if (!ed) return loc;
  return { ...loc, enrichedData: { ...ed, imagen } };
}

describe('PR-EXPORT-2 · PoiExportRecord mapper', () => {
  it('ownerUserId NUNCA aparece en el DTO (public ni internal)', () => {
    const pub = mapToPoiExportRecord(poi9(OWNER_A), 'public');
    const int = mapToPoiExportRecord(poi9(OWNER_A), 'internal');
    expect((pub as Record<string, unknown>).ownerUserId).toBeUndefined();
    expect((int as Record<string, unknown>).ownerUserId).toBeUndefined();
  });

  it('public omite classification/enrichmentStatus/geoHealth', () => {
    const r = mapToPoiExportRecord(poi9(OWNER_A), 'public');
    expect(r.classification).toBeUndefined();
    expect(r.enrichmentStatus).toBeUndefined();
    expect(r.geoHealth).toBeUndefined();
  });

  it('internal incluye poiLevel y campos diagnósticos cuando existen', () => {
    const r = mapToPoiExportRecord(poi9(OWNER_A), 'internal');
    expect(r.classification?.poiLevel).toBeTypeOf('number');
  });

  it('customData se filtra contra CUSTOM_DATA_EXPORT_ALLOWLIST', () => {
    const loc = withCustom(poi9(OWNER_A), {
      source: 'wikipedia',
      external_id: 'Q1234',
      user_label: 'mi favorito',
      secret_internal_note: 'NO EXPORTAR',
      visited: 'true',
    });
    const r = mapToPoiExportRecord(loc, 'public');
    expect(r.customData).toEqual({
      source: 'wikipedia',
      external_id: 'Q1234',
      user_label: 'mi favorito',
    });
    expect(r.customData?.secret_internal_note).toBeUndefined();
    expect(r.customData?.visited).toBeUndefined();
  });

  it('allowlist son exactamente las 3 claves canónicas', () => {
    expect([...CUSTOM_DATA_EXPORT_ALLOWLIST].sort()).toEqual(
      ['external_id', 'source', 'user_label'].sort(),
    );
  });

  it('imageUrl signed/private excluida en public, permitida en internal', () => {
    const signed = withImage(
      poi9(OWNER_A),
      'https://cdn.example.org/img.jpg?token=abc&signature=xyz',
    );
    expect(mapToPoiExportRecord(signed, 'public').content.imageUrl).toBeUndefined();
    expect(mapToPoiExportRecord(signed, 'internal').content.imageUrl).toBe(
      'https://cdn.example.org/img.jpg?token=abc&signature=xyz',
    );
  });

  it('imageUrl pública sin query firmada SÍ entra en public', () => {
    const pub = withImage(poi9(OWNER_A), 'https://cdn.example.org/img.jpg');
    expect(mapToPoiExportRecord(pub, 'public').content.imageUrl).toBe(
      'https://cdn.example.org/img.jpg',
    );
  });

  it('Supabase storage signed URL bloqueada en public', () => {
    const u = withImage(
      poi9(OWNER_A),
      'https://xyz.supabase.co/storage/v1/object/sign/bucket/file.jpg?token=t',
    );
    expect(mapToPoiExportRecord(u, 'public').content.imageUrl).toBeUndefined();
  });

  it('mapper NUNCA emite enriched_data crudo ni raw_geocode', () => {
    const r = mapToPoiExportRecord(poi9(OWNER_A), 'internal');
    const keys = Object.keys(r);
    expect(keys).not.toContain('enrichedData');
    expect(keys).not.toContain('enriched_data');
    expect(keys).not.toContain('rawGeocode');
    expect(keys).not.toContain('raw_geocode');
  });

  it('coordinates usan latitude/longitude (no lat/lng GeoLocation)', () => {
    const r = mapToPoiExportRecord(poi9(OWNER_A), 'public');
    expect(typeof r.coordinates.latitude).toBe('number');
    expect(typeof r.coordinates.longitude).toBe('number');
    expect((r.coordinates as Record<string, unknown>).lat).toBeUndefined();
    expect((r.coordinates as Record<string, unknown>).lng).toBeUndefined();
  });
});

describe('PR-EXPORT-2 · filterCustomDataForExport', () => {
  it('descarta keys fuera de allowlist y devuelve undefined si vacío', () => {
    expect(filterCustomDataForExport({ foo: 'bar' })).toBeUndefined();
    expect(filterCustomDataForExport(undefined)).toBeUndefined();
    expect(filterCustomDataForExport({ source: 'x', evil: 'y' })).toEqual({
      source: 'x',
    });
  });
});

describe('PR-EXPORT-2 · JSON v2 envelope', () => {
  it('output usa export_format_version "poi-export-json-v2"', () => {
    const recs = mapToPoiExportRecords([poi9(OWNER_A)], 'public');
    const parsed = JSON.parse(
      serializePoiJson(recs, { scope: 'public', generatedAt: '2026-01-01T00:00:00Z' }),
    );
    expect(parsed.export_format_version).toBe('poi-export-json-v2');
    expect(parsed.scope).toBe('public');
    expect(parsed.count).toBe(1);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.collection).toBeNull();
  });

  it('JSON NO contiene shape crudo de GeoLocation', () => {
    const recs = mapToPoiExportRecords([poi9(OWNER_A)], 'internal');
    const parsed = JSON.parse(serializePoiJson(recs, { scope: 'internal' }));
    const item = parsed.items[0];
    expect(item.ownerUserId).toBeUndefined();
    expect(item.enrichedData).toBeUndefined();
    expect(item._docUserId).toBeUndefined();
    expect(item.raw_geocode).toBeUndefined();
    expect(item.visibility).toBeUndefined();
  });

  it('collection envelope se persiste cuando se pasa', () => {
    const recs = mapToPoiExportRecords([poi9(OWNER_A)], 'public');
    const parsed = JSON.parse(
      serializePoiJson(recs, {
        scope: 'public',
        collection: { id: 'c1', name: 'My collection' },
      }),
    );
    expect(parsed.collection).toEqual({ id: 'c1', name: 'My collection' });
  });
});

describe('PR-EXPORT-2 · GeoJSON FeatureCollection', () => {
  it('usa [lng, lat] en geometry.coordinates', () => {
    const recs = mapToPoiExportRecords([poi9(OWNER_A)], 'public');
    const parsed = JSON.parse(serializePoiGeoJson(recs, { scope: 'public' }));
    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.export_format_version).toBe(POI_EXPORT_FORMAT_VERSION.geojson);
    const feat = parsed.features[0];
    expect(feat.type).toBe('Feature');
    expect(feat.geometry.type).toBe('Point');
    // GeoLocation fixture usa lat=41, lng=2 → geometry debe ser [2, 41].
    expect(feat.geometry.coordinates).toEqual([2, 41]);
    expect(feat.properties.coordinates).toBeUndefined();
  });
});

describe('PR-EXPORT-2 · serializers DTO-only', () => {
  it('assertPoiExportRecords rechaza GeoLocation crudo', () => {
    expect(() => assertPoiExportRecords([poi9(OWNER_A)] as unknown, 'test')).toThrow(
      /ownerUserId|enrichedData|latitude/i,
    );
  });

  it('cada serializer pasa por la guard runtime', () => {
    const bad = [poi9(OWNER_A)] as unknown as PoiExportRecord[];
    expect(() => serializePoiCsv(bad, { scope: 'public' })).toThrow();
    expect(() => serializePoiKml(bad, { scope: 'public', documentName: 'd' })).toThrow();
    expect(() => serializePoiJson(bad, { scope: 'public' })).toThrow();
    expect(() => serializePoiGeoJson(bad, { scope: 'public' })).toThrow();
  });

  it('serializers válidos aceptan DTO mapeado', () => {
    const recs = mapToPoiExportRecords([poi9(OWNER_A)], 'public');
    expect(serializePoiCsv(recs, { scope: 'public' })).toContain('poi-9');
    expect(serializePoiJson(recs, { scope: 'public' })).toContain('poi-9');
    expect(serializePoiGeoJson(recs, { scope: 'public' })).toContain('poi-9');
    expect(serializePoiKml(recs, { scope: 'public', documentName: 'd' })).toContain(
      '<Placemark>',
    );
  });

  it('grep estático: serializers no importan GeoLocation', () => {
    const files = [
      'src/domains/content/lib/exporters/poi-csv.ts',
      'src/domains/content/lib/exporters/poi-kml.ts',
      'src/domains/content/lib/exporters/poi-json.ts',
      'src/domains/content/lib/exporters/poi-geojson.ts',
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.resolve(f), 'utf8');
      expect(src).not.toMatch(/from\s+['"]@\/types\/location['"]/);
      expect(src).not.toMatch(/GeoLocation/);
    }
  });
});

describe('PR-EXPORT-2 · pipeline (evaluatePoiExport antes del mapper)', () => {
  it('POIs no elegibles no llegan al serializer', () => {
    const { eligible } = partitionForExport([poi5(OWNER_A), poi9(OWNER_A)], 'public', {
      currentUserId: null,
    });
    expect(eligible.map((l) => l.id)).toEqual(['poi-9']);
    const recs = mapToPoiExportRecords(eligible, 'public');
    const out = JSON.parse(serializePoiJson(recs, { scope: 'public' }));
    expect(out.items.map((i: { id: string }) => i.id)).toEqual(['poi-9']);
  });

  it('internal: ajenos descartados antes del mapper', () => {
    const { eligible } = partitionForExport(
      [poi9(OWNER_A), poi9(OWNER_B)],
      'internal',
      ctxA,
    );
    expect(eligible).toHaveLength(1);
  });
});

describe('PR-EXPORT-2 · evaluatePoiExportSize', () => {
  it('thresholds canónicos 5000 / 10000', () => {
    expect(evaluatePoiExportSize(0).level).toBe('ok');
    expect(evaluatePoiExportSize(5000).level).toBe('ok');
    expect(evaluatePoiExportSize(5001).level).toBe('warn');
    expect(evaluatePoiExportSize(9999).level).toBe('warn');
    expect(evaluatePoiExportSize(10000).level).toBe('warn');
    expect(evaluatePoiExportSize(10001).level).toBe('block');
  });

  it('serializers abortan cuando level=block', () => {
    const fake = Array.from({ length: 10001 }, (_, i) => ({
      id: `id-${i}`,
      name: 'n',
      coordinates: { latitude: 0, longitude: 0 },
      geography: {},
      content: {},
      exportScope: 'public' as const,
    }));
    expect(() => serializePoiJson(fake, { scope: 'public' })).toThrow(PoiExportSizeError);
  });
});

describe('PR-EXPORT-2 · ShareSheet boundary', () => {
  it('ShareSheet no importa serializers/mapper/registry', () => {
    const src = fs.readFileSync(
      path.resolve('src/domains/sharing/components/ShareSheet.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/poi-export-mapper/);
    expect(src).not.toMatch(/poi-export-record/);
    expect(src).not.toMatch(/lib\/exporters/);
    expect(src).not.toMatch(/serializePoi(Csv|Kml|Json|GeoJson)/);
    expect(src).not.toMatch(/mapToPoiExportRecord/);
  });
});

describe('PR-EXPORT-2 · use-export-tracking single hook', () => {
  it('domain alias re-exporta del único hook canónico', () => {
    const src = fs.readFileSync(
      path.resolve('src/domains/content/hooks/use-export-tracking.ts'),
      'utf8',
    );
    expect(src).toMatch(/export\s*\{[^}]*useExportTracking[^}]*\}\s*from\s*['"]@\/hooks\/use-export-tracking['"]/);
  });
});

describe('PR-EXPORT-2 · registry', () => {
  it('expone los 4 formatos canónicos con defaultScope=public', () => {
    expect(Object.keys(POI_EXPORTERS).sort()).toEqual(['csv', 'geojson', 'json', 'kml']);
    for (const fmt of Object.values(POI_EXPORTERS)) {
      expect(fmt.defaultScope).toBe('public');
      expect(fmt.limits.warn).toBe(5000);
      expect(fmt.limits.block).toBe(10000);
    }
  });
});
