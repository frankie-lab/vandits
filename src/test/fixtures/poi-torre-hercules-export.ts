/**
 * PR-EXPORT-5 — Fixture canónica para tests de paridad popup→export.
 *
 * Torre de Hércules es nuestro POI dorado: enriched completo, geo OK,
 * imagen pública, highlight + descripción larga + observación, jerarquía
 * territorial completa, tags variados y fuentes. Sirve para validar que
 * el export refleja la ficha real del popup.
 */

import type { GeoLocation } from '@/types/location';

export const TORRE_HERCULES_OWNER = 'user-vandits-owner';

export const TORRE_HERCULES_PUBLIC_IMAGE =
  'https://upload.wikimedia.org/wikipedia/commons/torre-hercules.jpg';

export function makeTorreHerculesFixture(
  overrides: Partial<GeoLocation> = {},
): GeoLocation {
  return {
    id: 'poi-torre-hercules',
    name: 'Torre de Hércules',
    coordinates: { lat: 43.3863, lng: -8.4068 },
    visibility: 'public',
    ownerUserId: TORRE_HERCULES_OWNER,
    country: 'España',
    region: 'Galicia',
    zone: 'A Coruña',
    localidad: 'A Coruña',
    placeType: 'monument',
    geoHealth: 'ok',
    isApproved: true,
    enrichmentStatus: 'enriched',
    customData: {
      collection: 'Faros del Atlántico',
      note: 'Subir al atardecer, vistas espectaculares de la bahía.',
      visited: 'true',
      user_rating: '5',
    },
    enrichedData: {
      verified: true,
      verification_notes: '',
      categoria: 'monumento',
      clasificacion: {
        categoria_principal: 'Patrimonio histórico',
        subcategoria: 'Faro romano',
        tipo_especifico: 'Faro patrimonio UNESCO',
        codigo: '2.1.1',
      },
      nombre_lugar: 'Torre de Hércules',
      localizacion: 'A Coruña, Galicia, España',
      descripcion:
        'La Torre de Hércules es el único faro romano del mundo en funcionamiento. Construido en el siglo I d.C., fue declarado Patrimonio de la Humanidad por la UNESCO en 2009. Su silueta de granito domina el cabo y guía a los navegantes desde hace casi dos mil años.',
      punto_destacado: 'Único faro romano en funcionamiento del mundo.',
      observacion: 'Visita guiada disponible los fines de semana.',
      etiquetas: ['faro', 'romano', 'unesco', 'patrimonio'],
      etiquetas_personales: ['favorito', 'familia'],
      etiquetas_geograficas: ['galicia', 'atlántico'],
      datos_geograficos: {
        continente: 'Europa',
        pais: 'España',
        admin_nivel_1: 'Galicia',
        admin_nivel_2: 'A Coruña',
        localidad: 'A Coruña',
        direccion_postal: 'Av. de Navarra, s/n, 15002 A Coruña',
      },
      datos_clave: {
        tipo: 'faro',
        coordenadas: '43.3863, -8.4068',
        web_referencia: 'https://torredeherculesacoruna.com',
        estado_proteccion: 'UNESCO',
      },
      fuentes: [
        'https://es.wikipedia.org/wiki/Torre_de_Hércules',
        'https://whc.unesco.org/en/list/1312',
      ],
      indice_interes: 5,
      imagen: TORRE_HERCULES_PUBLIC_IMAGE,
      imagen_fuente: 'Wikimedia Commons',
    },
    createdAt: new Date('2024-06-15T10:00:00Z'),
    updatedAt: new Date('2024-06-15T10:00:00Z'),
    ...overrides,
  } as GeoLocation;
}
