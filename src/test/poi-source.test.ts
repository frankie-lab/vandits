/**
 * PR-POI-SOURCE-1 — Resolver de origen único.
 * Matriz viewer × poi → sourceType + ownerUid + sourceId + groupId + hashtags.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { GeoLocation } from '@/types/location';
import {
  resolvePoiSource,
  isOwnPoi,
  getPoiSourceType,
  clearPoiSourceCache,
} from '@/domains/content/lib/poi-source';

const VIEWER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function poi(extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id: 'p1',
    name: 'p1',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  } as unknown as GeoLocation;
}

beforeEach(() => clearPoiSourceCache());

describe('resolvePoiSource — matriz por sourceType', () => {
  it('own: ownerUid === viewerUid', () => {
    const r = resolvePoiSource(VIEWER, poi({ ownerUserId: VIEWER }));
    expect(r.type).toBe('own');
    expect(r.ownerUid).toBe(VIEWER);
    expect(r.sourceId).toBeNull();
    expect(r.groupId).toBeNull();
    expect(r.hashtags).toEqual([VIEWER.slice(0, 8)]);
  });

  it('followed: owner conocido distinto al viewer', () => {
    const r = resolvePoiSource(VIEWER, poi({ ownerUserId: OTHER }));
    expect(r.type).toBe('followed');
    expect(r.ownerUid).toBe(OTHER);
  });

  it('followed: cae al fallback _docUserId cuando no hay ownerUserId', () => {
    const r = resolvePoiSource(VIEWER, poi({ _docUserId: OTHER }));
    expect(r.type).toBe('followed');
    expect(r.ownerUid).toBe(OTHER);
  });

  it('followed sin owner conocido: huérfano sin hashtags', () => {
    const r = resolvePoiSource(VIEWER, poi({}));
    expect(r.type).toBe('followed');
    expect(r.ownerUid).toBeNull();
    expect(r.hashtags).toEqual([]);
  });

  it('app: marcador explícito sourceKind="app" (incluso si hay ownerUserId)', () => {
    const r = resolvePoiSource(
      VIEWER,
      poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'playas', ownerUserId: VIEWER }),
    );
    expect(r.type).toBe('app');
    expect(r.ownerUid).toBeNull();
    expect(r.sourceId).toBe('vandits-app');
    expect(r.groupId).toBe('playas');
    expect(r.hashtags).toEqual(['vandits-app', 'playas']);
  });

  it('app: sourceId default cuando falta', () => {
    const r = resolvePoiSource(VIEWER, poi({ sourceKind: 'app' }));
    expect(r.type).toBe('app');
    expect(r.sourceId).toBe('vandits-app');
    expect(r.hashtags).toEqual(['vandits-app']);
  });

  it('source: marcador explícito sourceKind="external"', () => {
    const r = resolvePoiSource(VIEWER, poi({ sourceKind: 'external', sourceId: 'osm' }));
    expect(r.type).toBe('source');
    expect(r.sourceId).toBe('osm');
    expect(r.hashtags).toEqual(['osm']);
  });

  it('app/source ganan sobre ownership (no se infiere por owner especial)', () => {
    const app = resolvePoiSource(VIEWER, poi({ sourceKind: 'app', ownerUserId: VIEWER }));
    expect(app.type).toBe('app');
    const src = resolvePoiSource(VIEWER, poi({ sourceKind: 'external', sourceId: 'osm', ownerUserId: VIEWER }));
    expect(src.type).toBe('source');
  });

  it('lee marcadores en snake_case', () => {
    const r = resolvePoiSource(
      VIEWER,
      poi({ source_kind: 'app', source_id: 'vandits-app', group_id: 'miradores' }),
    );
    expect(r.type).toBe('app');
    expect(r.groupId).toBe('miradores');
    expect(r.hashtags).toEqual(['vandits-app', 'miradores']);
  });

  it('viewer null: nunca produce "own"', () => {
    const r = resolvePoiSource(null, poi({ ownerUserId: VIEWER }));
    expect(r.type).toBe('followed');
  });
});

describe('resolvePoiSource — usernameLookup', () => {
  it('usa username cuando lookup lo provee', () => {
    const r = resolvePoiSource(VIEWER, poi({ ownerUserId: VIEWER }), {
      usernameLookup: (uid) => (uid === VIEWER ? 'frankie' : null),
    });
    expect(r.hashtags).toEqual(['frankie']);
  });

  it('cae a uid corto si username vacío', () => {
    const r = resolvePoiSource(VIEWER, poi({ ownerUserId: OTHER }), {
      usernameLookup: () => '',
    });
    expect(r.hashtags).toEqual([OTHER.slice(0, 8)]);
  });
});

describe('cache', () => {
  it('reusa el resultado para el mismo POI y viewer', () => {
    const p = poi({ ownerUserId: VIEWER });
    const a = resolvePoiSource(VIEWER, p);
    const b = resolvePoiSource(VIEWER, p);
    expect(a).toBe(b);
  });

  it('no cachea cuando hay usernameLookup (depende de username externo)', () => {
    const p = poi({ ownerUserId: VIEWER });
    const a = resolvePoiSource(VIEWER, p, { usernameLookup: () => 'a' });
    const b = resolvePoiSource(VIEWER, p, { usernameLookup: () => 'b' });
    expect(a).not.toBe(b);
    expect(a.hashtags).toEqual(['a']);
    expect(b.hashtags).toEqual(['b']);
  });

  it('clearPoiSourceCache invalida', () => {
    const p = poi({ ownerUserId: VIEWER });
    const a = resolvePoiSource(VIEWER, p);
    clearPoiSourceCache();
    const b = resolvePoiSource(VIEWER, p);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('cache es por viewer', () => {
    const p = poi({ ownerUserId: VIEWER });
    const a = resolvePoiSource(VIEWER, p);
    const b = resolvePoiSource(OTHER, p);
    expect(a.type).toBe('own');
    expect(b.type).toBe('followed');
  });
});

describe('helpers', () => {
  it('isOwnPoi', () => {
    expect(isOwnPoi(VIEWER, poi({ ownerUserId: VIEWER }))).toBe(true);
    expect(isOwnPoi(VIEWER, poi({ ownerUserId: OTHER }))).toBe(false);
    expect(isOwnPoi(VIEWER, poi({ sourceKind: 'app', ownerUserId: VIEWER }))).toBe(false);
  });

  it('getPoiSourceType', () => {
    expect(getPoiSourceType(VIEWER, poi({ ownerUserId: VIEWER }))).toBe('own');
    expect(getPoiSourceType(VIEWER, poi({ ownerUserId: OTHER }))).toBe('followed');
    expect(getPoiSourceType(VIEWER, poi({ sourceKind: 'app' }))).toBe('app');
    expect(getPoiSourceType(VIEWER, poi({ sourceKind: 'external', sourceId: 'osm' }))).toBe('source');
  });
});
