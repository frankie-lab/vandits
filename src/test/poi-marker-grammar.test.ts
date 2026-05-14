/**
 * PR-POI-SOURCE-4 — Marker grammar resolver.
 * Verifica: forma + paleta + decoraciones por sourceType, independencia
 * de shareability, reuso de source pre-calculado.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { GeoLocation } from '@/types/location';
import {
  resolveMarkerGrammar,
  getPoiShape,
} from '@/domains/content/lib/poi-marker-grammar';
import { clearPoiSourceCache, resolvePoiSource } from '@/domains/content/lib/poi-source';

const VIEWER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function poi(extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id: 'p1',
    name: 'p1',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    visibility: 'public',
    geoHealth: 'ok',
    ...extra,
  } as unknown as GeoLocation;
}

describe('resolveMarkerGrammar', () => {
  beforeEach(() => clearPoiSourceCache());

  it('own: circle + state palette + rings + tint + stroke', () => {
    const g = resolveMarkerGrammar(VIEWER, poi({ ownerUserId: VIEWER }));
    expect(g.source.type).toBe('own');
    expect(g.shape).toBe('circle');
    expect(g.paletteScope).toBe('state');
    expect(g.allowHealthRings).toBe(true);
    expect(g.allowCollectionTint).toBe(true);
    expect(g.allowWhiteStroke).toBe(true);
  });

  it('followed: inverted-triangle + owner identity + no rings/tint/stroke', () => {
    const g = resolveMarkerGrammar(VIEWER, poi({ ownerUserId: OTHER }));
    expect(g.source.type).toBe('followed');
    expect(g.shape).toBe('inverted-triangle');
    expect(g.paletteScope).toBe('owner-identity');
    expect(g.allowHealthRings).toBe(false);
    expect(g.allowCollectionTint).toBe(false);
    expect(g.allowWhiteStroke).toBe(false);
  });

  it('app: diamond + app-neutral + no rings/tint, stroke ok', () => {
    const g = resolveMarkerGrammar(VIEWER, poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'playas' }));
    expect(g.source.type).toBe('app');
    expect(g.shape).toBe('diamond');
    expect(g.paletteScope).toBe('app-neutral');
    expect(g.allowHealthRings).toBe(false);
    expect(g.allowCollectionTint).toBe(false);
    expect(g.allowWhiteStroke).toBe(true);
  });

  it('source: hexagon + source-neutral + no rings/tint, stroke ok', () => {
    const g = resolveMarkerGrammar(VIEWER, poi({ sourceKind: 'external', sourceId: 'osm' }));
    expect(g.source.type).toBe('source');
    expect(g.shape).toBe('hexagon');
    expect(g.paletteScope).toBe('source-neutral');
    expect(g.allowHealthRings).toBe(false);
    expect(g.allowCollectionTint).toBe(false);
    expect(g.allowWhiteStroke).toBe(true);
  });

  it('grammar is independent of shareability inputs (no enrichedData required)', () => {
    // Followed POI sin descripción enriquecida — la gramática NO cambia.
    const g = resolveMarkerGrammar(VIEWER, poi({ ownerUserId: OTHER }));
    expect(g.shape).toBe('inverted-triangle');
  });

  it('reuses pre-resolved source instead of recomputing', () => {
    const p = poi({ ownerUserId: VIEWER });
    const src = resolvePoiSource(VIEWER, p);
    const g = resolveMarkerGrammar(VIEWER, p, { source: src });
    expect(g.source).toBe(src);
    expect(g.shape).toBe('circle');
  });

  it('getPoiShape matches full resolver', () => {
    const p = poi({ sourceKind: 'app' });
    expect(getPoiShape(VIEWER, p)).toBe(resolveMarkerGrammar(VIEWER, p).shape);
  });

  it('orphan POI (no owner, no markers) → followed grammar', () => {
    const g = resolveMarkerGrammar(VIEWER, poi());
    expect(g.source.type).toBe('followed');
    expect(g.shape).toBe('inverted-triangle');
  });
});
