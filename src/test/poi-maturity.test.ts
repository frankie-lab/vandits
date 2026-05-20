/**
 * poi-maturity.test.ts — Contract tests para `computePoiMaturity`.
 *
 * Cubre los gates documentados en
 * `docs/contracts/poi-maturity-visual-contract.md` y las reglas DURAS:
 *   - coords inválidas no pasan de POI-2
 *   - sin raw_geocode no se llega a POI-4
 *   - sin geografía resuelta no se salta a POI-7
 *   - POI completo llega a POI-10
 */
import { describe, it, expect } from 'vitest';
import {
  computePoiMaturity,
  type PoiMaturityInput,
} from '@/domains/content/lib/poi-maturity';

const LONG_DESC =
  'Bonito mirador con vistas panorámicas sobre la bahía y el casco antiguo, popular al atardecer.';
const LONG_OBS =
  'Visitado en verano de 2024 — recomendado al atardecer; aparcamiento limitado, mejor llegar pronto.';

function poi(extra: Partial<PoiMaturityInput> = {}): PoiMaturityInput {
  return { ...extra };
}

describe('computePoiMaturity — ladder POI-0…POI-10', () => {
  it('POI-0: ni nombre validado ni coordenadas presentes', () => {
    expect(computePoiMaturity(null)).toBe(0);
    expect(computePoiMaturity(undefined)).toBe(0);
    expect(computePoiMaturity(poi({}))).toBe(0);
    expect(computePoiMaturity(poi({ name: '' }))).toBe(0);
    expect(computePoiMaturity(poi({ name: 'sin nombre' }))).toBe(0);
  });

  it('POI-1: solo coordenadas (sin nombre validado)', () => {
    expect(
      computePoiMaturity(poi({ latitude: 40.4, longitude: -3.7 })),
    ).toBe(1);
    // También cuenta como POI-1 aunque las coords sean inválidas, mientras
    // haya algo en lat/lng — "solo coordenadas presentes".
    expect(
      computePoiMaturity(poi({ latitude: 0, longitude: 0 })),
    ).toBe(1);
    // Acepta coordinates{} además de latitude/longitude.
    expect(
      computePoiMaturity(poi({ coordinates: { lat: 41.0, lng: 2.0 } })),
    ).toBe(1);
  });

  it('POI-2: solo nombre (sin coordenadas presentes)', () => {
    expect(computePoiMaturity(poi({ name: 'Faro de Cabo' }))).toBe(2);
  });

  it('POI-2: nombre + coordenadas inválidas (Null Island) NO pasa de POI-2', () => {
    expect(
      computePoiMaturity(
        poi({ name: 'Faro de Cabo', latitude: 0, longitude: 0 }),
      ),
    ).toBe(2);
    // Fuera de rango.
    expect(
      computePoiMaturity(
        poi({ name: 'Faro de Cabo', latitude: 999, longitude: -3.7 }),
      ),
    ).toBe(2);
    // NaN.
    expect(
      computePoiMaturity(
        poi({ name: 'Faro de Cabo', latitude: Number.NaN, longitude: 2 }),
      ),
    ).toBe(2);
  });

  it('POI-3: nombre + coordenadas WGS84 válidas', () => {
    expect(
      computePoiMaturity(
        poi({ name: 'Faro de Cabo', latitude: 43.7, longitude: -7.5 }),
      ),
    ).toBe(3);
  });

  it('POI enriched sin raw_geocode no puede ser POI-10 (queda en POI-3)', () => {
    const level = computePoiMaturity(
      poi({
        name: 'Faro de Cabo',
        latitude: 43.7,
        longitude: -7.5,
        country: 'España',
        continent: 'Europa',
        region: 'Galicia',
        zone: 'A Coruña',
        enrichedData: {
          descripcion: LONG_DESC,
          imagen: 'https://example.org/img.jpg',
          categoria: 'Mirador',
          etiquetas: ['costa', 'atardecer'],
          observacion: LONG_OBS,
        },
        geoHealth: 'ok',
        enrichmentStatus: 'enriched',
      }),
    );
    expect(level).toBe(3);
    expect(level).toBeLessThan(10);
  });

  it('POI-4: identidad confirmada (raw_geocode poblado)', () => {
    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
        }),
      ),
    ).toBe(4);
  });

  it('POI con descripción pero sin geografía validada no salta niveles', () => {
    // Tiene descripción larga y media, pero NO país/continente → debe
    // quedarse antes de POI-7 (concretamente en POI-4 por gate de país).
    const level = computePoiMaturity(
      poi({
        name: 'Faro de Cabo',
        latitude: 43.7,
        longitude: -7.5,
        rawGeocode: { place_id: 42 },
        enrichedData: {
          descripcion: LONG_DESC,
          imagen: 'https://example.org/img.jpg',
          categoria: 'Mirador',
          etiquetas: ['costa'],
          observacion: LONG_OBS,
        },
        geoHealth: 'ok',
        enrichmentStatus: 'enriched',
      }),
    );
    expect(level).toBe(4);
    expect(level).toBeLessThan(7);
  });

  it('POI-5: país o continente resuelto', () => {
    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
          country: 'España',
        }),
      ),
    ).toBe(5);
  });

  it('POI-5: placeholder "(sin país)" no cuenta como país resuelto', () => {
    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
          country: '(sin país)',
        }),
      ),
    ).toBe(4);
  });

  it('POI-6: región o zona resuelta', () => {
    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
          country: 'España',
          region: 'Galicia',
        }),
      ),
    ).toBe(6);
  });

  it('POI-7: descripción enriquecida verificable', () => {
    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
          country: 'España',
          region: 'Galicia',
          enrichedData: { descripcion: LONG_DESC },
        }),
      ),
    ).toBe(7);
  });

  it('POI-7 NO se otorga si la descripción es placeholder evasivo del LLM', () => {
    const level = computePoiMaturity(
      poi({
        name: 'Faro de Cabo',
        latitude: 43.7,
        longitude: -7.5,
        rawGeocode: { place_id: 42 },
        country: 'España',
        region: 'Galicia',
        enrichedData: {
          descripcion:
            'No se puede generar una descripción verificable para este lugar.',
        },
      }),
    );
    expect(level).toBe(6);
  });

  it('POI-8: media validada (imagen IA o photos[])', () => {
    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
          country: 'España',
          region: 'Galicia',
          enrichedData: {
            descripcion: LONG_DESC,
            imagen: 'https://example.org/img.jpg',
          },
        }),
      ),
    ).toBe(8);

    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
          country: 'España',
          region: 'Galicia',
          enrichedData: { descripcion: LONG_DESC },
          photos: ['/uploads/1.jpg'],
        }),
      ),
    ).toBe(8);
  });

  it('POI-9: categoría o tags validados', () => {
    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
          country: 'España',
          region: 'Galicia',
          enrichedData: {
            descripcion: LONG_DESC,
            imagen: 'https://example.org/img.jpg',
            categoria: 'Mirador',
            etiquetas: ['costa', 'atardecer'],
          },
        }),
      ),
    ).toBe(9);
  });

  it('POI-10: POI completo (geoHealth=ok + enriched + observación)', () => {
    expect(
      computePoiMaturity(
        poi({
          name: 'Faro de Cabo',
          latitude: 43.7,
          longitude: -7.5,
          rawGeocode: { place_id: 42 },
          country: 'España',
          continent: 'Europa',
          region: 'Galicia',
          zone: 'A Coruña',
          geoHealth: 'ok',
          enrichmentStatus: 'enriched',
          enrichedData: {
            descripcion: LONG_DESC,
            imagen: 'https://example.org/img.jpg',
            categoria: 'Mirador',
            etiquetas: ['costa', 'atardecer'],
            observacion: LONG_OBS,
          },
        }),
      ),
    ).toBe(10);
  });

  it('POI-10 NO se otorga si geoHealth ≠ ok', () => {
    const level = computePoiMaturity(
      poi({
        name: 'Faro de Cabo',
        latitude: 43.7,
        longitude: -7.5,
        rawGeocode: { place_id: 42 },
        country: 'España',
        region: 'Galicia',
        geoHealth: 'partial',
        enrichmentStatus: 'enriched',
        enrichedData: {
          descripcion: LONG_DESC,
          imagen: 'https://example.org/img.jpg',
          categoria: 'Mirador',
          etiquetas: ['costa'],
          observacion: LONG_OBS,
        },
      }),
    );
    expect(level).toBe(9);
  });

  it('Acepta forma snake_case (raw_geocode, geo_health, enrichment_status, enriched_data)', () => {
    const level = computePoiMaturity({
      name: 'Faro de Cabo',
      latitude: 43.7,
      longitude: -7.5,
      raw_geocode: { place_id: 42 },
      country: 'España',
      region: 'Galicia',
      geo_health: 'ok',
      enrichment_status: 'enriched',
      enriched_data: {
        descripcion: LONG_DESC,
        imagen: 'https://example.org/img.jpg',
        categoria: 'Mirador',
        etiquetas: ['costa'],
        observacion: LONG_OBS,
      },
    } as PoiMaturityInput);
    expect(level).toBe(10);
  });

  it('Pureza: misma entrada → mismo nivel', () => {
    const sample = poi({
      name: 'Faro',
      latitude: 43.7,
      longitude: -7.5,
      rawGeocode: { p: 1 },
      country: 'España',
      region: 'Galicia',
      enrichedData: { descripcion: LONG_DESC },
    });
    expect(computePoiMaturity(sample)).toBe(computePoiMaturity(sample));
});

