/**
 * Fixtures mínimos para los tests del contrato PR-EXPORT-1.
 * Construyen POIs por nivel canónico (POI-0/1/1b/3/5/9/10) controlando
 * sólo los campos que los helpers leen.
 */

import type { GeoLocation, EnrichedLocationData } from '@/types/location';

export const OWNER_A = 'user-a';
export const OWNER_B = 'user-b';

const baseCoords = { lat: 41.0, lng: 2.0 };

function makeBase(overrides: Partial<GeoLocation>): GeoLocation {
  return {
    id: overrides.id ?? 'loc-x',
    name: overrides.name ?? 'POI test',
    coordinates: overrides.coordinates ?? baseCoords,
    visibility: 'public',
    ownerUserId: OWNER_A,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as GeoLocation;
}

// Descripción canónica suficientemente larga para superar el umbral de
// `isUnverifiableDescription` (≥60 chars tras strip markdown). Sin frases
// evasivas tipo "no se puede generar", "información no disponible", etc.
const CANONICAL_DESC =
  'Edificio histórico construido en el siglo XVIII, declarado bien de interés cultural y referencia patrimonial de la comarca.';

function enriched(descripcion: string = CANONICAL_DESC): EnrichedLocationData {
  return {
    verified: true,
    verification_notes: '',
    categoria: 'monumento',
    nombre_lugar: 'POI test',
    localizacion: 'Test City',
    descripcion,
    punto_destacado: 'Algo destacado',
    etiquetas: ['historia'],
    datos_clave: { tipo: 'monumento', coordenadas: '41,2' },
    fuentes: ['wiki'],
  };
}

/** POI-0: sin nombre validado, sin enriched. */
export const poi0 = (owner = OWNER_A): GeoLocation => makeBase({
  id: 'poi-0',
  name: 'Sin nombre',
  ownerUserId: owner,
  geoHealth: null,
});

/** POI-1a: nombre OK, geo no validada, sin enriched. */
export const poi1 = (owner = OWNER_A): GeoLocation => makeBase({
  id: 'poi-1',
  name: 'POI imported',
  ownerUserId: owner,
  geoHealth: 'partial',
});

/** POI-1b-editorial: nombre OK, geo OK, sin descripción IA pero CON imagen/snippet. */
export const poi1bEditorial = (owner = OWNER_A): GeoLocation => makeBase({
  id: 'poi-1b',
  name: 'POI editorial',
  ownerUserId: owner,
  geoHealth: 'ok',
  enrichedData: {
    ...enriched(''), // descripcion vacía => no enriched canónico
    descripcion: '',
    imagen: 'https://example.org/img.jpg',
    punto_destacado: 'Editorial snippet',
  },
});

/** POI-3: conflicto geográfico. */
export const poi3 = (owner = OWNER_A): GeoLocation => makeBase({
  id: 'poi-3',
  name: 'POI broken',
  ownerUserId: owner,
  geoHealth: 'broken',
  enrichedData: enriched(),
});

/** POI-5: enriched + deuda geográfica (geoHealth='partial'). */
export const poi5 = (owner = OWNER_A): GeoLocation => makeBase({
  id: 'poi-5',
  name: 'POI partial',
  ownerUserId: owner,
  geoHealth: 'partial',
  enrichedData: enriched(),
});

/** POI-9: enriched + geo ok + no visitado / sin rating. */
export const poi9 = (owner = OWNER_A): GeoLocation => makeBase({
  id: 'poi-9',
  name: 'POI sano',
  ownerUserId: owner,
  geoHealth: 'ok',
  enrichedData: enriched(),
});

/** POI-10: enriched + geo ok + visitado + valorado. */
export const poi10 = (owner = OWNER_A): GeoLocation => makeBase({
  id: 'poi-10',
  name: 'POI golden',
  ownerUserId: owner,
  geoHealth: 'ok',
  enrichedData: enriched(),
  customData: { visited: 'true', user_rating: '5' },
});
