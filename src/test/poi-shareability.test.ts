/**
 * PR-POI-SOURCE-2 — Shareability resolver.
 * Matriz: own siempre allow; followed/app/source solo si isShareablePoi.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { GeoLocation } from '@/types/location';
import {
  resolveShareability,
  canViewerSeePoi,
} from '@/domains/content/lib/poi-shareability';
import { clearPoiSourceCache, resolvePoiSource } from '@/domains/content/lib/poi-source';

const VIEWER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const LONG_DESC =
  'Una descripción suficientemente larga para superar el umbral de isUnverifiableDescription que exige al menos 60 caracteres en total.';

function poi(extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id: 'p1',
    name: 'p1',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    visibility: 'public',
    geoHealth: 'ok',
    enrichedData: { descripcion: LONG_DESC },
    ...extra,
  } as unknown as GeoLocation;
}

beforeEach(() => clearPoiSourceCache());

describe('resolveShareability — own', () => {
  it('allow aunque NO sea shareable (geo rota, sin descripcion, etc.)', () => {
    const r = resolveShareability(
      VIEWER,
      poi({ ownerUserId: VIEWER, geoHealth: 'broken', enrichedData: undefined, visibility: 'private' }),
    );
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('own');
    expect(r.sourceType).toBe('own');
  });

  it('allow cuando es shareable también', () => {
    const r = resolveShareability(VIEWER, poi({ ownerUserId: VIEWER }));
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('own');
  });
});

describe('resolveShareability — followed', () => {
  it('allow si pasa isShareablePoi', () => {
    const r = resolveShareability(VIEWER, poi({ ownerUserId: OTHER }));
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('curated');
    expect(r.sourceType).toBe('followed');
  });

  it('deny si geo no ok', () => {
    const r = resolveShareability(VIEWER, poi({ ownerUserId: OTHER, geoHealth: 'partial' }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('not-curated');
  });

  it('deny si visibility=private', () => {
    const r = resolveShareability(VIEWER, poi({ ownerUserId: OTHER, visibility: 'private' }));
    expect(r.allowed).toBe(false);
  });

  it('deny si no enriched', () => {
    const r = resolveShareability(VIEWER, poi({ ownerUserId: OTHER, enrichedData: undefined }));
    expect(r.allowed).toBe(false);
  });
});

describe('resolveShareability — app', () => {
  it('allow si pasa isShareablePoi', () => {
    const r = resolveShareability(
      VIEWER,
      poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'playas' }),
    );
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('curated');
    expect(r.sourceType).toBe('app');
  });

  it('deny si geo rota aunque sea app', () => {
    const r = resolveShareability(VIEWER, poi({ sourceKind: 'app', geoHealth: 'broken' }));
    expect(r.allowed).toBe(false);
    expect(r.sourceType).toBe('app');
  });
});

describe('resolveShareability — source', () => {
  it('allow si pasa isShareablePoi', () => {
    const r = resolveShareability(VIEWER, poi({ sourceKind: 'external', sourceId: 'osm' }));
    expect(r.allowed).toBe(true);
    expect(r.sourceType).toBe('source');
  });

  it('deny si visibility=followers? (followers sigue siendo publicable)', () => {
    const r = resolveShareability(
      VIEWER,
      poi({ sourceKind: 'external', sourceId: 'osm', visibility: 'followers' }),
    );
    expect(r.allowed).toBe(true);
  });

  it('deny si visibility=private', () => {
    const r = resolveShareability(
      VIEWER,
      poi({ sourceKind: 'external', sourceId: 'osm', visibility: 'private' }),
    );
    expect(r.allowed).toBe(false);
  });
});

describe('resolveShareability — bordes', () => {
  it('null poi', () => {
    const r = resolveShareability(VIEWER, null);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('no-poi');
    expect(r.sourceType).toBeNull();
  });

  it('reusa source pre-calculado', () => {
    const p = poi({ ownerUserId: VIEWER });
    const source = resolvePoiSource(VIEWER, p);
    const r = resolveShareability(VIEWER, p, { source });
    expect(r.allowed).toBe(true);
    expect(r.sourceType).toBe('own');
  });

  it('viewer null trata POI propio como ajeno (followed) y aplica curated', () => {
    const p = poi({ ownerUserId: VIEWER });
    const r = resolveShareability(null, p);
    // Sin viewer: no es own; cae en followed; pasa isShareablePoi -> allow
    expect(r.allowed).toBe(true);
    expect(r.sourceType).toBe('followed');
  });
});

describe('canViewerSeePoi', () => {
  it('atajo coherente con resolveShareability', () => {
    expect(canViewerSeePoi(VIEWER, poi({ ownerUserId: VIEWER, geoHealth: 'broken' }))).toBe(true);
    expect(canViewerSeePoi(VIEWER, poi({ ownerUserId: OTHER, geoHealth: 'broken' }))).toBe(false);
    expect(canViewerSeePoi(VIEWER, poi({ sourceKind: 'app' }))).toBe(true);
    expect(canViewerSeePoi(VIEWER, null)).toBe(false);
  });
});
