/**
 * geo-health — Helper único de "salud apta para compartir/exportar".
 *
 * Single source of truth para cualquier check de tipo "este POI tiene la
 * geografía suficientemente sana como para mostrarse a terceros". Hoy el
 * criterio canónico es `geo_health = 'ok'`. Si en el futuro aparecen más
 * buckets aceptables (p.ej. `ok_with_partial_admin3`), el cambio se hace
 * SOLO aquí — todos los call-sites (sharing, export, admin) lo heredan.
 *
 * No confundir con `getPointHealthRings`, que es operativo (qué arreglar)
 * y vive en el dominio del owner. `isHealthyShareableGeo` es la frontera
 * de publicación.
 *
 * Ver `mem://logic/sharing/curated-only-rule` y
 * `mem://logic/content/healthy-shareable-geo`.
 */

import type { GeoLocation } from '@/types/location';

export function isHealthyShareableGeo(
  loc: Pick<GeoLocation, 'geoHealth'> | null | undefined,
): boolean {
  if (!loc) return false;
  return loc.geoHealth === 'ok';
}
