/**
 * PR-MAP-CANON-3.1 — El gate de health rings en `createCustomIcon` se
 * gobierna por `visualGrammar.levelVisual.showStateRing` (única condición
 * canónica). En V1 solo `poi-5` debe pintar contorno; cualquier otro
 * `levelKey` con `healthRings !== []` queda sin pintar (la deuda
 * operativa sigue computándose, solo cambia la representación visual).
 *
 * Regresión directa del bug reportado: POIs `poi-1a` y `poi-3`
 * heredaban contorno antiguo aunque el canon nuevo no lo permite.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
  };
  return { supabase: { from: () => chain } };
});

import type { GeoLocation } from '@/types/location';
import { createCustomIcon, setCurrentZoom } from '@/components/map/map-icons';
import { clearPoiSourceCache } from '@/domains/content/lib/poi-source';
import { resolvePoiVisualGrammar } from '@/domains/content/lib/poi-visual-grammar';

const VIEWER = '11111111-1111-1111-1111-111111111111';
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

function poi(extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id: 'p1',
    name: 'Punto X',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    visibility: 'public',
    geoHealth: 'ok',
    ownerUserId: VIEWER,
    ...extra,
  } as unknown as GeoLocation;
}

// `border:5px solid` es la firma del ring en `ringsHtml` (RING_WIDTH=5).
const RING_HTML_SIGNATURE = /border:5px solid/;

function htmlOf(loc: GeoLocation): string {
  const icon = createCustomIcon(false, false, false, loc, 0, false, null, true, VIEWER) as any;
  return String(icon?.options?.html ?? '');
}

describe('createCustomIcon — health-rings gate (PR-MAP-CANON-3.1)', () => {
  beforeEach(() => {
    clearPoiSourceCache();
    // standard mode (z9–11) para asegurar que el SVG render path se ejecuta
    // y los rings se pueden pintar (micro retorna antes).
    setCurrentZoom(10);
  });

  it('poi-1a con healthRings=["partial"] NO pinta contorno (regresión)', () => {
    const loc = poi({ geoHealth: 'partial' });
    const grammar = resolvePoiVisualGrammar(VIEWER, loc);
    expect(grammar.curation.levelKey).toBe('poi-1a');
    expect(grammar.healthRings).toContain('partial');
    expect(htmlOf(loc)).not.toMatch(RING_HTML_SIGNATURE);
  });

  it('poi-3 con healthRings=["chain"] NO pinta contorno (regresión)', () => {
    const loc = poi({ geoHealth: 'broken' });
    const grammar = resolvePoiVisualGrammar(VIEWER, loc);
    expect(grammar.curation.levelKey).toBe('poi-3');
    expect(grammar.healthRings).toContain('chain');
    expect(htmlOf(loc)).not.toMatch(RING_HTML_SIGNATURE);
  });

  it('poi-5 (enriched + geoHealth=partial) SÍ pinta contorno', () => {
    const loc = poi({ geoHealth: 'partial', enrichedData });
    const grammar = resolvePoiVisualGrammar(VIEWER, loc);
    expect(grammar.curation.levelKey).toBe('poi-5');
    expect(grammar.levelVisual?.showStateRing).toBe(true);
    expect(grammar.healthRings.length).toBeGreaterThan(0);
    expect(htmlOf(loc)).toMatch(RING_HTML_SIGNATURE);
  });

  it('poi-9 sano (enriched + geoHealth=ok) NO pinta contorno', () => {
    const loc = poi({ geoHealth: 'ok', enrichedData });
    const grammar = resolvePoiVisualGrammar(VIEWER, loc);
    expect(grammar.curation.levelKey).toBe('poi-9');
    expect(grammar.healthRings).toEqual([]);
    expect(htmlOf(loc)).not.toMatch(RING_HTML_SIGNATURE);
  });
});
