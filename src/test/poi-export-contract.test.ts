/**
 * PR-EXPORT-1 — Tests del contrato canónico de exportación de POIs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluatePoiExport,
  partitionForExport,
  publicExportEligible,
  internalExportEligible,
} from '@/domains/content/lib/poi-export-eligibility';
import { exportToKML, exportToJSON } from '@/lib/kml-parser';
import {
  OWNER_A,
  OWNER_B,
  poi0,
  poi1,
  poi1bEditorial,
  poi3,
  poi5,
  poi9,
  poi10,
} from '@/test/fixtures/poi-export-fixtures';
import fs from 'fs';
import path from 'path';

const ctxA = { currentUserId: OWNER_A };
const ctxNone = { currentUserId: null };

describe('PR-EXPORT-1 · evaluatePoiExport · public scope', () => {
  it('POI-0/1/1b/3/5 son NO elegibles en public', () => {
    expect(publicExportEligible(poi0())).toBe(false);
    expect(publicExportEligible(poi1())).toBe(false);
    expect(publicExportEligible(poi1bEditorial())).toBe(false);
    expect(publicExportEligible(poi3())).toBe(false);
    expect(publicExportEligible(poi5())).toBe(false);
  });
  it('POI-9 y POI-10 SÍ elegibles en public', () => {
    expect(publicExportEligible(poi9())).toBe(true);
    expect(publicExportEligible(poi10())).toBe(true);
  });
  it('POI-1b-editorial se rechaza con razón editorial-only-1b', () => {
    const r = evaluatePoiExport(poi1bEditorial(), 'public', ctxNone);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('editorial-only-1b');
  });
  it('Estado personal (visited/rated) no afecta elegibilidad', () => {
    const visited9 = { ...poi9(), customData: { visited: 'true' } };
    expect(publicExportEligible(visited9)).toBe(true);
  });
});

describe('PR-EXPORT-1 · evaluatePoiExport · internal scope (owner-gated)', () => {
  it('POI propios de cualquier nivel SÍ elegibles', () => {
    expect(internalExportEligible(poi0(OWNER_A), ctxA)).toBe(true);
    expect(internalExportEligible(poi1(OWNER_A), ctxA)).toBe(true);
    expect(internalExportEligible(poi1bEditorial(OWNER_A), ctxA)).toBe(true);
    expect(internalExportEligible(poi3(OWNER_A), ctxA)).toBe(true);
    expect(internalExportEligible(poi5(OWNER_A), ctxA)).toBe(true);
    expect(internalExportEligible(poi9(OWNER_A), ctxA)).toBe(true);
    expect(internalExportEligible(poi10(OWNER_A), ctxA)).toBe(true);
  });
  it('POI de OTRO usuario NUNCA elegibles en internal (C1)', () => {
    for (const make of [poi0, poi1, poi1bEditorial, poi3, poi5, poi9, poi10]) {
      const r = evaluatePoiExport(make(OWNER_B), 'internal', ctxA);
      expect(r.eligible).toBe(false);
      expect(r.reason).toBe('not-owner');
    }
  });
  it('Sin currentUserId todos caen como not-owner', () => {
    expect(internalExportEligible(poi9(OWNER_A), ctxNone)).toBe(false);
  });
});

describe('PR-EXPORT-1 · partitionForExport', () => {
  it('separa eligible/excluded con razones', () => {
    const locs = [poi0(), poi5(), poi9(), poi10(), poi1bEditorial()];
    const { eligible, excluded } = partitionForExport(locs, 'public', ctxNone);
    expect(eligible.map((l) => l.id)).toEqual(['poi-9', 'poi-10']);
    expect(excluded.map((e) => e.reason).sort()).toContain('editorial-only-1b');
  });
});

describe('PR-EXPORT-1 · kml-parser defensive assert', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('exportToKML scope=public descarta POI-5 colado', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = exportToKML([poi5(), poi9()], 'doc', 'general', 'public', ctxNone, { scopeProvided: true });
    expect(out).toContain('POI sano');
    expect(out).not.toContain('POI partial');
    expect(out).toContain('export_scope');
    // Warn defensivo por descarte (NO es el warn de scope ausente).
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('descartados'));
  });
  it('exportToJSON scope=internal con ctx descarta ajenos (envelope v2)', () => {
    const out = exportToJSON([poi9(OWNER_A), poi9(OWNER_B)], 'internal', ctxA, { scopeProvided: true });
    const parsed = JSON.parse(out);
    expect(parsed.export_format_version).toBe('poi-export-json-v2');
    expect(parsed.scope).toBe('internal');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].id).toBe('poi-9');
    // PR-EXPORT-2: ownerUserId NUNCA en el DTO.
    expect(parsed.items[0].ownerUserId).toBeUndefined();
  });

});

describe('PR-EXPORT-1 · C2 · scope explícito en call sites UI (vía pipeline PR-EXPORT-2)', () => {
  it('ExportPanel y SelectionActions usan runPoiExport con scope explícito y no llaman exporters legacy', () => {
    const files = [
      'src/domains/content/components/ExportPanel.tsx',
      'src/components/filters/SelectionActions.tsx',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.resolve(rel), 'utf8');
      // PR-EXPORT-2: call sites usan el pipeline canónico, no exporters legacy directamente.
      expect(src).not.toMatch(/\bexportTo(KML|CSV|JSON)\s*\(/);
      // Deben invocar runPoiExport (pipeline canónico).
      const calls = src.match(/runPoiExport\s*\(/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      // El pipeline recibe scope explícito en su payload (shorthand `scope,` o `scope: …`).
      expect(src).toMatch(/\bscope\s*[:,]/);
    }
  });
});
