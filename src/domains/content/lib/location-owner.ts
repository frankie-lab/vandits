/**
 * Owner resolver canónico — fuente de verdad transversal para "¿de quién es
 * este POI?".
 *
 * Regla:
 *   - Fuente preferida: `loc.ownerUserId` (campo canónico, viene de
 *     `locations.owner_user_id`).
 *   - Fallback LEGACY: `loc._docUserId` (anotación derivada del documento
 *     que contiene el POI). Es solo respaldo para datos antiguos donde
 *     `ownerUserId` aún no estaba poblado. NO debe usarse como fuente
 *     primaria en código nuevo.
 *
 * Uso obligatorio: cualquier comparación de ownership (filtro por usuario,
 * propio vs seguido, buckets, sharing boundary, etc.) debe pasar por aquí.
 * Ver `mem://logic/content/location-owner-resolver`.
 */
export function getLocationOwnerUserId(
  loc: {
    ownerUserId?: string | null;
    _docUserId?: string | null;
  } | null | undefined,
): string | null {
  if (!loc) return null;
  return loc.ownerUserId ?? loc._docUserId ?? null;
}

/** Helper directo: ¿el POI pertenece al usuario actual? */
export function isOwnedBy(
  loc: Parameters<typeof getLocationOwnerUserId>[0],
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return getLocationOwnerUserId(loc) === userId;
}
