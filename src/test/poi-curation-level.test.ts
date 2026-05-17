/**
 * P-POI-CURATION-1 — Tests del helper canónico `getPoiCurationLevel`.
 *
 * Verifica los 6 niveles canónicos (0, 1, 3, 5, 9, 10), la regla de
 * prioridad descendente y la coherencia con `isShareablePoi`.
 */
import { describe, it, expect } from 'vitest';
import type { GeoLocation, EnrichedLocationData } from '@/types/location';
import {
  getPoiCurationLevel,
  getPoiPrimaryHealingAction,
  isPoiShareable,
} from '@/domains/content/lib/poi-curation-level';
import { isShareablePoi } from '@/domains/content/lib/is-shareable-poi';

const LONG_DESC =
  'Descripción suficientemente larga para superar cualquier umbral de validación; ' +
  'incluye contexto histórico, geográfico y cultural para evitar marcas unverifiable.';

function enriched(extra: Partial<EnrichedLocationData> = {}): EnrichedLocationData {
  return {
    verified: true,
    verification_notes: 'ok',
    categoria: 'Monumento',
    nombre_lugar: 'Lugar',
    localizacion: 'x',
    descripcion: LONG_DESC,
    punto_destacado: 'x',
    etiquetas: [],
    datos_clave: { tipo: 'monument', coordenadas: '0,0' },
    fuentes: [],
    ...extra,
  } as EnrichedLocationData;
}

function loc(p: Partial<GeoLocation> = {}): GeoLocation {
  return {
    id: p.id ?? 'x',
    name: p.name ?? 'Un POI',
    coordinates: p.coordinates ?? { lat: 0, lng: 0 },
    createdAt: p.createdAt ?? new Date(),
    updatedAt: p.updatedAt ?? new Date(),
    visibility: p.visibility ?? 'public',
    geoHealth: p.geoHealth ?? 'ok',
    customData: p.customData ?? {},
    ...p,
  } as GeoLocation;
}

describe('getPoiCurationLevel — 6 niveles canónicos', () => {
  it('POI-0: sólo coordenadas, sin nombre validado', () => {
    const v = getPoiCurationLevel(loc({ name: '', geoHealth: null }));
    expect(v.level).toBe(0);
    expect(v.healthState).toBe('red');
    expect(v.shareability).toBe('no');
    expect(v.primaryAction).toBe('name');
  });

  it('POI-0: name = "Sin nombre" → POI-0', () => {
    const v = getPoiCurationLevel(loc({ name: 'Sin nombre', geoHealth: null }));
    expect(v.level).toBe(0);
  });

  it('POI-1: coords + nombre, geografía sin validar', () => {
    const v = getPoiCurationLevel(loc({ name: 'Lugar', geoHealth: null }));
    expect(v.level).toBe(1);
    expect(v.healthState).toBe('red');
    expect(v.primaryAction).toBe('validate-geo');
  });

  it('POI-1: geoHealth empty / stale_name también caen aquí', () => {
    expect(getPoiCurationLevel(loc({ geoHealth: 'empty' })).level).toBe(1);
    expect(getPoiCurationLevel(loc({ geoHealth: 'stale_name' })).level).toBe(1);
  });

  it('POI-3: conflicto geográfico (broken) tiene PRIORIDAD sobre enriched', () => {
    const v = getPoiCurationLevel(
      loc({ geoHealth: 'broken', enrichedData: enriched(), customData: { visited: 'true', user_rating: '5' } }),
    );
    expect(v.level).toBe(3);
    expect(v.healthState).toBe('red');
    expect(v.primaryAction).toBe('resolve-conflict');
  });

  it('POI-5: enriquecido pero geoHealth=partial → deuda', () => {
    const v = getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'partial' }));
    expect(v.level).toBe(5);
    expect(v.healthState).toBe('yellow');
    expect(v.shareability).toBe('limited');
    expect(v.primaryAction).toBe('heal');
  });

  it('POI-9: enriched + geo ok + sin rings + NO visitado → sano, sin acción', () => {
    // Regla canónica: visited/user_rating son estado personal, no salud.
    // Un POI enriched + sano sin visita NO es POI-5 y NO emite "heal".
    const v = getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'ok' }));
    expect(v.level).toBe(9);
    expect(v.healthState).toBe('green');
    expect(v.shareability).toBe('yes');
    expect(v.primaryAction).toBe('none');
  });

  it('POI-9: enriched + visited + sin rating', () => {
    const v = getPoiCurationLevel(
      loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true' } }),
    );
    expect(v.level).toBe(9);
    expect(v.healthState).toBe('green');
    expect(v.shareability).toBe('yes');
    expect(v.primaryAction).toBe('rate-experience');
  });

  it('POI-10: enriched + visited + rated → estado final', () => {
    const v = getPoiCurationLevel(
      loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true', user_rating: '5' } }),
    );
    expect(v.level).toBe(10);
    expect(v.healthState).toBe('green');
    expect(v.shareability).toBe('yes');
    expect(v.primaryAction).toBe('none');
  });
});

describe('getPoiCurationLevel — robustez', () => {
  it('null/undefined → POI-0', () => {
    expect(getPoiCurationLevel(null).level).toBe(0);
    expect(getPoiCurationLevel(undefined).level).toBe(0);
  });

  it('user_rating="0" no cuenta como rating válido', () => {
    const v = getPoiCurationLevel(
      loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true', user_rating: '0' } }),
    );
    expect(v.level).toBe(9);
  });
});

describe('getPoiPrimaryHealingAction — mapping inverso', () => {
  it.each([
    [0, 'name'],
    [1, 'validate-geo'],
    [3, 'resolve-conflict'],
    [5, 'heal'],
    [9, 'rate-experience'],
    [10, 'none'],
  ] as const)('POI-%i → %s', (lvl, action) => {
    expect(getPoiPrimaryHealingAction(lvl)).toBe(action);
  });
});

describe('isPoiShareable — mapping derivado', () => {
  it.each([
    [0, 'no'],
    [1, 'no'],
    [3, 'no'],
    [5, 'limited'],
    [9, 'yes'],
    [10, 'yes'],
  ] as const)('POI-%i → %s', (lvl, sh) => {
    expect(isPoiShareable(lvl)).toBe(sh);
  });
});

describe('Coherencia con isShareablePoi (frontera canónica)', () => {
  it('POI-10 ⇒ isShareablePoi=true', () => {
    const l = loc({
      enrichedData: enriched(),
      geoHealth: 'ok',
      visibility: 'public',
      customData: { visited: 'true', user_rating: '5' },
    });
    expect(getPoiCurationLevel(l).shareability).toBe('yes');
    expect(isShareablePoi(l)).toBe(true);
  });

  it('POI-9 ⇒ isShareablePoi=true', () => {
    const l = loc({
      enrichedData: enriched(),
      geoHealth: 'ok',
      visibility: 'public',
      customData: { visited: 'true' },
    });
    expect(getPoiCurationLevel(l).shareability).toBe('yes');
    expect(isShareablePoi(l)).toBe(true);
  });

  it('POI-3 ⇒ isShareablePoi=false (geo broken)', () => {
    const l = loc({
      enrichedData: enriched(),
      geoHealth: 'broken',
      visibility: 'public',
    });
    expect(getPoiCurationLevel(l).shareability).toBe('no');
    expect(isShareablePoi(l)).toBe(false);
  });

  it('POI-1 ⇒ isShareablePoi=false (no enriched)', () => {
    const l = loc({ geoHealth: null });
    expect(getPoiCurationLevel(l).shareability).toBe('no');
    expect(isShareablePoi(l)).toBe(false);
  });
});
