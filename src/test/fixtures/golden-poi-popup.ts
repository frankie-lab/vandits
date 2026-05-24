/**
 * P-POPUP-15 — Golden POI popup fixture.
 *
 * Esta fixture es la REFERENCIA CANÓNICA del popup de un POI de usuario.
 * Representa un POI completo que ejercita TODOS los slots del composer
 * canónico (`createPopupContent` → shell único P-POPUP-13):
 *
 *   1. Hero (imagen del POI)
 *   2. Título (nombre canónico enriched)
 *   3. Breadcrumb territorial (P-POPUP-9, global→local con underline)
 *   4. Metadata line (collections + source)
 *   5. Entradilla (`punto_destacado`)
 *   6. Descripción (`descripcion`)
 *   7. Ratings 14.2 (Row 1 IA + Row 2 personal con estado)
 *   8. Taxonomía editorial (clasificación + etiquetas)
 *   9. Secundarios discretos (`observacion`, `datos_clave`)
 *  10. Footer persistente (`data-popup-footer="v1"`)
 *
 * Contrato (P-POPUP-15):
 *   - Cualquier POI de usuario usa el MISMO shell que esta fixture.
 *   - Si faltan datos, los slots se omiten — el shell NO cambia.
 *   - No existen variantes visuales legacy por estado enriched/no-enriched.
 *
 * Si en el futuro un POI vuelve a mostrar UI legacy, `popup-golden-poi-
 * contract.test.ts` debe fallar.
 *
 * NO TOCAR sin actualizar también:
 *   - docs/contracts/popup-contract.md § "Golden POI popup"
 *   - mem://style/popup/golden-poi-reference
 */
import type { GeoLocation, EnrichedLocationData } from '@/types/location';
import type { PopupOwnership } from '@/components/map/map-popups';

const GOLDEN_ENRICHED: EnrichedLocationData = {
  verified: true,
  verification_notes: 'Validado contra Wikidata + Wikipedia ES.',
  categoria: 'Monumento histórico',
  clasificacion: {
    categoria_principal: '2. Entidades construidas',
    subcategoria: '2.1 Edificio',
    tipo_especifico: '2.1.1 Monumento',
    codigo: '2.1.1',
  },
  nombre_lugar: 'Catedral de Santiago de Compostela',
  localizacion: 'Plaza del Obradoiro, Santiago de Compostela, A Coruña',
  descripcion:
    'Catedral románica iniciada en 1075 sobre el sepulcro atribuido al Apóstol Santiago. ' +
    'Final del Camino de Santiago y uno de los conjuntos monumentales más relevantes de la ' +
    'arquitectura medieval europea, con añadidos góticos, renacentistas y barrocos integrados ' +
    'a lo largo de nueve siglos.',
  punto_destacado:
    'Pórtico de la Gloria, obra cumbre del Maestro Mateo (1188), restaurado entre 2008 y 2018.',
  observacion:
    'El botafumeiro funciona sólo en celebraciones señaladas; consultar calendario antes de visitar.',
  etiquetas: ['románico', 'patrimonio-humanidad', 'camino-de-santiago', 'unesco', 'medieval'],
  etiquetas_personales: ['visita-pendiente', 'fotografía'],
  etiquetas_geograficas: ['galicia', 'a-coruña', 'santiago-de-compostela'],
  datos_geograficos: {
    continente: 'Europa',
    pais: 'España',
    admin_nivel_1: 'Galicia',
    admin_nivel_2: 'A Coruña',
    admin_nivel_3: 'Santiago',
    localidad: 'Santiago de Compostela',
    sublocalidad: 'Casco Histórico',
    coordenadas: '42.880556, -8.544444',
    fuente_geocoding: 'nominatim',
  },
  datos_clave: {
    tipo: 'Catedral',
    dimension_principal: '97m de longitud · 22m de altura nave central',
    acceso: 'Entrada libre · visita guiada al Pórtico de pago',
    estado_proteccion: 'Patrimonio de la Humanidad UNESCO (1985)',
    coordenadas: '42.880556, -8.544444',
    web_referencia: 'https://catedraldesantiago.es',
  },
  fuentes: ['Wikipedia', 'UNESCO', 'Fundación Catedral de Santiago'],
  indice_interes: 5,
  indice_interes_notas: 'Hito europeo de primer orden, alto interés turístico y cultural.',
  imagen: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Catedral_de_Santiago_de_Compostela_2010.jpg/640px-Catedral_de_Santiago_de_Compostela_2010.jpg',
  imagen_fuente: 'Wikimedia Commons',
};

/**
 * POI dorado completo. Ejercita todos los slots del composer canónico.
 */
export const GOLDEN_POI: GeoLocation = {
  id: 'golden-poi-001',
  name: 'Catedral de Santiago de Compostela',
  description: 'Catedral románica final del Camino de Santiago.',
  coordinates: { lat: 42.880556, lng: -8.544444, altitude: 260 },
  continent: 'Europa',
  country: 'España',
  region: 'Galicia',
  zone: 'A Coruña',
  comarca: 'Santiago',
  localidad: 'Santiago de Compostela',
  sublocalidad: 'Casco Histórico',
  placeType: 'monument',
  visibility: 'public',
  customData: {
    visited: 'true',
    visited_verified_at: '2024-09-15T10:30:00.000Z',
    user_rating: '5',
    user_notes: 'Visita inolvidable; volver en festividad del Apóstol.',
  },
  enrichedData: GOLDEN_ENRICHED,
  enrichmentStatus: 'enriched',
  geoHealth: 'ok',
  documentId: 'doc-camino-2024',
  ownerUserId: 'user-golden-owner',
  isApproved: true,
  createdAt: new Date('2024-09-15T09:00:00.000Z'),
  updatedAt: new Date('2024-10-01T12:00:00.000Z'),
};

export const GOLDEN_OWNERSHIP: PopupOwnership = {
  isOwn: true,
  isFollowing: false,
  ownerName: 'Tester Vandits',
  viewerUid: 'user-golden-owner',
};

/**
 * POI degradado: mismo owner / mismo shell, pero SIN enriched_data y sin
 * description, con visited=false. Sirve para verificar que el shell
 * canónico es el mismo y los slots ausentes simplemente se omiten.
 */
export const GOLDEN_POI_DEGRADED: GeoLocation = {
  id: 'golden-poi-degraded-001',
  name: 'POI sin enriquecer',
  coordinates: { lat: 40.0, lng: -3.0 },
  customData: {},
  ownerUserId: 'user-golden-owner',
  isApproved: true,
  createdAt: new Date('2024-09-15T09:00:00.000Z'),
  updatedAt: new Date('2024-09-15T09:00:00.000Z'),
};

/**
 * POI con `visited=true` pero sin `user_rating` — estado intermedio
 * `visited-empty` del bloque ratings (P-POPUP-14.2).
 */
export const GOLDEN_POI_VISITED_UNRATED: GeoLocation = {
  ...GOLDEN_POI,
  id: 'golden-poi-visited-unrated',
  customData: {
    visited: 'true',
    visited_verified_at: '2024-09-15T10:30:00.000Z',
  },
};
