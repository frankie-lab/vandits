/**
 * PR-POI-SOURCE-3 — Filtro unificado `filterBySource` en el matcher.
 * Verifica que gana sobre `filterByUserId` (alias legacy) y cubre los
 * 4 sourceTypes.
 */
import { describe, it, expect } from 'vitest';
import type { GeoLocation } from '@/types/location';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function loc(extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id: 'p1',
    name: 'p1',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  } as unknown as GeoLocation;
}

describe('matchesLocationFilters · filterBySource', () => {
  it('own/followed: match por ownerUid', () => {
    const p = loc({ ownerUserId: A });
    expect(matchesLocationFilters(p, { filterBySource: { type: 'followed', id: A } })).toBe(true);
    expect(matchesLocationFilters(p, { filterBySource: { type: 'followed', id: B } })).toBe(false);
    expect(matchesLocationFilters(p, { filterBySource: { type: 'own', id: A } })).toBe(true);
  });

  it('own/followed: rechaza POIs con sourceKind app/external', () => {
    const app = loc({ ownerUserId: A, sourceKind: 'app' });
    expect(matchesLocationFilters(app, { filterBySource: { type: 'followed', id: A } })).toBe(false);
    const ext = loc({ ownerUserId: A, sourceKind: 'external' });
    expect(matchesLocationFilters(ext, { filterBySource: { type: 'followed', id: A } })).toBe(false);
  });

  it('app: match por sourceId', () => {
    const p = loc({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'playas' });
    expect(matchesLocationFilters(p, { filterBySource: { type: 'app', id: 'vandits-app' } })).toBe(true);
    expect(matchesLocationFilters(p, { filterBySource: { type: 'app', id: 'otro' } })).toBe(false);
  });

  it('app: match por groupId', () => {
    const p = loc({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'miradores' });
    expect(matchesLocationFilters(p, { filterBySource: { type: 'app', id: 'miradores' } })).toBe(true);
    expect(matchesLocationFilters(p, { filterBySource: { type: 'app', id: 'playas' } })).toBe(false);
  });

  it('app: rechaza POIs no-app', () => {
    const p = loc({ ownerUserId: A });
    expect(matchesLocationFilters(p, { filterBySource: { type: 'app', id: 'vandits-app' } })).toBe(false);
  });

  it('source: match por sourceId externo', () => {
    const p = loc({ sourceKind: 'external', sourceId: 'osm' });
    expect(matchesLocationFilters(p, { filterBySource: { type: 'source', id: 'osm' } })).toBe(true);
    expect(matchesLocationFilters(p, { filterBySource: { type: 'source', id: 'tripadvisor' } })).toBe(false);
  });

  it('source: rechaza POIs no-external', () => {
    const p = loc({ sourceKind: 'app', sourceId: 'osm' });
    expect(matchesLocationFilters(p, { filterBySource: { type: 'source', id: 'osm' } })).toBe(false);
  });

  it('snake_case en marcadores también funciona', () => {
    const p = loc({ source_kind: 'external', source_id: 'osm' });
    expect(matchesLocationFilters(p, { filterBySource: { type: 'source', id: 'osm' } })).toBe(true);
  });

  it('filterBySource gana sobre filterByUserId (alias legacy)', () => {
    const p = loc({ ownerUserId: A });
    // legacy diría que pasa, canónico (B) que no
    expect(
      matchesLocationFilters(p, {
        filterBySource: { type: 'followed', id: B },
        filterByUserId: A,
      }),
    ).toBe(false);
    // legacy diría que NO pasa, canónico (A) que sí
    expect(
      matchesLocationFilters(p, {
        filterBySource: { type: 'followed', id: A },
        filterByUserId: B,
      }),
    ).toBe(true);
  });

  it('filterByUserId sigue funcionando solo cuando filterBySource ausente', () => {
    const p = loc({ ownerUserId: A });
    expect(matchesLocationFilters(p, { filterByUserId: A })).toBe(true);
    expect(matchesLocationFilters(p, { filterByUserId: B })).toBe(false);
  });
});
