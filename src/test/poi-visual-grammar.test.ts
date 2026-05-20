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
    expect(a.levelVisual?.fillHsl).toBe(b.levelVisual?.fillHsl);
  });
});

// ────────────────────────────────────────────────────────────────────────
// PR-MAP-CANON-3 — `levelVisual` como SoT del fill del marker propio.
// ────────────────────────────────────────────────────────────────────────
describe('PR-MAP-CANON-3 — levelVisual', () => {
  beforeEach(() => clearPoiSourceCache());

  const LONG_DESC = 'x'.repeat(120);
  const enrichedData = {
    verified: true,
    verification_notes: 'ok',
    categoria: 'Monumento',
    nombre_lugar: 'L',
    localizacion: 'x',
    descripcion: LONG_DESC,
    punto_destacado: 'x',
    etiquetas: [],
    datos_clave: { tipo: 'monument', coordenadas: '0,0' },
    fuentes: [],
  } as unknown;

  // (levelKey, geo, name, enriched?, visited?, rated?)
  const cases: Array<[string, Record<string, unknown>]> = [
    ['poi-0',  { ownerUserId: VIEWER, name: '', geoHealth: null }],
    ['poi-1a', { ownerUserId: VIEWER, geoHealth: null }],
    ['poi-1a', { ownerUserId: VIEWER, geoHealth: 'partial' }],
    ['poi-1a', { ownerUserId: VIEWER, geoHealth: 'empty' }],
    ['poi-1a', { ownerUserId: VIEWER, geoHealth: 'stale_name' }],
    ['poi-1b', { ownerUserId: VIEWER, geoHealth: 'ok' }],
    ['poi-3',  { ownerUserId: VIEWER, geoHealth: 'broken' }],
    ['poi-5',  { ownerUserId: VIEWER, geoHealth: 'partial', enrichedData }],
    ['poi-9',  { ownerUserId: VIEWER, geoHealth: 'ok', enrichedData }],
    ['poi-10', { ownerUserId: VIEWER, geoHealth: 'ok', enrichedData, customData: { visited: 'true', user_rating: '5' } }],
  ];

  it.each(cases)('%s → levelKey matches and fillHsl is non-empty', (expected, extra) => {
    const out = resolvePoiVisualGrammar(VIEWER, poi(extra));
    expect(out.curation.levelKey).toBe(expected);
    expect(out.levelVisual).not.toBeNull();
    expect(out.levelVisual!.levelKey).toBe(expected);
    expect(out.levelVisual!.fillHsl).toMatch(/\d+\s+\d+%\s+\d+%/);
  });

  it('showStateRing === true ONLY for poi-5', () => {
    for (const [expected, extra] of cases) {
      const out = resolvePoiVisualGrammar(VIEWER, poi(extra));
      expect(out.levelVisual!.showStateRing).toBe(expected === 'poi-5');
    }
  });

  it('followed/app/source: levelVisual === null (curated-only sharing intact)', () => {
    const samples = [
      poi({ ownerUserId: OTHER }),
      poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'g' }),
      poi({ sourceKind: 'external', sourceId: 'osm' }),
    ];
    for (const s of samples) {
      const out = resolvePoiVisualGrammar(VIEWER, s);
      expect(out.levelVisual).toBeNull();
    }
  });

  it('viewer ajeno sobre POI propio del owner: levelVisual === null', () => {
    // Viewer != owner → source = 'followed' → paletteScope != 'state'.
    const out = resolvePoiVisualGrammar(VIEWER, poi({ ownerUserId: OTHER, enrichedData }));
    expect(out.grammar.paletteScope).not.toBe('state');
    expect(out.levelVisual).toBeNull();
  });

  it('canon v3 — poi-9 y poi-10 ya NO comparten fill (paleta POI-N 11 niveles)', () => {
    const nine = resolvePoiVisualGrammar(VIEWER, poi({ ownerUserId: VIEWER, geoHealth: 'ok', enrichedData }));
    const ten = resolvePoiVisualGrammar(VIEWER, poi({ ownerUserId: VIEWER, geoHealth: 'ok', enrichedData, customData: { visited: 'true', user_rating: '5' } }));
    expect(nine.curation.levelKey).toBe('poi-9');
    expect(ten.curation.levelKey).toBe('poi-10');
    // POI-N v3 separa explícitamente niveles 9 y 10 (verde medio vs verde fuerte).
    expect(nine.levelVisual!.fillHsl).not.toBe(ten.levelVisual!.fillHsl);
    // maturityLevel también difiere.
    expect(nine.levelVisual!.maturityLevel).not.toBe(ten.levelVisual!.maturityLevel);
  });

  it('canon v3 — levelVisual.maturityLevel ∈ [0..10] siempre que paletteScope === state', () => {
    for (const [, extra] of cases) {
      const out = resolvePoiVisualGrammar(VIEWER, poi(extra));
      expect(out.levelVisual).not.toBeNull();
      const m = out.levelVisual!.maturityLevel;
      expect(Number.isInteger(m)).toBe(true);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(10);
    }
  });
});
