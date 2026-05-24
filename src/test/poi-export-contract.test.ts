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

describe('PR-EXPORT-1 · C2 · scope explícito en call sites UI (vía pipeline PR-EXPORT-2 + ExportResolver PR-EXPORT-3)', () => {
  it('ExportPanel y SelectionActions usan el pipeline canónico (runPoiExport directo o vía ExportResolver) con scope explícito', () => {
    // Canon evolution PR-EXPORT-3: los call sites pueden delegar en <ExportResolver*>
    // (que es el ÚNICO consumidor UI de runPoiExport). Pipeline + scope explícito siguen siendo obligatorios,
    // pero pueden vivir dentro del resolver compartido.
    const callSiteFiles = [
      'src/domains/content/components/ExportPanel.tsx',
      'src/components/filters/SelectionActions.tsx',
    ];
    for (const rel of callSiteFiles) {
      const src = fs.readFileSync(path.resolve(rel), 'utf8');
      // Prohibido invocar exporters legacy directamente.
      expect(src).not.toMatch(/\bexportTo(KML|CSV|JSON)\s*\(/);
      // Debe usar el pipeline canónico, ya sea directo o vía ExportResolver.
      const usesPipelineDirect = /runPoiExport\s*\(/.test(src);
      const usesResolver = /ExportResolver(Body|Dialog)?\b/.test(src);
      expect(usesPipelineDirect || usesResolver).toBe(true);
    }

    // El resolver es el único consumidor del pipeline en UI y DEBE pasar scope explícito.
    const resolverSrc = fs.readFileSync(
      path.resolve('src/domains/content/components/ExportResolver.tsx'),
      'utf8',
    );
    const calls = resolverSrc.match(/runPoiExport\s*\(/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(resolverSrc).toMatch(/\bscope\s*[:,]/);
    expect(resolverSrc).toMatch(/scopeProvided\s*:\s*true/);
  });
});
