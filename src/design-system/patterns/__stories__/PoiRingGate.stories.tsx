/**
 * TEMP — borrar tras QA PR-MAP-CANON-3.1.
 *
 * Story diagnóstica del gate de health rings.
 * Lista, por fixture sintético: `id`, `levelKey`, `healthRings` (calculados
 * por `getPointHealthRings`) y `renderedRings` (lo que el renderer pintará
 * tras aplicar `levelVisual.showStateRing`). Sirve para identificar qué
 * puntos heredaban contorno antiguo y validar visualmente la regla V1:
 * SOLO `poi-5` mantiene rings.
 *
 * No usa el mapa real: pure data via `resolvePoiVisualGrammar`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { GeoLocation } from '@/types/location';
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

function poi(id: string, extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id,
    name: 'Punto ' + id,
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    visibility: 'public',
    geoHealth: 'ok',
    ownerUserId: VIEWER,
    ...extra,
  } as unknown as GeoLocation;
}

const FIXTURES: Array<{ label: string; loc: GeoLocation }> = [
  { label: 'poi-0 (sin name)', loc: poi('f1', { name: '', geoHealth: null }) },
  { label: 'poi-1a (geoHealth=null)', loc: poi('f2', { geoHealth: null }) },
  { label: 'poi-1a (geoHealth=partial)', loc: poi('f3', { geoHealth: 'partial' }) },
  { label: 'poi-1a (geoHealth=stale_name)', loc: poi('f4', { geoHealth: 'stale_name' }) },
  { label: 'poi-1b (geoHealth=ok, no enriched)', loc: poi('f5', { geoHealth: 'ok' }) },
  { label: 'poi-3 (geoHealth=broken)', loc: poi('f6', { geoHealth: 'broken' }) },
  { label: 'poi-5 (enriched + geoHealth=partial)', loc: poi('f7', { geoHealth: 'partial', enrichedData }) },
  { label: 'poi-9 (enriched + geoHealth=ok)', loc: poi('f8', { geoHealth: 'ok', enrichedData }) },
  {
    label: 'poi-10 (enriched + visited + rated)',
    loc: poi('f9', {
      geoHealth: 'ok',
      enrichedData,
      customData: { visited: 'true', user_rating: '5' },
    }),
  },
];

function Diagnostics() {
  const rows = FIXTURES.map(({ label, loc }) => {
    const g = resolvePoiVisualGrammar(VIEWER, loc);
    const rendered = g.levelVisual?.showStateRing === true ? g.healthRings : [];
    const drift = JSON.stringify(g.healthRings) !== JSON.stringify(rendered);
    return {
      id: loc.id,
      label,
      levelKey: g.curation.levelKey,
      healthRings: g.healthRings,
      renderedRings: rendered,
      drift,
    };
  });
  return (
    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>PoiRingGate · diagnóstico V1</h3>
      <p style={{ color: '#666', maxWidth: 720 }}>
        Solo <code>poi-5</code> debe mostrar rings. Filas con drift (✱) indican
        que la deuda operativa existe pero NO se pinta — comportamiento canónico
        esperado tras PR-MAP-CANON-3.1.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ background: '#f3f3f3', textAlign: 'left' }}>
            <th style={th}>id</th>
            <th style={th}>fixture</th>
            <th style={th}>levelKey</th>
            <th style={th}>healthRings (computed)</th>
            <th style={th}>renderedRings (gate)</th>
            <th style={th}>drift</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ background: r.drift ? '#fff8e1' : 'transparent' }}>
              <td style={td}>{r.id}</td>
              <td style={td}>{r.label}</td>
              <td style={{ ...td, fontWeight: 600 }}>{r.levelKey}</td>
              <td style={td}>{JSON.stringify(r.healthRings)}</td>
              <td style={td}>{JSON.stringify(r.renderedRings)}</td>
              <td style={td}>{r.drift ? '✱' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #ddd' };
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #eee', verticalAlign: 'top' };

const meta: Meta<typeof Diagnostics> = {
  title: 'Diagnostics/PoiRingGate',
  component: Diagnostics,
};
export default meta;

export const Default: StoryObj<typeof Diagnostics> = {};
