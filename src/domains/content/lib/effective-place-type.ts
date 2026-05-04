/**
 * Helper ÚNICO para derivar el `PlaceType` efectivo de un `GeoLocation`.
 *
 * Regla transversal: la pestaña "Tipo" del filtro y el matching por `placeType`
 * en el store DEBEN pasar SIEMPRE por `getEffectivePlaceType`. Nunca leer
 * `loc.placeType` directamente para clasificar/filtrar puntos enriquecidos,
 * porque esa columna puede estar vacía mientras `enriched_data.datos_clave.tipo`
 * sí tiene un valor IA.
 *
 * Prioridad:
 *   1. `loc.placeType` (columna canónica de DB)
 *   2. `enriched_data.datos_clave.tipo` → `getPlaceTypeFromTipo`
 *   3. `enriched_data.clasificacion.categoria_principal` → `getPlaceTypeFromCategory`
 */
import {
  type GeoLocation,
  type PlaceType,
  getPlaceTypeFromCategory,
  getPlaceTypeFromTipo,
} from '@/types/location';

export function getEffectivePlaceType(loc: GeoLocation): PlaceType | undefined {
  if (loc.placeType) return loc.placeType;

  const tipo = loc.enrichedData?.datos_clave?.tipo;
  if (tipo && typeof tipo === 'string' && tipo.trim()) {
    return getPlaceTypeFromTipo(tipo);
  }

  const categoria =
    (loc.enrichedData?.clasificacion as { categoria_principal?: string } | undefined)
      ?.categoria_principal;
  if (categoria && categoria.trim()) {
    return getPlaceTypeFromCategory(categoria);
  }

  return undefined;
}
