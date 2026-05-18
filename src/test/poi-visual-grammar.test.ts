/**
 * PR-MAP-CANON-1 — Single composition point for the map renderer.
 *
 * Verifies that `resolvePoiVisualGrammar` is a pure aggregator over the
 * three canonical resolvers (marker grammar, visual state, health rings,
 * curation level) and respects the invariants documented in the module.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { GeoLocation } from '@/types/location';
import { resolvePoiVisualGrammar } from '@/domains/content/lib/poi-visual-grammar';
import { clearPoiSourceCache } from '@/domains/content/lib/poi-source';

const VIEWER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function poi(extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id: 'p1',
    name: 'Punto X',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    visibility: 'public',
    geoHealth: 'ok',
    ...extra,
  } as unknown as GeoLocation;
}

describe('resolvePoiVisualGrammar', () => {
  beforeEach(() => clearPoiSourceCache());

  it('own POI: state palette + collection tint + white stroke + curation computed', () => {
    const out = resolvePoiVisualGrammar(VIEWER, poi({ ownerUserId: VIEWER }));
    expect(out.grammar.source.type).toBe('own');
    expect(out.grammar.shape).toBe('circle');
    expect(out.grammar.paletteScope).toBe('state');
    expect(out.grammar.allowHealthRings).toBe(true);
    expect(out.grammar.allowCollectionTint).toBe(true);
    expect(out.grammar.allowWhiteStroke).toBe(true);
    // Curation level is always computed.
    expect([0, 1, 3, 5, 9, 10]).toContain(out.curation.level);
  });

  it('followed POI: identity palette + NO rings/tint/stroke + healthRings=[]', () => {
    // Followed POI with potential health issues — must be invisible to viewer.
    const followed = poi({
      ownerUserId: OTHER,
      geoHealth: 'partial',
    });
    const out = resolvePoiVisualGrammar(VIEWER, followed);
    expect(out.grammar.source.type).toBe('followed');
    expect(out.grammar.shape).toBe('inverted-triangle');
    expect(out.grammar.paletteScope).toBe('owner-identity');
    expect(out.grammar.allowHealthRings).toBe(false);
    expect(out.grammar.allowCollectionTint).toBe(false);
    expect(out.grammar.allowWhiteStroke).toBe(false);
    // PR-1 curated-only boundary: rings never leak to followers.
    expect(out.healthRings).toEqual([]);
  });

  it('app POI: diamond + neutral palette + NO rings', () => {
    const out = resolvePoiVisualGrammar(
      VIEWER,
      poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'playas' }),
    );
    expect(out.grammar.shape).toBe('diamond');
    expect(out.grammar.paletteScope).toBe('app-neutral');
    expect(out.healthRings).toEqual([]);
  });

  it('source POI: hexagon + neutral palette + NO rings', () => {
    const out = resolvePoiVisualGrammar(
      VIEWER,
      poi({ sourceKind: 'external', sourceId: 'osm' }),
    );
    expect(out.grammar.shape).toBe('hexagon');
    expect(out.grammar.paletteScope).toBe('source-neutral');
    expect(out.healthRings).toEqual([]);
  });

  it('own POI with broken geoHealth surfaces the chain ring', () => {
    const out = resolvePoiVisualGrammar(
      VIEWER,
      poi({ ownerUserId: VIEWER, geoHealth: 'broken' }),
    );
    expect(out.healthRings).toContain('chain');
    // POI-3 is the canonical level for geoHealth==='broken'.
    expect(out.curation.level).toBe(3);
  });

  it('Invariant: state palette ⇔ own (no leak to other source types)', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ownerUserId: VIEWER }, 'state'],
      [{ ownerUserId: OTHER }, 'owner-identity'],
      [{ sourceKind: 'app' }, 'app-neutral'],
      [{ sourceKind: 'external', sourceId: 'osm' }, 'source-neutral'],
    ];
    for (const [extra, expectedScope] of cases) {
      const out = resolvePoiVisualGrammar(VIEWER, poi(extra));
      expect(out.grammar.paletteScope).toBe(expectedScope);
      if (expectedScope === 'state') {
        expect(out.grammar.allowHealthRings).toBe(true);
        expect(out.grammar.allowCollectionTint).toBe(true);
      } else {
        expect(out.grammar.allowHealthRings).toBe(false);
        expect(out.grammar.allowCollectionTint).toBe(false);
        expect(out.healthRings).toEqual([]);
      }
    }
  });

  it('Invariant: curation level is always one of {0,1,3,5,9,10}', () => {
    const samples = [
      poi({ ownerUserId: VIEWER, name: '' }),
      poi({ ownerUserId: VIEWER }),
      poi({ ownerUserId: VIEWER, geoHealth: 'broken' }),
      poi({ ownerUserId: OTHER }),
      poi({ sourceKind: 'app' }),
    ];
    for (const s of samples) {
      const out = resolvePoiVisualGrammar(VIEWER, s);
      expect([0, 1, 3, 5, 9, 10]).toContain(out.curation.level);
    }
  });

  it('Pure: same input → same output (referentially stable curation level)', () => {
    const p = poi({ ownerUserId: VIEWER });
    const a = resolvePoiVisualGrammar(VIEWER, p);
    const b = resolvePoiVisualGrammar(VIEWER, p);
    expect(a.grammar.shape).toBe(b.grammar.shape);
    expect(a.curation.level).toBe(b.curation.level);
    expect(a.healthRings).toEqual(b.healthRings);
    expect(a.visualState).toBe(b.visualState);
  });
});
