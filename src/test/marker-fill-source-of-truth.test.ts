/**
 * Canon v3 (v1.3.1) — Source-of-Truth del fill del marker propio.
 *
 * Contract test que blinda la regla DURA de `docs/contracts/marker-fill-canon-v3.md`:
 *
 *   Cuando `paletteScope === 'state'`, el `fillHsl` que el renderer
 *   inyecta SIEMPRE coincide con `getPoiMaturityColor(loc).fill` (sin
 *   wrapper `hsl(...)`). Cualquier regresión a `poi.state.*` o
 *   `poi.level.*` como SoT del fill rompe este test.
 *
 * No mide UI, no llama a `createCustomIcon` (canon v3 mantiene el
 * renderer leyendo `visualGrammar.levelVisual.fillHsl`, así que la
 * paridad SoT/renderer queda garantizada por composición).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { GeoLocation } from '@/types/location';
import { resolvePoiVisualGrammar } from '@/domains/content/lib/poi-visual-grammar';
import { getPoiMaturityColor } from '@/domains/content/lib/poi-maturity-color';
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

describe('canon v3 — marker fill source of truth', () => {
  beforeEach(() => clearPoiSourceCache());

  // Cobertura POI-N 0..10 vía techos `geo_resolution` + estados naturales.
  const samples: Array<[string, Record<string, unknown>]> = [
    ['POI-0 (sin nombre, sin geo)', { ownerUserId: VIEWER, name: '', geoHealth: null }],
    ['POI-1 (techo geo_irrecoverable)', { ownerUserId: VIEWER, geoHealth: 'ok', enrichedData, customData: { geo_resolution: { status: 'geo_irrecoverable' } } }],
    ['POI-2 (techo needs_coord_fix)', { ownerUserId: VIEWER, geoHealth: 'ok', enrichedData, customData: { geo_resolution: { status: 'needs_coord_fix' } } }],
    ['POI-3 (techo needs_name_fix)', { ownerUserId: VIEWER, geoHealth: 'ok', enrichedData, customData: { geo_resolution: { status: 'needs_name_fix' } } }],
    ['POI-4 (techo pending_review)', { ownerUserId: VIEWER, geoHealth: 'ok', enrichedData, customData: { geo_resolution: { status: 'pending_review' } } }],
    ['POI-1a sin enrich, sin geo', { ownerUserId: VIEWER, geoHealth: null }],
    ['POI-1b sin enrich, geo ok', { ownerUserId: VIEWER, geoHealth: 'ok' }],
    ['POI-3 broken', { ownerUserId: VIEWER, geoHealth: 'broken' }],
    ['POI-5 enriched + partial', { ownerUserId: VIEWER, geoHealth: 'partial', enrichedData }],
    ['POI-9 enriched + ok', { ownerUserId: VIEWER, geoHealth: 'ok', enrichedData }],
    ['POI-10 enriched + visited + rated', { ownerUserId: VIEWER, geoHealth: 'ok', enrichedData, customData: { visited: 'true', user_rating: '5' } }],
  ];

  it.each(samples)('%s → fillHsl === getPoiMaturityColor(loc).fill (unwrap)', (_label, extra) => {
    const out = resolvePoiVisualGrammar(VIEWER, poi(extra));
    expect(out.levelVisual).not.toBeNull();
    const { level, fill } = getPoiMaturityColor(poi(extra));
    const expectedHsl = fill.slice(4, -1); // strip `hsl(...)`
    expect(out.levelVisual!.fillHsl).toBe(expectedHsl);
    expect(out.levelVisual!.maturityLevel).toBe(level);
  });

  it('followed/app/source: levelVisual === null (curated-only sharing intacto)', () => {
    const cases = [
      poi({ ownerUserId: OTHER, enrichedData }),
      poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'g' }),
      poi({ sourceKind: 'external', sourceId: 'osm' }),
    ];
    for (const c of cases) {
      const out = resolvePoiVisualGrammar(VIEWER, c);
      expect(out.grammar.paletteScope).not.toBe('state');
      expect(out.levelVisual).toBeNull();
    }
  });

  it('regression guard — fillHsl NUNCA proviene de poi.state.* ni de poi.level.*', async () => {
    // Smoke: el fill de un enriched-ok corresponde a poi.maturity.9 o .10,
    // NUNCA al verde único de poi.state.enriched (`142 71% 45%`) ni al
    // verde compartido legacy de poi.level.{9,10} (`142 71% 45%`).
    const { tokens } = await import('@/design-system/tokens');
    const stateEnriched = (tokens as any).poi?.state?.enriched as string | undefined;
    const out = resolvePoiVisualGrammar(VIEWER, poi({ ownerUserId: VIEWER, geoHealth: 'ok', enrichedData }));
    expect(out.levelVisual).not.toBeNull();
    // Tolera coexistencia: si por coincidencia maturity.9 === state.enriched
    // el test sigue siendo válido, pero hoy difieren (9 = `130 50% 50%`).
    if (stateEnriched) {
      expect(out.levelVisual!.fillHsl).not.toBe(stateEnriched);
    }
  });

  it('showStateRing sigue ligado a curación (poi-5 only), NO a madurez', () => {
    const five = resolvePoiVisualGrammar(VIEWER, poi({ ownerUserId: VIEWER, geoHealth: 'partial', enrichedData }));
    expect(five.curation.levelKey).toBe('poi-5');
    expect(five.levelVisual!.showStateRing).toBe(true);
    const ten = resolvePoiVisualGrammar(VIEWER, poi({ ownerUserId: VIEWER, geoHealth: 'ok', enrichedData, customData: { visited: 'true', user_rating: '5' } }));
    expect(ten.curation.levelKey).toBe('poi-10');
    expect(ten.levelVisual!.showStateRing).toBe(false);
  });
});
