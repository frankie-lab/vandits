/**
 * poi-maturity-color.test.ts — Contract tests para `getPoiMaturityColor`
 * (Fase 1 del canon v3, `docs/contracts/marker-fill-canon-v3.md`).
 *
 * Invariantes:
 *   - Para cada nivel POI-0..POI-10, `fill` = `hsl(<token poi.maturity.N>)`.
 *   - El techo por flag `custom_data.geo_resolution.status` se respeta
 *     (heredado de `computePoiMaturity` v2).
 *   - Sin flag → ladder libre.
 *   - El helper NO depende de `getPointVisualState` (no se importa ni
 *     directa ni transitivamente desde este test).
 */

import { describe, it, expect } from 'vitest';
import { getPoiMaturityColor } from '@/domains/content/lib/poi-maturity-color';
import { tokens } from '@/design-system/tokens';
import type { PoiMaturityInput, PoiMaturityLevel } from '@/domains/content/lib/poi-maturity';

const palette = tokens.poi.maturity as unknown as Record<string, string>;

const hslFor = (lvl: PoiMaturityLevel) => `hsl(${palette[String(lvl)]})`;

// ─────────────────────────────────────────────────────────────────────
// Fixtures: una entrada por cada nivel del ladder libre (sin flag).
// ─────────────────────────────────────────────────────────────────────

const empty: PoiMaturityInput = {};
const onlyCoords: PoiMaturityInput = { latitude: 42.1, longitude: -1.2 };
const onlyName: PoiMaturityInput = { name: 'Sin coords' };
const nameAndValidCoords: PoiMaturityInput = {
  name: 'Castillo',
  latitude: 42.1,
  longitude: -1.2,
};
const withRawGeocode: PoiMaturityInput = {
  ...nameAndValidCoords,
  raw_geocode: { display_name: 'x' },
};
const withCountry: PoiMaturityInput = { ...withRawGeocode, country: 'España' };
const withRegion: PoiMaturityInput = { ...withCountry, region: 'Aragón' };
const longDescription =
  'Castillo medieval del siglo XII situado sobre una roca caliza, con torre del homenaje cuadrada y patio de armas restaurado en el siglo XIX.';
const withDescription: PoiMaturityInput = {
  ...withRegion,
  enriched_data: { descripcion: longDescription },
};
const withMedia: PoiMaturityInput = {
  ...withRegion,
  enriched_data: { descripcion: longDescription, imagen: 'https://x/y.jpg' },
};
const withCategory: PoiMaturityInput = {
  ...withMedia,
  enriched_data: {
    descripcion: longDescription,
    imagen: 'https://x/y.jpg',
    categoria: 'castillo',
  },
};
const fullyCurated: PoiMaturityInput = {
  ...withCategory,
  geo_health: 'ok',
  enrichment_status: 'enriched',
  enriched_data: {
    descripcion: longDescription,
    imagen: 'https://x/y.jpg',
    categoria: 'castillo',
    observacion: 'Visitado en otoño 2024, vistas al valle al amanecer.',
  },
};

describe('getPoiMaturityColor — fill por nivel POI-N (ladder libre)', () => {
  const cases: Array<[string, PoiMaturityInput, PoiMaturityLevel]> = [
    ['POI-0  empty',                empty,               0],
    ['POI-1  solo coordenadas',     onlyCoords,          1],
    ['POI-2  solo nombre',          onlyName,            2],
    ['POI-3  nombre + coords WGS84', nameAndValidCoords, 3],
    ['POI-4  + raw_geocode',        withRawGeocode,      4],
    ['POI-5  + país',               withCountry,         5],
    ['POI-6  + región',             withRegion,          6],
    ['POI-7  + descripción IA',     withDescription,     7],
    ['POI-8  + media',              withMedia,           8],
    ['POI-9  + categoría/tags',     withCategory,        9],
    ['POI-10 curado completo',      fullyCurated,        10],
  ];

  it.each(cases)('%s → fill = poi.maturity.<level>', (_label, loc, expected) => {
    const result = getPoiMaturityColor(loc);
    expect(result.level).toBe(expected);
    expect(result.fill).toBe(hslFor(expected));
  });
});

describe('getPoiMaturityColor — techo por flag geo_resolution', () => {
  it('geo_irrecoverable → POI-1 fijo y color POI-1, ignorando ladder superior', () => {
    const loc: PoiMaturityInput = {
      ...fullyCurated,
      custom_data: { geo_resolution: { status: 'geo_irrecoverable' } },
    };
    const result = getPoiMaturityColor(loc);
    expect(result.level).toBe(1);
    expect(result.fill).toBe(hslFor(1));
  });

  it('needs_coord_fix → techo POI-2', () => {
    const loc: PoiMaturityInput = {
      ...fullyCurated,
      custom_data: { geo_resolution: { status: 'needs_coord_fix' } },
    };
    const result = getPoiMaturityColor(loc);
    expect(result.level).toBe(2);
    expect(result.fill).toBe(hslFor(2));
  });

  it('needs_name_fix → techo POI-3', () => {
    const loc: PoiMaturityInput = {
      ...fullyCurated,
      custom_data: { geo_resolution: { status: 'needs_name_fix' } },
    };
    const result = getPoiMaturityColor(loc);
    expect(result.level).toBe(3);
    expect(result.fill).toBe(hslFor(3));
  });

  it('pending_review → techo POI-4', () => {
    const loc: PoiMaturityInput = {
      ...fullyCurated,
      custom_data: { geo_resolution: { status: 'pending_review' } },
    };
    const result = getPoiMaturityColor(loc);
    expect(result.level).toBe(4);
    expect(result.fill).toBe(hslFor(4));
  });

  it('sin flag → ladder libre alcanza POI-10', () => {
    const result = getPoiMaturityColor(fullyCurated);
    expect(result.level).toBe(10);
    expect(result.fill).toBe(hslFor(10));
  });

  it('status desconocido → sin techo (ladder libre)', () => {
    const loc: PoiMaturityInput = {
      ...fullyCurated,
      custom_data: { geo_resolution: { status: 'foo_bar_unknown' } },
    };
    const result = getPoiMaturityColor(loc);
    expect(result.level).toBe(10);
    expect(result.fill).toBe(hslFor(10));
  });
});

describe('getPoiMaturityColor — entradas degeneradas', () => {
  it('null → POI-0 / color POI-0', () => {
    const result = getPoiMaturityColor(null);
    expect(result.level).toBe(0);
    expect(result.fill).toBe(hslFor(0));
  });

  it('undefined → POI-0 / color POI-0', () => {
    const result = getPoiMaturityColor(undefined);
    expect(result.level).toBe(0);
    expect(result.fill).toBe(hslFor(0));
  });
});
