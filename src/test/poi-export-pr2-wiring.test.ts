/**
 * PR-EXPORT-2 · Fase 3A — wiring fix de ExportPanel.
 *
 * Tests del resolver + grep estáticos verificando que el panel acepta
 * fuentes explícitas, resuelve selección cross-document y respeta el
 * fallback al universo filtrado sin exigir `selectedDocument`.
 *
 * NO renderiza componentes React (mismo enfoque que `poi-export-pr2-ux.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { GeoLocation, KMLDocument } from '@/types/location';
import {
  resolveExportCandidates,
  describeExportOrigin,
} from '@/domains/content/lib/export-source-resolver';
import { runPoiExport } from '@/domains/content/lib/poi-export-pipeline';
import { OWNER_A, poi5, poi9 } from '@/test/fixtures/poi-export-fixtures';

const OWNER = OWNER_A;

function mkPoi(base: GeoLocation, id: string): GeoLocation {
  return { ...base, id, name: id };
}

function mkDoc(id: string, locs: GeoLocation[]): KMLDocument {
  return {
    id,
    name: id,
    fileName: `${id}.kml`,
    locations: locs,
    uploadedAt: new Date(0),
    userId: OWNER,
  };
}

describe('PR-EXPORT-2 Fase 3A · resolveExportCandidates', () => {
  it('prioridad 1: locations explícitas ganan sobre selección y filtrado', () => {
    const explicit = [mkPoi(poi9(OWNER), 'x1'), mkPoi(poi9(OWNER), 'x2')];
    const res = resolveExportCandidates({
      explicitLocations: explicit,
      selectedIds: new Set(['ignored']),
      documents: [mkDoc('d1', [mkPoi(poi9(OWNER), 'ignored')])],
      getFiltered: () => [mkPoi(poi9(OWNER), 'filtered')],
    });
    expect(res.origin).toBe('explicit');
    expect(res.locations.map((l) => l.id)).toEqual(['x1', 'x2']);
  });

  it('prioridad 2: selección cross-document — recorre TODOS los documentos', () => {
    const a1 = mkPoi(poi9(OWNER), 'a1');
    const a2 = mkPoi(poi9(OWNER), 'a2');
    const b1 = mkPoi(poi9(OWNER), 'b1');
    const docs = [mkDoc('A', [a1, a2]), mkDoc('B', [b1])];
    const res = resolveExportCandidates({
      selectedIds: new Set(['a2', 'b1']),
      documents: docs,
      getFiltered: () => [],
    });
    expect(res.origin).toBe('selection');
    expect(res.locations.map((l) => l.id).sort()).toEqual(['a2', 'b1']);
  });

  it('prioridad 3: fallback al universo filtrado sin selección', () => {
    const filtered = [mkPoi(poi9(OWNER), 'f1')];
    const res = resolveExportCandidates({
      selectedIds: new Set(),
      documents: [],
      getFiltered: () => filtered,
    });
    expect(res.origin).toBe('filtered');
    expect(res.locations).toEqual(filtered);
  });

  it('empty: sin nada → origin empty', () => {
    const res = resolveExportCandidates({
      selectedIds: new Set(),
      documents: [],
      getFiltered: () => [],
    });
    expect(res.origin).toBe('empty');
    expect(res.locations).toEqual([]);
  });

  it('selección dedupe por id (POI repetido entre documentos no duplica)', () => {
    const shared = mkPoi(poi9(OWNER), 'shared');
    const docs = [mkDoc('A', [shared]), mkDoc('B', [shared])];
    const res = resolveExportCandidates({
      selectedIds: new Set(['shared']),
      documents: docs,
      getFiltered: () => [],
    });
    expect(res.locations).toHaveLength(1);
  });

  it('describeExportOrigin produce label legible', () => {
    expect(describeExportOrigin('selection', 3)).toMatch(/Selección actual.*3/);
    expect(describeExportOrigin('empty', 0)).toMatch(/Sin POIs/i);
  });
});

describe('PR-EXPORT-2 Fase 3A · contract con runPoiExport', () => {
  const ctx = { currentUserId: OWNER };

  it('2 POIs sin elegibilidad pública → no-eligible con totalCount=2 (0/2, no 0/0)', () => {
    const locations = [mkPoi(poi5(OWNER), 'p1'), mkPoi(poi5(OWNER), 'p2')];
    const outcome = runPoiExport({
      locations,
      format: 'csv',
      scope: 'public',
      ctx,
      documentName: 'seleccion',
      origin: 'panel',
    });
    expect(outcome.kind).toBe('no-eligible');
    if (outcome.kind === 'no-eligible') {
      expect(outcome.partition.totalCount).toBe(2);
      expect(outcome.partition.eligibleCount).toBe(0);
      expect(outcome.partition.excludedCount).toBe(2);
    }
  });

  it('scope internal con owner → 2/2 exportables', () => {
    const locations = [mkPoi(poi5(OWNER), 'p1'), mkPoi(poi5(OWNER), 'p2')];
    const outcome = runPoiExport({
      locations,
      format: 'csv',
      scope: 'internal',
      ctx,
      documentName: 'seleccion',
      origin: 'panel',
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.eligibleCount).toBe(2);
      expect(outcome.exportedIds.sort()).toEqual(['p1', 'p2']);
    }
  });

  it('runPoiExport recibe el set EXACTO pasado por el caller (selección cross-doc)', () => {
    const a = mkPoi(poi9(OWNER), 'a');
    const b = mkPoi(poi9(OWNER), 'b');
    const c = mkPoi(poi9(OWNER), 'c'); // NO seleccionado
    const selected = resolveExportCandidates({
      selectedIds: new Set(['a', 'b']),
      documents: [mkDoc('A', [a, c]), mkDoc('B', [b])],
      getFiltered: () => [],
    });
    const outcome = runPoiExport({
      locations: selected.locations,
      format: 'csv',
      scope: 'public',
      ctx,
      documentName: 'seleccion',
      origin: 'panel',
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.exportedIds.sort()).toEqual(['a', 'b']);
    }
  });
});

describe('PR-EXPORT-2 Fase 3A · wiring estático', () => {
  it('ExportPanel acepta `source` y usa el resolver canónico', () => {
    const src = fs.readFileSync(
      path.resolve('src/domains/content/components/ExportPanel.tsx'),
      'utf8',
    );
    expect(src).toMatch(/ExportPanelSource/);
    expect(src).toMatch(/resolveExportCandidates/);
    // ya no debe exigir selectedDocument para habilitar export
    expect(src).not.toMatch(/!selectedDocument\s*\|\|\s*isExporting/);
    // helper de etiqueta de origen
    expect(src).toMatch(/describeExportOrigin/);
  });

  it('Index.tsx cablea bridge `lovable:open-export-panel` y pasa source al panel', () => {
    const src = fs.readFileSync(path.resolve('src/pages/Index.tsx'), 'utf8');
    expect(src).toMatch(/lovable:open-export-panel/);
    expect(src).toMatch(/exportPanelSource/);
    expect(src).toMatch(/<ExportPanel\s+source=\{exportPanelSource\}\s*\/>/);
  });
});
