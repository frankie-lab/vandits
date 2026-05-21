/**
 * CANON ABSOLUTO (v1.3.10) — Marker fill = `poi.maturity[N]` para TODO POI propio.
 *
 * Regla DURA: el fill del disco (SVG `<circle>` o CSS background en micro)
 * de un POI propio coincide EXACTAMENTE con `getPoiMaturityColor(loc).fill`
 * en los 4 modos de render (micro/compact/standard/rich). Ningún path
 * legacy (`poi.state.*`, `poi.level.*`, `entry.fill_color`, `getPointVisualState`)
 * puede contaminar el fill propio.
 *
 * Cobertura adicional (negativos):
 *   - collection tint NO cambia el fill (sigue presente como aro exterior);
 *   - health rings NO cambian el fill;
 *   - selección/focus NO cambian el fill (halo externo, no mezcla color);
 *   - followed/app/source no se ven afectados (gramática propia, no maturity).
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
import { getPoiMaturityColor } from '@/domains/content/lib/poi-maturity-color';

const VIEWER = '11111111-1111-1111-1111-111111111111';
const OTHER  = '22222222-2222-2222-2222-222222222222';
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

function htmlOf(
  loc: GeoLocation,
  opts: { selected?: boolean; focused?: boolean; tint?: string | null; viewer?: string | null } = {},
): string {
  const icon = createCustomIcon(
    !!opts.selected,
    !!opts.focused,
    false,
    loc,
    0,
    false,
    opts.tint ?? null,
    true,
    opts.viewer === undefined ? VIEWER : opts.viewer,
  ) as any;
  return String(icon?.options?.html ?? '');
}

// Niveles que dispara el fixture (suficientes para cubrir las 3 bandas
// cromáticas: gris→amarillo→ámbar→verde) sin depender del techo
// `custom_data.geo_resolution` interno.
const ownSamples: Array<[string, Record<string, unknown>]> = [
  ['POI-1a (sin enrich + geo nula)',     { geoHealth: null }],
  ['POI-1b (sin enrich + geo ok)',        { geoHealth: 'ok' }],
  ['POI-3  (sin enrich + geo broken)',    { geoHealth: 'broken' }],
  ['POI-5  (enriched + geo partial)',     { geoHealth: 'partial', enrichedData }],
  ['POI-9  (enriched + geo ok)',          { geoHealth: 'ok', enrichedData }],
  ['POI-10 (enriched + visited + rated)', { geoHealth: 'ok', enrichedData, customData: { visited: 'true', user_rating: '5' } }],
];

describe('CANON ABSOLUTO — own POI fill = poi.maturity[N] en los 4 modos', () => {
  beforeEach(() => clearPoiSourceCache());

  describe('MICRO (z≤5) — CSS background del dot', () => {
    beforeEach(() => setCurrentZoom(4));

    it.each(ownSamples)('%s usa poi.maturity[N]', (_label, extra) => {
      const loc = poi(extra);
      const { fill } = getPoiMaturityColor(loc);
      const html = htmlOf(loc);
      expect(html).toContain(`background:${fill}`);
    });
  });

  describe('COMPACT (z6–8) — SVG circle fill plano', () => {
    beforeEach(() => setCurrentZoom(7));

    it.each(ownSamples)('%s usa poi.maturity[N]', (_label, extra) => {
      const loc = poi(extra);
      const { fill } = getPoiMaturityColor(loc);
      const html = htmlOf(loc);
      // En compact `skipGradient=true` → fill directo en el `<circle>`.
      expect(html).toContain(`fill="${fill}"`);
    });
  });

  describe('STANDARD (z9–11) — SVG circle con gradiente derivado', () => {
    beforeEach(() => setCurrentZoom(10));

    it.each(ownSamples)('%s usa poi.maturity[N] como stop final del gradiente', (_label, extra) => {
      const loc = poi(extra);
      const { fill } = getPoiMaturityColor(loc);
      const html = htmlOf(loc);
      // El gradiente cierra en `baseColor` (stop offset 100%). Ese stop
      // SIEMPRE es `poi.maturity[N]` para POIs propios.
      expect(html).toContain(`stop-color:${fill}`);
    });
  });

  describe('RICH (z≥12) — dot canónico + polaroid encima', () => {
    beforeEach(() => setCurrentZoom(14));

    it.each(ownSamples)('%s usa poi.maturity[N] en el dot bajo la polaroid', (_label, extra) => {
      const loc = poi(extra);
      const { fill } = getPoiMaturityColor(loc);
      const html = htmlOf(loc);
      expect(html).toContain(`stop-color:${fill}`);
      // La polaroid usa --marker-state-color del mismo `baseColor`.
      expect(html).toContain(`--marker-state-color:${fill}`);
    });
  });

  describe('Invariantes negativas — nada sustituye ni tapa el fill POI-N', () => {
    beforeEach(() => setCurrentZoom(10));

    it('collection tint se renderiza como aro exterior y NO cambia el fill', () => {
      const loc = poi({ geoHealth: 'ok', enrichedData });
      const { fill } = getPoiMaturityColor(loc);
      const html = htmlOf(loc, { tint: '#ff00ff' });
      expect(html).toContain('collection-tint-ring');
      expect(html).toContain('--collection-tint:#ff00ff');
      // Fill del disco intacto.
      expect(html).toContain(`stop-color:${fill}`);
    });

    it('health rings (poi-5) se apilan por fuera y NO cambian el fill', () => {
      const loc = poi({ geoHealth: 'partial', enrichedData });
      const { fill } = getPoiMaturityColor(loc);
      const html = htmlOf(loc);
      expect(html).toContain(`stop-color:${fill}`);
    });

    it('isSelected NO cambia el fill (halo externo only)', () => {
      const loc = poi({ geoHealth: 'ok', enrichedData });
      const { fill } = getPoiMaturityColor(loc);
      const html = htmlOf(loc, { selected: true });
      expect(html).toContain(`stop-color:${fill}`);
    });

    it('isFocused NO cambia el fill (halo externo only)', () => {
      const loc = poi({ geoHealth: 'ok', enrichedData });
      const { fill } = getPoiMaturityColor(loc);
      // focused fuerza rich → comprobamos en rich.
      const html = htmlOf(loc, { focused: true });
      expect(html).toContain(`stop-color:${fill}`);
    });
  });

  describe('Followed/app/source — no se ven afectados por POI-N', () => {
    beforeEach(() => setCurrentZoom(10));

    it('followed POI no usa poi.maturity[N] (triángulo invertido con identidad OKLCH)', () => {
      const loc = poi({ ownerUserId: OTHER, enrichedData });
      const { fill } = getPoiMaturityColor(loc);
      const html = htmlOf(loc);
      // El render path followed usa <polygon>, no <circle> con stop-color
      // derivado de maturity.
      expect(html).toContain('<polygon');
      // El stop-color del gradiente de propio no aparece (no hay defs grad).
      expect(html).not.toContain(`stop-color:${fill}`);
    });

    it('app POI usa paleta neutra app, no maturity', () => {
      const loc = poi({ ownerUserId: null, sourceKind: 'app', sourceId: 'vandits-app', groupId: 'g' });
      const html = htmlOf(loc);
      expect(html).toContain('<polygon');
      // App neutral fill no es un hsl(...) derivado de maturity[N] (token distinto).
      expect(html).not.toMatch(/stop-color:hsl\(\d+ \d+% \d+%\)/);
    });

    it('source POI usa paleta neutra source, no maturity', () => {
      const loc = poi({ ownerUserId: null, sourceKind: 'external', sourceId: 'osm' });
      const html = htmlOf(loc);
      expect(html).toContain('<polygon');
      expect(html).not.toMatch(/stop-color:hsl\(\d+ \d+% \d+%\)/);
    });
  });
});
