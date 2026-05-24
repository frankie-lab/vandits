// PR-COUNTS-2 — Contract test (BLOQUEANTE): subtab "Con deuda" / "Sin
// enriquecer" debe consumir EXACTAMENTE el mismo array que el header
// (universeBaseLocations), el CTA, el árbol y el footer.
//
// Invariante:
//   curationBuckets[mode]  ===  resolveUniverseBase(mode, source).length
//   universeBaseLocations  ===  resolveUniverseBase(activeMode, source)
//   ⇒ subtab == header == CTA == árbol(root sum) == footer
//
// Cierra el gap histórico 22 (subtab) vs 18 (header/CTA/árbol/footer).
// Ver `docs/audits/search-filter-debt-subtab-count-mismatch-ticket.md`
// y `docs/audits/poi-debt-subtab-unification-postflight.md`.
//
// Source-level guard: prohíbe reintroducir predicados legacy de deuda
// fuera del helper canónico `resolveUniverseBase` en la rama del subtab.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveUniverseBase,
  isLocationInDebtUniverse,
  isLocationInUnenrichedUniverse,
} from '@/domains/content/lib/resolve-universe-base';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import type { GeoLocation } from '@/types/location';

function loc(id: string, over: Partial<GeoLocation> = {}): GeoLocation {
  return {
    id,
    name: `loc-${id}`,
    coordinates: { lat: 0, lng: 0 },
    documentId: 'doc',
    isApproved: true,
    ...over,
  } as GeoLocation;
}

// Fixture que reproduce el gap histórico de 4 POIs: mezcla de POIs con
// deuda objetiva (rings/geoHealth) y POIs sanos enriched.
const FIXTURE: GeoLocation[] = [
  loc('d1', { geoHealth: 'partial' } as any),
  loc('d2', { geoHealth: 'stale_name' } as any),
  loc('d3', { geoHealth: 'empty' } as any),
  loc('d4', { ownerUserId: 'u2', geoHealth: 'partial' } as any), // followed con deuda
  loc('ok1', {
    enrichedData: { descripcion: 'Texto IA suficientemente largo para pasar el verificador heurístico.' },
    geoHealth: 'ok',
  } as any),
  loc('ok2', {
    enrichedData: { descripcion: 'Otro texto IA suficientemente largo para pasar el verificador heurístico.' },
    geoHealth: 'ok',
  } as any),
];

describe('PR-COUNTS-2 — subtab "Con deuda" unificado (BLOQUEANTE)', () => {
  it('subtab.debt === universeBase("debt").length === effectiveActionSet (sin tree/selection)', () => {
    const universe = resolveUniverseBase('debt', FIXTURE);
    const subtabCount = resolveUniverseBase('debt', FIXTURE).length;
    const effectiveActionSet = universe.filter((l) =>
      matchesLocationFilters(l, {}, { includeHealth: false }),
    );

    expect(subtabCount).toBe(universe.length);
    expect(subtabCount).toBe(effectiveActionSet.length);
    // Counts exactos (no redondeo): toBe, no toBeCloseTo.
    expect(subtabCount).toBe(4);
  });

  it('subtab.unenriched === universeBase("unenriched").length === effectiveActionSet', () => {
    const universe = resolveUniverseBase('unenriched', FIXTURE);
    const subtabCount = resolveUniverseBase('unenriched', FIXTURE).length;
    const effectiveActionSet = universe.filter((l) =>
      matchesLocationFilters(l, {}, { includeHealth: false }),
    );
    expect(subtabCount).toBe(universe.length);
    expect(subtabCount).toBe(effectiveActionSet.length);
  });

  it('predicado canónico: ningún POI cuenta en subtab y NO en universeBase (y viceversa)', () => {
    const inSubtab = FIXTURE.filter(isLocationInDebtUniverse);
    const inUniverse = resolveUniverseBase('debt', FIXTURE);
    expect(inSubtab.map((l) => l.id).sort()).toEqual(
      inUniverse.map((l) => l.id).sort(),
    );
  });

  it('unenriched predicado canónico: subtab == universeBase exactamente', () => {
    const inSubtab = FIXTURE.filter(isLocationInUnenrichedUniverse);
    const inUniverse = resolveUniverseBase('unenriched', FIXTURE);
    expect(inSubtab.map((l) => l.id).sort()).toEqual(
      inUniverse.map((l) => l.id).sort(),
    );
  });
});

describe('PR-COUNTS-2 — source-level guard (BLOQUEANTE)', () => {
  const FILTERBAR_PATH = resolve(__dirname, '../components/FilterBar.tsx');
  const src = readFileSync(FILTERBAR_PATH, 'utf8');

  it('subtab counts derivan de resolveUniverseBase (no predicados legacy)', () => {
    expect(src).toMatch(/conDeuda:\s*resolveUniverseBase\(\s*['"]debt['"]/);
    expect(src).toMatch(/sinEnriquecer:\s*resolveUniverseBase\(\s*['"]unenriched['"]/);
  });

  it('subtab y header comparten EXACTAMENTE la misma fuente (allLocationsForUniverseSource)', () => {
    // Ambos call sites deben resolver al MISMO array. Hoy: el header usa
    // `allLocationsForUniverse` y el subtab usa `allLocationsForUniverseSource`,
    // pero existe el alias `const allLocationsForUniverse = allLocationsForUniverseSource;`
    // que garantiza identidad referencial.
    const subtabSource = /resolveUniverseBase\(\s*['"]debt['"]\s*,\s*([A-Za-z_$][\w$]*)/.exec(src);
    const headerSource = /resolveUniverseBase\(\s*activeModeUniverse\s*,\s*([A-Za-z_$][\w$]*)/.exec(src);
    expect(subtabSource?.[1]).toBeTruthy();
    expect(headerSource?.[1]).toBeTruthy();
    const subId = subtabSource![1];
    const hdrId = headerSource![1];
    if (subId !== hdrId) {
      // Debe existir alias directo en una de las dos direcciones.
      const aliasA = new RegExp(`const\\s+${hdrId}\\s*=\\s*${subId}\\b`);
      const aliasB = new RegExp(`const\\s+${subId}\\s*=\\s*${hdrId}\\b`);
      expect(aliasA.test(src) || aliasB.test(src)).toBe(true);
    }
  });

  it('no reaparece getVisibleUniverseLocations como fuente de subtab/header', () => {
    // Map universe (fuente B) NO debe alimentar contadores de catálogo.
    expect(src).not.toMatch(/allLocationsForUniverseSource[^=]*=\s*[^;]*getVisibleUniverseLocations/);
  });
});
