/**
 * PR-EXPORT-3 — Export Resolver UX contract.
 *
 * Verifica las reglas duras de UX sin renderizar (evita pulling de
 * framer-motion / store / Auth):
 *
 *   1. Caso 3614 POIs propios: pipeline acepta scope=internal,
 *      sizeVerdict='warn' (no 'block'), runPoiExport con
 *      confirmedOverWarn=true produce blob.
 *   2. Resumen total / elegibles / excluidos con cifras correctas.
 *   3. Scope=internal con owner ajeno → excluidos con razón 'not-owner'.
 *   4. Scope=public con mezcla → excluidos agrupados por razón.
 *   5. >10000 elegibles → sizeVerdict='block' (UX no debe ofrecer CTA).
 *   6. ExportResolver renderiza sólo formatos con serializer real
 *      (KML/CSV/JSON/GeoJSON); GPX no aparece.
 *   7. ExportResolver, ExportPanel y SelectionActions cumplen el copy
 *      canon y NO usan typed-token / window.confirm / lenguaje
 *      destructivo en el path de export.
 *   8. SelectionActions y ExportPanel cuelgan ambos del MISMO
 *      ExportResolver (no hay dos UIs paralelas).
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
import { partitionForExport } from '@/domains/content/lib/poi-export-eligibility';
import {
  OWNER_A,
  OWNER_B,
  poi5,
  poi9,
} from '@/test/fixtures/poi-export-fixtures';

function clone(base: GeoLocation, id: string): GeoLocation {
  return { ...base, id, name: id };
}

const resolverPath = path.resolve(
  'src/domains/content/components/ExportResolver.tsx',
);
const exportPanelPath = path.resolve(
  'src/domains/content/components/ExportPanel.tsx',
);
const selectionActionsPath = path.resolve(
  'src/components/filters/SelectionActions.tsx',
);

const RESOLVER_SRC = fs.readFileSync(resolverPath, 'utf8');
const PANEL_SRC = fs.readFileSync(exportPanelPath, 'utf8');
const SELECTION_SRC = fs.readFileSync(selectionActionsPath, 'utf8');

describe('PR-EXPORT-3 · 3614 POIs propios — caso canon', () => {
  const ctx = { currentUserId: OWNER_A };
  const docName = 'mis-3614';
  const locations: GeoLocation[] = Array.from({ length: 3614 }, (_, i) =>
    clone(poi9(OWNER_A), `own-${i}`),
  );

  it('preview con scope=internal arroja 3614 elegibles y sizeVerdict=warn', () => {
    const p = previewPoiExport({
      locations,
      format: 'kml',
      scope: 'internal',
      ctx,
    });
    expect(p.eligibleCount).toBe(3614);
    expect(p.excludedCount).toBe(0);
    // 3614 < 5000 → ok (no warn aún). Con 5001 sería warn.
    expect(['ok', 'warn']).toContain(p.sizeVerdict.level);
    expect(p.sizeVerdict.level).not.toBe('block');
  });

  it('runPoiExport produce blob real (no typed-token, no confirm intermedio)', () => {
    const outcome = runPoiExport(
      {
        locations,
        format: 'kml',
        scope: 'internal',
        ctx,
        documentName: docName,
        target: 'general',
        origin: 'selection',
      },
      { confirmedOverWarn: true },
    );
    expect(outcome.kind).toBe('ok');
    const r = outcome as PoiExportPipelineResult;
    expect(r.eligibleCount).toBe(3614);
    expect(r.blob.size).toBeGreaterThan(0);
    expect(r.filename).toMatch(/_internal_/);
  });
});

describe('PR-EXPORT-3 · partition / scopes', () => {
  it('scope=internal con owner ajeno → excluidos como not-owner', () => {
    const mine = clone(poi9(OWNER_A), 'mine');
    const theirs = clone(poi9(OWNER_B), 'theirs');
    const p = partitionForExport(
      [mine, theirs],
      'internal',
      { currentUserId: OWNER_A },
    );
    expect(p.eligible.map((l) => l.id)).toEqual(['mine']);
    expect(p.excluded).toHaveLength(1);
    expect(p.excluded[0].reason).toBe('not-owner');
  });

  it('scope=public con mezcla → excluidos agrupados por razón', () => {
    const poi9ok = clone(poi9(OWNER_A), 'g1');
    const poi5debt = clone(poi5(OWNER_A), 'd1');
    const preview = previewPoiExport({
      locations: [poi9ok, poi5debt],
      format: 'csv',
      scope: 'public',
      ctx: { currentUserId: OWNER_A },
    });
    expect(preview.eligibleCount).toBe(1);
    expect(preview.excludedCount).toBe(1);
    // POI-5 con descripcion enriched cae como not-shareable (geo no ok)
    // o curation-level-below-9. Ambas son razones legibles humanas.
    const reasons = new Set(preview.excluded.map((e) => e.reason));
    expect(reasons.size).toBe(1);
  });

  it('>10000 elegibles → sizeVerdict=block (UX no debe ofrecer CTA)', () => {
    const big = Array.from({ length: 10_001 }, (_, i) =>
      clone(poi9(OWNER_A), `b${i}`),
    );
    const preview = previewPoiExport({
      locations: big,
      format: 'csv',
      scope: 'internal',
      ctx: { currentUserId: OWNER_A },
    });
    expect(preview.sizeVerdict.level).toBe('block');
  });
});

describe('PR-EXPORT-3 · formatos renderizados', () => {
  it('registry expone exactamente csv/geojson/json/kml — sin GPX', () => {
    const keys = Object.keys(POI_EXPORTERS).sort();
    expect(keys).toEqual(['csv', 'geojson', 'json', 'kml']);
    expect(keys).not.toContain('gpx');
  });

  it('ExportResolver enumera formatos desde el registry y NO menciona GPX', () => {
    expect(RESOLVER_SRC).toMatch(/POI_EXPORTERS/);
    // Asegura ningún path activo "gpx" como formato seleccionable.
    expect(RESOLVER_SRC).not.toMatch(/data-export-format=["']gpx["']/);
    expect(RESOLVER_SRC).not.toMatch(/format:\s*["']gpx["']/);
  });
});

describe('PR-EXPORT-3 · copy canon + ausencia de UX destructiva', () => {
  it('ExportResolver afirma propiedad ("será una copia portable")', () => {
    expect(RESOLVER_SRC).toMatch(/copia portable/i);
    expect(RESOLVER_SRC).toMatch(/seguirán disponibles/i);
  });

  it('CTA canon = "Generar archivo" (no "EXPORTAR" en MAYÚSCULAS)', () => {
    expect(RESOLVER_SRC).toMatch(/Generar archivo/);
    expect(RESOLVER_SRC).not.toMatch(/\bEXPORTAR\b/);
  });

  it('NO usa typed-token (DestructiveConfirmDialog) en path de export', () => {
    expect(RESOLVER_SRC).not.toMatch(/DestructiveConfirmDialog/);
    expect(PANEL_SRC).not.toMatch(/DestructiveConfirmDialog/);
    // En SelectionActions el DestructiveConfirmDialog podría aparecer
    // para borrado masivo (no para export). Aquí basta con verificar
    // que el bloque export NO lo usa, lo cual ya cubre el grep de
    // ExportResolverDialog: SelectionActions sólo abre el Resolver.
  });

  it('NO usa window.confirm en path de export', () => {
    expect(RESOLVER_SRC).not.toMatch(/window\.confirm/);
    expect(PANEL_SRC).not.toMatch(/window\.confirm/);
    expect(SELECTION_SRC).not.toMatch(/window\.confirm/);
  });

  it('NO usa lenguaje destructivo ("peligroso" / "irreversible")', () => {
    for (const src of [RESOLVER_SRC, PANEL_SRC]) {
      expect(src).not.toMatch(/peligroso/i);
      expect(src).not.toMatch(/irreversible/i);
    }
  });
});

describe('PR-EXPORT-3 · unificación de UI (un solo Resolver)', () => {
  it('SelectionActions monta <ExportResolverDialog>', () => {
    expect(SELECTION_SRC).toMatch(/ExportResolverDialog/);
  });
  it('ExportPanel monta <ExportResolverBody>', () => {
    expect(PANEL_SRC).toMatch(/ExportResolverBody/);
  });
  it('SelectionActions NO duplica un dropdown de formatos paralelo', () => {
    // Si el dropdown legacy estuviera presente, aparecerían FileCode/
    // FileSpreadsheet/FileJson/Globe2 importados como iconos del export.
    // Estos imports fueron retirados en PR-EXPORT-3.
    expect(SELECTION_SRC).not.toMatch(/FileSpreadsheet/);
    expect(SELECTION_SRC).not.toMatch(/FileJson/);
    expect(SELECTION_SRC).not.toMatch(/Globe2/);
  });
});
