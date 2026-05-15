/**
 * Registro transversal del foco de "Contexto cercano".
 *
 * Cuando el usuario selecciona un resultado en el panel inline de
 * Contexto cercano, se marca su `id` aquí. El renderer de popup
 * (`createPopupContent`) lee este registro para ocultar bloques
 * irrelevantes en ese contexto (Visitado/estrellas, hashtags,
 * coordenadas, "Datos adicionales").
 *
 * Cualquier otra apertura de popup (click directo en marker, foco
 * normal) NO toca este registro y sigue mostrando todo.
 */
let nearbyContextId: string | null = null;

export function setNearbyPopupContextId(id: string | null) {
  nearbyContextId = id;
}

export function getNearbyPopupContextId(): string | null {
  return nearbyContextId;
}

export function isNearbyPopupContext(locationId: string): boolean {
  return nearbyContextId !== null && nearbyContextId === locationId;
}
