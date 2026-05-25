/**
 * PR-EXPORT-6 — Fixture canónica POI urbano simple para tests GuruMaps.
 *
 * Estatua de Mazinger Z (Mazinger Park, Cabezo de Tarifa, Galicia). POI
 * enriched ligero: highlight + descripción corta + tags + web oficial.
 * Sirve para validar el renderer plain-text móvil-first.
 */

import type { GeoLocation } from '@/types/location';

export const MAZINGER_OWNER = 'user-vandits-owner';

export function makeMazingerZFixture(
  overrides: Partial<GeoLocation> = {},
): GeoLocation {
  return {
    id: 'poi-mazinger-z',
    name: 'Estatua de Mazinger Z',
    coordinates: { lat: 42.2706, lng: -8.0628 },
    visibility: 'public',
    ownerUserId: MAZINGER_OWNER,
    country: 'España',
    region: 'Galicia',
    zone: 'Pontevedra',
    localidad: 'Cabral',
    placeType: 'monument',
    geoHealth: 'ok',
    isApproved: true,
    enrichmentStatus: 'enriched',
    customData: {
      collection: 'Curiosidades',
      visited: 'true',
    },
    enrichedData: {
      verified: true,
      verification_notes: '',
      categoria: 'curiosidad urbana',
      clasificacion: {
        categoria_principal: 'Curiosidad urbana',
        subcategoria: 'Estatua',
        tipo_especifico: 'Réplica de personaje',
        codigo: '7.1.2',
      },
      nombre_lugar: 'Estatua de Mazinger Z',
      localizacion: 'Cabral, Vigo, Galicia',
      descripcion:
        'Réplica a tamaño real (10 metros) del robot Mazinger Z erigida en el Parque do Pailón. Construida por vecinos en homenaje a la serie de animación japonesa.',
      punto_destacado: 'El único Mazinger Z gigante de Europa.',
      etiquetas: ['anime', 'robot', 'estatua', 'curiosidad'],
      etiquetas_personales: ['favorito'],
      etiquetas_geograficas: ['galicia'],
      datos_geograficos: {
        continente: 'Europa',
        pais: 'España',
        admin_nivel_1: 'Galicia',
        admin_nivel_2: 'Pontevedra',
        localidad: 'Cabral',
      },
      datos_clave: {
        tipo: 'estatua',
        web_referencia: 'https://www.turismo.gal/mazinger-z',
      },
      fuentes: ['https://es.wikipedia.org/wiki/Mazinger_Z_(estatua)'],
      indice_interes: 4,
      imagen: 'https://upload.wikimedia.org/wikipedia/commons/mazinger.jpg',
      imagen_fuente: 'Wikimedia Commons',
    },
    createdAt: new Date('2024-06-15T10:00:00Z'),
    updatedAt: new Date('2024-06-15T10:00:00Z'),
    ...overrides,
  } as GeoLocation;
}
