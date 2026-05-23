// Contract test for resolveUniverseBase (SoT del universo activo del panel
// "Buscar y Filtrar"). Ver `docs/audits/search-filter-maintain-tree-universe-plan.md`.
//
// Cubre:
//  - mode='all' devuelve el universo completo intacto.
//  - mode='debt' delega en `getPointHealthRings` + `geoHealth` objetivo.
//  - mode='unenriched' delega en `isPointEnriched` y excluye origen app/external.
//  - effectiveActionSet (con/sin selección manual).
//
// No reimplementa predicados: usa los helpers canónicos importados desde el
// propio módulo (vía side-effects en los fixtures).

import { describe, it, expect } from 'vitest';
import type { GeoLocation } from '@/types/location';
import {
  resolveUniverseBase,
  isLocationInDebtUniverse,
  isLocationInUnenrichedUniverse,
  getUniverseBaseLabel,
} from '@/domains/content/lib/resolve-universe-base';

// Fixtures mínimos. Tipos castados a GeoLocation para evitar acoplar el test
// a campos opcionales no relevantes al contrato del universo.
const enriched = {
  id: 'enriched-1',
  name: 'Enriched POI',
  enrichedData: { descripcion: 'Una descripción enriquecida con suficiente longitud para superar el umbral de isUnverifiableDescription que exige al menos 60 caracteres.' },
  geoHealth: 'ok',
} as unknown as GeoLocation;

const importedClean = {
  id: 'imported-1',
  name: 'Imported sin IA',
  enrichedData: null,
  geoHealth: 'ok',
} as unknown as GeoLocation;

const importedPartialGeo = {
  id: 'imported-2',
  name: 'Imported con geoHealth partial',
  enrichedData: null,
  geoHealth: 'partial',
} as unknown as GeoLocation;

const enrichedHardError = {
  id: 'enriched-2',
  name: 'Enriched con hard error',
  enrichedData: { descripcion: 'Texto IA' },
  geoHealth: 'empty',
} as unknown as GeoLocation;

const appOrigin = {
  id: 'app-1',
  name: 'POI app catálogo',
  enrichedData: null,
  source_kind: 'app',
  geoHealth: 'ok',
} as unknown as GeoLocation;

const all = [enriched, importedClean, importedPartialGeo, enrichedHardError, appOrigin];

describe('resolveUniverseBase', () => {
  it("mode='all' devuelve el universo completo intacto", () => {
    expect(resolveUniverseBase('all', all)).toEqual(all);
  });

  it("mode='debt' solo POIs con rings o geoHealth objetivo", () => {
    const out = resolveUniverseBase('debt', all);
    const ids = out.map((l) => l.id);
    // importedPartialGeo (geoHealth=partial) y enrichedHardError (geoHealth=empty)
    // entran. Los enriched/sanos y los importados limpios sin deuda no entran.
    expect(ids).toContain('imported-2');
    expect(ids).toContain('enriched-2');
    expect(ids).not.toContain('enriched-1');
    expect(ids).not.toContain('imported-1');
  });

  it("mode='unenriched' excluye enriched y origen app/external", () => {
    const out = resolveUniverseBase('unenriched', all);
    const ids = out.map((l) => l.id);
    expect(ids).toContain('imported-1');
    expect(ids).toContain('imported-2');
    expect(ids).not.toContain('enriched-1');
    expect(ids).not.toContain('enriched-2');
    expect(ids).not.toContain('app-1'); // origen 'app' no entra
  });

  it('isLocationInDebtUniverse y isLocationInUnenrichedUniverse son predicados puros', () => {
    expect(isLocationInDebtUniverse(importedPartialGeo)).toBe(true);
    expect(isLocationInDebtUniverse(enriched)).toBe(false);
    expect(isLocationInUnenrichedUniverse(importedClean)).toBe(true);
    expect(isLocationInUnenrichedUniverse(enriched)).toBe(false);
    expect(isLocationInUnenrichedUniverse(appOrigin)).toBe(false);
  });

  it('suma raíces por modo es coherente (invariante de árbol)', () => {
    // El árbol Geo agrupa por raíces; la suma de sus counts debe igualar |universeBase|.
    expect(resolveUniverseBase('all', all).length).toBe(all.length);
    expect(resolveUniverseBase('debt', all).length).toBe(
      all.filter(isLocationInDebtUniverse).length,
    );
    expect(resolveUniverseBase('unenriched', all).length).toBe(
      all.filter(isLocationInUnenrichedUniverse).length,
    );
  });

  it('etiqueta corta del universo activo', () => {
    expect(getUniverseBaseLabel('all')).toBeNull();
    expect(getUniverseBaseLabel('debt')).toBe('con deuda');
    expect(getUniverseBaseLabel('unenriched')).toBe('sin enriquecer');
  });
});

describe('effectiveActionSet (regla del plan UX)', () => {
  // El cálculo vive inline en FilterBar; este test documenta el contrato.
  function effectiveActionSet(
    universeBase: GeoLocation[],
    treeSelectionIds: Set<string> | null,
    userSelectionIds: Set<string> | null,
  ): GeoLocation[] {
    const treeFiltered = treeSelectionIds
      ? universeBase.filter((l) => treeSelectionIds.has(l.id))
      : universeBase;
    if (!userSelectionIds || userSelectionIds.size === 0) return treeFiltered;
    return treeFiltered.filter((l) => userSelectionIds.has(l.id));
  }

  const debtUniverse = resolveUniverseBase('debt', all);

  it('sin selección manual = universeBase ∩ treeSelection', () => {
    const tree = new Set(['imported-2']);
    expect(effectiveActionSet(debtUniverse, tree, null).map((l) => l.id)).toEqual([
      'imported-2',
    ]);
  });

  it('con selección manual = universeBase ∩ treeSelection ∩ userSelection', () => {
    const tree = new Set(['imported-2', 'enriched-2']);
    const user = new Set(['enriched-2']);
    expect(effectiveActionSet(debtUniverse, tree, user).map((l) => l.id)).toEqual([
      'enriched-2',
    ]);
  });

  it('selección manual fuera de universeBase no contamina', () => {
    const tree = new Set(['imported-2']);
    const user = new Set(['imported-2', 'enriched-1' /* fuera de debt */]);
    expect(effectiveActionSet(debtUniverse, tree, user).map((l) => l.id)).toEqual([
      'imported-2',
    ]);
  });
});
