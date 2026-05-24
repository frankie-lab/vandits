// PR-COUNTS-1 — Contract test: `catalogVisibleUniverse` es la única fuente
// para contadores de catálogo. Cierra el gap Top bar (5095) vs FilterBar
// (5100) detectado al usar `getVisibleUniverseLocations()` (universo de
// mapa, fuente B) como base de FilterBar.
//
// Canon: docs/contracts/poi-counts-canon.md §3.A.
// Postflight: docs/audits/poi-visible-counts-unification-postflight.md.

import { describe, it, expect } from 'vitest';
import { getVisibleCatalogUniverse } from '@/domains/content/lib/visible-catalog-universe';
import { getBucketStats, getLocationBucket } from '@/domains/content/lib/location-bucket';

const UID = 'user-self';
const OTHER = 'user-other';

function loc(id: string, ownerUserId: string | null, isApproved: boolean) {
  return { id, ownerUserId, isApproved };
}

describe('PR-COUNTS-1 — getVisibleCatalogUniverse', () => {
  // Fixture realista: 3 propios aprobados, 1 propio borrador, 2 seguidos
  // aprobados, 1 seguido no aprobado, 1 detached ajeno no aprobado.
  const fixture = [
    loc('mine-1', UID, true),
    loc('mine-2', UID, true),
    loc('mine-3', UID, true),
    loc('mine-draft', UID, false),
    loc('followed-1', OTHER, true),
    loc('followed-2', OTHER, true),
    loc('followed-unapproved', OTHER, false),
    loc('detached-stranger-unapproved', OTHER, false),
  ];

  it('incluye myCatalog + followedCatalog (aprobados)', () => {
    const out = getVisibleCatalogUniverse(fixture, UID);
    const ids = out.map((l) => l.id).sort();
    expect(ids).toEqual(['followed-1', 'followed-2', 'mine-1', 'mine-2', 'mine-3']);
    expect(out.length).toBe(5);
  });

  it('excluye propios no aprobados (myWorkspace)', () => {
    const out = getVisibleCatalogUniverse(fixture, UID);
    expect(out.find((l) => l.id === 'mine-draft')).toBeUndefined();
  });

  it('excluye seguidos no aprobados (followedShared)', () => {
    const out = getVisibleCatalogUniverse(fixture, UID);
    expect(out.find((l) => l.id === 'followed-unapproved')).toBeUndefined();
  });

  it('excluye detached ajenos no aprobados', () => {
    const out = getVisibleCatalogUniverse(fixture, UID);
    expect(out.find((l) => l.id === 'detached-stranger-unapproved')).toBeUndefined();
  });

  it('cada elemento devuelto pertenece al bucket myCatalog o followedCatalog', () => {
    const out = getVisibleCatalogUniverse(fixture, UID);
    for (const l of out) {
      const b = getLocationBucket(l, UID);
      expect(b === 'myCatalog' || b === 'followedCatalog').toBe(true);
    }
  });
});

describe('PR-COUNTS-1 — Top bar === FilterBar (catalogVisibleUniverse)', () => {
  // Simulamos universo annotated (fuente común). Top bar consume
  // `getBucketStats(getAllLocations(), uid)`. FilterBar (Explorar) ahora
  // consume `getVisibleCatalogUniverse(getAllLocations(), uid)` → header T,
  // Tm/Ts derivados.
  const fixture = [
    // 4 propios aprobados (myCatalog)
    loc('m1', UID, true),
    loc('m2', UID, true),
    loc('m3', UID, true),
    loc('m4', UID, true),
    // 1 propio borrador (myWorkspace) — fuera de catálogo visible
    loc('mw', UID, false),
    // 2 seguidos aprobados (followedCatalog)
    loc('f1', OTHER, true),
    loc('f2', OTHER, true),
    // 1 seguido no aprobado (followedShared) — fuera de catálogo visible
    loc('fs', OTHER, false),
  ];

  const topBarStats = getBucketStats(fixture, UID);
  const filterBarCatalog = getVisibleCatalogUniverse(fixture, UID);

  // Réplica de `ownershipRatios` (FilterBar.tsx):
  let Tm = 0;
  for (const l of filterBarCatalog) {
    if (l.ownerUserId === UID) Tm += 1;
  }
  const T = filterBarCatalog.length;
  const Ts = T - Tm;

  it('Top bar total === FilterBar total', () => {
    expect(topBarStats.catalogTotal).toBe(T);
    expect(T).toBe(6); // 4 mine approved + 2 followed approved
  });

  it('Top bar myCatalog === FilterBar Míos', () => {
    expect(topBarStats.myCatalog).toBe(Tm);
    expect(Tm).toBe(4);
  });

  it('Top bar followedCatalog === FilterBar Seguidos', () => {
    expect(topBarStats.followedCatalog).toBe(Ts);
    expect(Ts).toBe(2);
  });

  it('no hay gap: T === myCatalog + followedCatalog', () => {
    expect(T).toBe(topBarStats.myCatalog + topBarStats.followedCatalog);
  });
});
