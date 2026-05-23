/**
 * PR-EXPORT-2 · Fase 3 UX — contract tests del pipeline + boundary.
 *
 * NO renderiza componentes React (evita pulling de framer-motion/store).
 * Verifica:
 *   - registry incluye geojson;
 *   - pipeline runPoiExport descarta no-elegibles antes del mapper;
 *   - GeoJSON serializa FeatureCollection [lng,lat] válido;
 *   - JSON usa export_format_version v2;
 *   - warn/block respetan 5k/10k;
 *   - dominio sharing y kml-parser legacy NO se usan desde UX;
 *   - ExportPanel y SelectionActions usan el pipeline canónico.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { GeoLocation } from '@/types/location';
import {
  runPoiExport,
  previewPoiExport,
  type PoiExportPipelineResult,
} from '@/domains/content/lib/poi-export-pipeline';
import { POI_EXPORTERS } from '@/domains/content/lib/exporters';
import { PoiExportSizeError } from '@/domains/content/lib/poi-export-record';
import { OWNER_A, poi5, poi9 } from '@/test/fixtures/poi-export-fixtures';

const OWNER = OWNER_A;

function clonePoi9(id: string): GeoLocation {
  return { ...poi9(OWNER), id, name: id };
}
function clonePoi5(id: string): GeoLocation {
  return { ...poi5(OWNER), id, name: id };
}

describe('PR-EXPORT-2 Fase 3 · registry', () => {
  it('expone 4 formatos canónicos incluyendo geojson', () => {
    expect(Object.keys(POI_EXPORTERS).sort()).toEqual(['csv', 'geojson', 'json', 'kml']);
    expect(POI_EXPORTERS.geojson.extension).toBe('geojson');
    expect(POI_EXPORTERS.geojson.defaultScope).toBe('public');
  });
});

describe('PR-EXPORT-2 Fase 3 · pipeline runPoiExport', () => {
  const ctx = { currentUserId: OWNER };
  const docName = 'Doc-UX';

  it('GeoJSON: serializa FeatureCollection [lng,lat] válido', async () => {
    const outcome = runPoiExport({
      locations: [clonePoi9('p1')],
      format: 'geojson',
      scope: 'public',
      ctx,
      documentName: docName,
      origin: 'panel',
    });
    expect(outcome.kind).toBe('ok');
    const r = outcome as PoiExportPipelineResult;
    const text = await new Response(r.blob).text();
    const json = JSON.parse(text);
    expect(json.type).toBe('FeatureCollection');
    expect(json.export_format_version).toBe('poi-export-geojson-v1');
    expect(json.features[0].geometry.type).toBe('Point');
    expect(json.features[0].geometry.coordinates[0]).toBeCloseTo(2.0);
    expect(json.features[0].geometry.coordinates[1]).toBeCloseTo(41.0);
    expect(r.extension).toBe('geojson');
    expect(r.filename).toMatch(/_public_/);
  });

  it('JSON: envelope v2 (no GeoLocation dump)', async () => {
    const outcome = runPoiExport({
      locations: [clonePoi9('p1')],
      format: 'json',
      scope: 'public',
      ctx,
      documentName: docName,
      origin: 'panel',
    });
    const r = outcome as PoiExportPipelineResult;
    const json = JSON.parse(await new Response(r.blob).text());
    expect(json.export_format_version).toBe('poi-export-json-v2');
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items[0].ownerUserId).toBeUndefined();
    expect(json.items[0].enrichedData).toBeUndefined();
  });

  it('descarta no-elegibles antes del mapper (sin POI-9 → no-eligible)', () => {
    const outcome = runPoiExport({
      locations: [clonePoi5('p1')],
      format: 'csv',
      scope: 'public',
      ctx,
      documentName: docName,
      origin: 'selection',
    });
    expect(outcome.kind).toBe('no-eligible');
  });

  it('warn-pending sobre 5000 sin confirmación', () => {
    const locs = Array.from({ length: 5001 }, (_, i) => clonePoi9(`p${i}`));
    const outcome = runPoiExport(
      { locations: locs, format: 'csv', scope: 'public', ctx, documentName: docName, origin: 'panel' },
      { confirmedOverWarn: false },
    );
    expect(outcome.kind).toBe('warn-pending');
  });

  it('block sobre 10000 (PoiExportSizeError) incluso con confirmedOverWarn', () => {
    const locs = Array.from({ length: 10001 }, (_, i) => clonePoi9(`p${i}`));
    expect(() =>
      runPoiExport(
        { locations: locs, format: 'csv', scope: 'public', ctx, documentName: docName, origin: 'panel' },
        { confirmedOverWarn: true },
      ),
    ).toThrow(PoiExportSizeError);
  });

  it('preview expone eligibleCount / excludedCount / sizeVerdict', () => {
    const p = previewPoiExport({
      locations: [clonePoi9('a'), clonePoi5('b')],
      format: 'csv',
      scope: 'public',
      ctx,
    });
    expect(p.eligibleCount).toBe(1);
    expect(p.excludedCount).toBe(1);
    expect(p.sizeVerdict.level).toBe('ok');
  });
});

describe('PR-EXPORT-2 Fase 3 · boundary UX', () => {
  it('SelectionActions usa runPoiExport y NO importa serializers ni kml-parser', () => {
    const src = fs.readFileSync(
      path.resolve('src/components/filters/SelectionActions.tsx'),
      'utf8',
    );
    expect(src).toMatch(/runPoiExport/);
    expect(src).toMatch(/downloadPoiExportBlob/);
    expect(src).not.toMatch(/from\s+['"][^'"]*lib\/exporters['"]/);
    expect(src).not.toMatch(/\bserializePoi(Csv|Kml|Json|GeoJson)\b/);
    expect(src).not.toMatch(/exportToKML\s*\(/);
    expect(src).not.toMatch(/exportToCSV\s*\(/);
    expect(src).not.toMatch(/exportToJSON\s*\(/);
  });

  it('ExportPanel usa runPoiExport, registry y expone geojson', () => {
    const src = fs.readFileSync(
      path.resolve('src/domains/content/components/ExportPanel.tsx'),
      'utf8',
    );
    expect(src).toMatch(/runPoiExport/);
    expect(src).toMatch(/POI_EXPORTERS/);
    expect(src).toMatch(/geojson/);
    expect(src).not.toMatch(/exportToKML\s*\(/);
    expect(src).not.toMatch(/exportToCSV\s*\(/);
    expect(src).not.toMatch(/exportToJSON\s*\(/);
  });

  it('dominio sharing sigue sin importar serializers/mapper/pipeline/registry', () => {
    const sharingFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) sharingFiles.push(full);
      }
    };
    const root = path.resolve('src/domains/sharing');
    if (fs.existsSync(root)) walk(root);
    for (const f of sharingFiles) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*poi-export-mapper['"]/);
      expect(src, f).not.toMatch(/from\s+['"][^'"]*poi-export-record['"]/);
      expect(src, f).not.toMatch(/from\s+['"][^'"]*poi-export-pipeline['"]/);
      expect(src, f).not.toMatch(/from\s+['"][^'"]*lib\/exporters['"]/);
      expect(src, f).not.toMatch(/\bserializePoi(Csv|Kml|Json|GeoJson)\b/);
      expect(src, f).not.toMatch(/\bmapToPoiExportRecord\b/);
      expect(src, f).not.toMatch(/\brunPoiExport\b/);
    }
  });
});