describe('computePoiMaturity — techo por flag custom_data.geo_resolution.status', () => {
  // POI base que SIN flag llegaría a POI-10.
  function fullyCurated(): PoiMaturityInput {
    return poi({
      name: 'Faro de Cabo',
      latitude: 43.7,
      longitude: -7.5,
      rawGeocode: { place_id: 42 },
      country: 'España',
      continent: 'Europa',
      region: 'Galicia',
      zone: 'A Coruña',
      geoHealth: 'ok',
      enrichmentStatus: 'enriched',
      enrichedData: {
        descripcion: LONG_DESC,
        imagen: 'https://example.org/img.jpg',
        categoria: 'Mirador',
        etiquetas: ['costa', 'atardecer'],
        observacion: LONG_OBS,
      },
    });
  }

  it('sin customData → sin techo (POI-10)', () => {
    expect(computePoiMaturity(fullyCurated())).toBe(10);
  });

  it('pending_review → techo POI-4', () => {
    const loc = { ...fullyCurated(), customData: { geo_resolution: { status: 'pending_review' } } };
    expect(computePoiMaturity(loc)).toBe(4);
  });

  it('needs_name_fix → techo POI-3', () => {
    const loc = { ...fullyCurated(), customData: { geo_resolution: { status: 'needs_name_fix' } } };
    expect(computePoiMaturity(loc)).toBe(3);
  });

  it('needs_coord_fix → techo POI-2', () => {
    const loc = { ...fullyCurated(), customData: { geo_resolution: { status: 'needs_coord_fix' } } };
    expect(computePoiMaturity(loc)).toBe(2);
  });

  it('geo_irrecoverable → POI-1 fijo', () => {
    const loc = { ...fullyCurated(), customData: { geo_resolution: { status: 'geo_irrecoverable' } } };
    expect(computePoiMaturity(loc)).toBe(1);
  });

  it('snake_case custom_data también aplica techo', () => {
    const loc = { ...fullyCurated(), custom_data: { geo_resolution: { status: 'pending_review' } } };
    expect(computePoiMaturity(loc)).toBe(4);
  });

  it('techo NO eleva: si ladder es POI-2, flag pending_review (techo 4) lo deja en POI-2', () => {
    const loc: PoiMaturityInput = {
      name: 'Faro',
      latitude: 0,
      longitude: 0, // Null Island → ladder = POI-2
      customData: { geo_resolution: { status: 'pending_review' } },
    };
    expect(computePoiMaturity(loc)).toBe(2);
  });

  it('status desconocido → sin techo', () => {
    const loc = { ...fullyCurated(), customData: { geo_resolution: { status: 'something_else' } } };
    expect(computePoiMaturity(loc)).toBe(10);
  });

  it('geo_resolution mal formado (no object) → ignorado, sin techo', () => {
    const loc = { ...fullyCurated(), customData: { geo_resolution: 'pending_review' } as unknown as Record<string, unknown> };
    expect(computePoiMaturity(loc)).toBe(10);
  });

  it('reinyección: borrar el flag (custom_data sin geo_resolution) restaura ladder libre', () => {
    const base = fullyCurated();
    const flagged = { ...base, customData: { geo_resolution: { status: 'geo_irrecoverable' } } };
    expect(computePoiMaturity(flagged)).toBe(1);
    const unflagged = { ...base, customData: {} as Record<string, unknown> };
    expect(computePoiMaturity(unflagged)).toBe(10);
  });
});

import { ceilingFromGeoResolutionStatus } from '@/domains/content/lib/poi-maturity';

describe('ceilingFromGeoResolutionStatus', () => {
  it('mapea los 4 status canónicos al techo correcto', () => {
    expect(ceilingFromGeoResolutionStatus('geo_irrecoverable')).toBe(1);
    expect(ceilingFromGeoResolutionStatus('needs_coord_fix')).toBe(2);
    expect(ceilingFromGeoResolutionStatus('needs_name_fix')).toBe(3);
    expect(ceilingFromGeoResolutionStatus('pending_review')).toBe(4);
  });

  it('null / undefined / desconocido → 10 (sin techo)', () => {
    expect(ceilingFromGeoResolutionStatus(null)).toBe(10);
    expect(ceilingFromGeoResolutionStatus(undefined)).toBe(10);
    expect(ceilingFromGeoResolutionStatus('resolved')).toBe(10);
    expect(ceilingFromGeoResolutionStatus('')).toBe(10);
  });
});
