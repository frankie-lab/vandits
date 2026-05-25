/**
 * PR-EXPORT-4 — Semántica "Mis datos" (internal) vs "Compartible" (public).
 *
 * Reglas DURAS bajo test:
 *   1. En scope=internal SÓLO se excluyen POIs por `invalid-coordinates`
 *      o `not-owner`. Cualquier POI propio con coords válidas (imported,
 *      pending, private, followers-only, POI-3/5, etc.) entra.
 *   2. En scope=public se mantienen las exclusiones canónicas
 *      (not-enriched, not-shareable, curation-level-below-9,
 *      editorial-only-1b).
 *   3. Contadores derivados internal vs public son diferentes para una
 *      misma selección mixta.
 *   4. ExportResolver.tsx aplica copy/contadores scope-aware (grep
 *      estático). En internal no aparece "No incluidos" genérico ni el
 *      desglose por razones públicas.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { GeoLocation } from '@/types/location';
import {
  partitionForExport,
  evaluatePoiExport,
} from '@/domains/content/lib/poi-export-eligibility';
import { previewPoiExport } from '@/domains/content/lib/poi-export-pipeline';
import {
  OWNER_A,
  OWNER_B,
  poi0,
  poi1,
  poi1bEditorial,
  poi3,
  poi5,
  poi9,
} from '@/test/fixtures/poi-export-fixtures';

function withId(base: GeoLocation, id: string): GeoLocation {
  return { ...base, id, name: id };
}

const RESOLVER_SRC = fs.readFileSync(
  path.resolve('src/domains/content/components/ExportResolver.tsx'),
  'utf8',
);

describe('PR-EXPORT-4 · internal exporta TODO POI propio con coords válidas', () => {
  const ctx = { currentUserId: OWNER_A };

  it('owned imported (POI-1, sin enriched) → eligible en internal', () => {
    const r = evaluatePoiExport(poi1(OWNER_A), 'internal', ctx);
    expect(r.eligible).toBe(true);
  });

  it('owned pending/empty (POI-0) → eligible en internal si tiene coords', () => {
    const r = evaluatePoiExport(poi0(OWNER_A), 'internal', ctx);
    expect(r.eligible).toBe(true);
  });

  it('owned con visibility=private → eligible en internal', () => {
    const loc = { ...poi1(OWNER_A), visibility: 'private' } as GeoLocation;
    expect(evaluatePoiExport(loc, 'internal', ctx).eligible).toBe(true);
  });

  it('owned con visibility=followers → eligible en internal', () => {
    const loc = { ...poi1(OWNER_A), visibility: 'followers' } as GeoLocation;
    expect(evaluatePoiExport(loc, 'internal', ctx).eligible).toBe(true);
  });

  it('owned POI-3 (geo broken) → eligible en internal', () => {
    expect(evaluatePoiExport(poi3(OWNER_A), 'internal', ctx).eligible).toBe(true);
  });

  it('owned POI-5 (geo partial) → eligible en internal', () => {
    expect(evaluatePoiExport(poi5(OWNER_A), 'internal', ctx).eligible).toBe(true);
  });

  it('owned POI-1b-editorial → eligible en internal (no es vía pública)', () => {
    expect(evaluatePoiExport(poi1bEditorial(OWNER_A), 'internal', ctx).eligible).toBe(true);
  });

  it('not-owned POI → NO eligible en internal (razón=not-owner)', () => {
    const r = evaluatePoiExport(poi9(OWNER_B), 'internal', ctx);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('not-owner');
  });

  it('owned con coords inválidas → NO eligible (razón=invalid-coordinates)', () => {
    const loc = {
      ...poi9(OWNER_A),
      coordinates: { lat: NaN, lng: NaN },
    } as GeoLocation;
    const r = evaluatePoiExport(loc, 'internal', ctx);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('invalid-coordinates');
  });
});

describe('PR-EXPORT-4 · public mantiene exclusiones canónicas', () => {
  const ctx = { currentUserId: OWNER_A };

  it('not-enriched (POI-1) → NO eligible en public', () => {
    expect(evaluatePoiExport(poi1(OWNER_A), 'public', ctx).eligible).toBe(false);
  });

  it('editorial-only-1b → NO eligible en public', () => {
    const r = evaluatePoiExport(poi1bEditorial(OWNER_A), 'public', ctx);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('editorial-only-1b');
  });

  it('POI-5 (debt) → NO eligible en public', () => {
    expect(evaluatePoiExport(poi5(OWNER_A), 'public', ctx).eligible).toBe(false);
  });

  it('POI-9 enriched + shareable → eligible en public', () => {
    expect(evaluatePoiExport(poi9(OWNER_A), 'public', ctx).eligible).toBe(true);
  });
});

describe('PR-EXPORT-4 · contadores internal vs public separados', () => {
  const ctx = { currentUserId: OWNER_A };

  it('caso 3614: 3335 propios + 279 ajenos → internal=3335 elegibles, foreign=279, technical=0', () => {
    const mine: GeoLocation[] = Array.from({ length: 3335 }, (_, i) =>
      withId(poi9(OWNER_A), `mine-${i}`),
    );
    const theirs: GeoLocation[] = Array.from({ length: 279 }, (_, i) =>
      withId(poi9(OWNER_B), `their-${i}`),
    );
    const all = [...mine, ...theirs];

    const internal = partitionForExport(all, 'internal', ctx);
    expect(internal.eligible).toHaveLength(3335);
    const foreign = internal.excluded.filter((e) => e.reason === 'not-owner');
    const technical = internal.excluded.filter((e) => e.reason !== 'not-owner');
    expect(foreign).toHaveLength(279);
    expect(technical).toHaveLength(0);

    // En public, los 279 ajenos también caen (not-owner cuenta sólo en internal,
    // pero en public siguen excluidos por las reglas públicas si no son shareable).
    // Aquí son POI-9 enriched del OWNER_B, así que SÍ son eligibles en public.
    const pub = partitionForExport(all, 'public', { currentUserId: OWNER_A });
    expect(pub.eligible.length).toBe(3614);
  });

  it('mezcla con POI propios no-enriched: internal incluye, public excluye', () => {
    const docs: GeoLocation[] = [
      withId(poi9(OWNER_A), 'g1'),
      withId(poi1(OWNER_A), 'p1'),
      withId(poi1(OWNER_A), 'p2'),
    ];
    const internalP = previewPoiExport({
      locations: docs,
      format: 'csv',
      scope: 'internal',
      ctx,
    });
    const publicP = previewPoiExport({
      locations: docs,
      format: 'csv',
      scope: 'public',
      ctx,
    });
    expect(internalP.eligibleCount).toBe(3);
    expect(publicP.eligibleCount).toBe(1);
    expect(internalP.eligibleCount).not.toBe(publicP.eligibleCount);
  });
});

describe('PR-EXPORT-4 · ExportResolver UX copy scope-aware (grep)', () => {
  it('contiene SCOPE_COPY con perfiles internal/public', () => {
    expect(RESOLVER_SRC).toMatch(/SCOPE_COPY/);
    expect(RESOLVER_SRC).toMatch(/Tus ubicaciones/);
    expect(RESOLVER_SRC).toMatch(/Exportables/);
    expect(RESOLVER_SRC).toMatch(/No exportables por error técnico/);
    expect(RESOLVER_SRC).toMatch(/pertenecen a otras personas/);
    expect(RESOLVER_SRC).toMatch(/No compartibles públicamente/);
  });

  it('NO contiene la etiqueta plana "No incluidos" del resumen legacy', () => {
    expect(RESOLVER_SRC).not.toMatch(/>\s*No incluidos\s*</);
  });

  it('expone contadores derivados separados (data-export-foreign-count, etc.)', () => {
    expect(RESOLVER_SRC).toMatch(/data-export-foreign-count/);
    expect(RESOLVER_SRC).toMatch(/data-export-technical-count/);
    expect(RESOLVER_SRC).toMatch(/data-export-public-excluded-count/);
  });

  it('el desglose de razones SÓLO se renderiza si scope==="public"', () => {
    expect(RESOLVER_SRC).toMatch(/scope === 'public' && exclusionGroups/);
  });

  it('previewPoiExport recibe el scope del state (no scope literal hardcoded)', () => {
    // El único `scope:` literal permitido en este fichero es en los
    // perfiles SCOPE_COPY y en el initialScope por defecto del prop.
    // Cualquier `scope: 'public'` o `scope: 'internal'` dentro de
    // previewPoiExport / runPoiExport sería un bug PR-EXPORT-4.
    const m = RESOLVER_SRC.match(/previewPoiExport\(\{[\s\S]*?\}\)/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/scope,/); // pasa la variable, no literal
    expect(m![0]).not.toMatch(/scope:\s*['"](public|internal)['"]/);
  });
});
