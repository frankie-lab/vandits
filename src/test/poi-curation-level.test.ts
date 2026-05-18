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

  it('POI-9: enriched + visited + sin rating → primaryAction=none (no botón redundante)', () => {
    // P-POI-CURATION-2: las 5 estrellas SON la acción; el footer no
    // emite "Valorar experiencia". `bodyBlocker='rate'`.
    const v = getPoiCurationLevel(
      loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true' } }),
    );
    expect(v.level).toBe(9);
    expect(v.healthState).toBe('green');
    expect(v.shareability).toBe('yes');
    expect(v.primaryAction).toBe('none');
    expect(v.bodyBlocker).toBe('rate');
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

describe('P-POI-CURATION-2 — subestados + bodyBlocker', () => {
  it('POI-1a (geo sin validar): bodyBlocker=validate-geo + primaryAction=validate-geo', () => {
    for (const geo of [null, 'empty', 'stale_name'] as const) {
      const v = getPoiCurationLevel(loc({ geoHealth: geo }));
      expect(v.level).toBe(1);
      expect(v.bodyBlocker).toBe('validate-geo');
      expect(v.primaryAction).toBe('validate-geo');
    }
  });

  it('POI-1b (geo OK, sin enrich): bodyBlocker=enrich-from-context + primaryAction=none', () => {
    const v = getPoiCurationLevel(loc({ geoHealth: 'ok' }));
    expect(v.level).toBe(1);
    expect(v.bodyBlocker).toBe('enrich-from-context');
    expect(v.primaryAction).toBe('none');
  });

  it('POI-0: bodyBlocker=name', () => {
    const v = getPoiCurationLevel(loc({ name: '', geoHealth: null }));
    expect(v.bodyBlocker).toBe('name');
    expect(v.primaryAction).toBe('name');
  });

  it('POI-3: bodyBlocker=resolve-conflict', () => {
    const v = getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'broken' }));
    expect(v.bodyBlocker).toBe('resolve-conflict');
    expect(v.primaryAction).toBe('resolve-conflict');
  });

  it('POI-5: bodyBlocker=heal', () => {
    const v = getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'partial' }));
    expect(v.bodyBlocker).toBe('heal');
    expect(v.primaryAction).toBe('heal');
  });

  it('POI-9a (no visitado): bodyBlocker=rate + primaryAction=none', () => {
    const v = getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'ok' }));
    expect(v.level).toBe(9);
    expect(v.bodyBlocker).toBe('rate');
    expect(v.primaryAction).toBe('none');
  });

  it('POI-10: bodyBlocker=none', () => {
    const v = getPoiCurationLevel(
      loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true', user_rating: '5' } }),
    );
    expect(v.bodyBlocker).toBe('none');
    expect(v.primaryAction).toBe('none');
  });

  it('invariante R3: primaryAction ∈ {bodyBlocker, "none"} para todos los niveles', () => {
    const cases = [
      loc({ name: '', geoHealth: null }),
      loc({ geoHealth: null }),
      loc({ geoHealth: 'ok' }),
      loc({ enrichedData: enriched(), geoHealth: 'broken' }),
      loc({ enrichedData: enriched(), geoHealth: 'partial' }),
      loc({ enrichedData: enriched(), geoHealth: 'ok' }),
      loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true' } }),
      loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true', user_rating: '5' } }),
    ];
    for (const l of cases) {
      const v = getPoiCurationLevel(l);
      expect([v.bodyBlocker, 'none']).toContain(v.primaryAction);
    }
  });
});

describe('PR-MAP-CANON-3 — levelKey (SoT visual del mapa)', () => {
  it('POI-0 → poi-0', () => {
    expect(getPoiCurationLevel(loc({ name: '', geoHealth: null })).levelKey).toBe('poi-0');
  });

  it.each(['null', 'empty', 'stale_name', 'partial'] as const)(
    'POI-1 con geoHealth=%s → poi-1a',
    (g) => {
      const geo = g === 'null' ? null : (g as GeoLocation['geoHealth']);
      expect(getPoiCurationLevel(loc({ geoHealth: geo })).levelKey).toBe('poi-1a');
    },
  );

  it('POI-1 con geoHealth=ok → poi-1b', () => {
    expect(getPoiCurationLevel(loc({ geoHealth: 'ok' })).levelKey).toBe('poi-1b');
  });

  it('POI-3 (broken) → poi-3', () => {
    expect(getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'broken' })).levelKey).toBe('poi-3');
  });

  it('POI-5 (enriched + partial) → poi-5', () => {
    expect(getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'partial' })).levelKey).toBe('poi-5');
  });

  it('POI-9 (enriched sano sin rating) → poi-9', () => {
    expect(getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'ok' })).levelKey).toBe('poi-9');
  });

  it('POI-10 (enriched + visited + rated) → poi-10', () => {
    expect(
      getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true', user_rating: '5' } })).levelKey,
    ).toBe('poi-10');
  });

  it('levelKey NO se deriva de bodyBlocker: misma key para variantes de POI-9', () => {
    const a = getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'ok' }));
    const b = getPoiCurationLevel(loc({ enrichedData: enriched(), geoHealth: 'ok', customData: { visited: 'true' } }));
    expect(a.bodyBlocker).toBe('rate');
    expect(b.bodyBlocker).toBe('rate');
    expect(a.levelKey).toBe('poi-9');
    expect(b.levelKey).toBe('poi-9');
  });
});
